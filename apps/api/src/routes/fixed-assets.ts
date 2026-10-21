import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { fixedAssetSchema, depreciationRunSchema, type DepreciationRunResult, type FixedAsset, type FixedAssetRegister } from "@shopbooks/shared";
import { accounts, fixedAssets } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import type { Ctx } from "../lib/context";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Stmt } from "../lib/batch";
import { vJson } from "../lib/validate";
import { assertReconcilable, DEPRECIATION_ACCOUNTS, ensureAccount } from "../services/ledger-accounts";
import { accumulatedAt, lastDepreciableMonth, monthEnd, monthlyCharge } from "../services/fixed-assets";
import { Tx } from "../services/tx";

const app = new Hono<AppEnv>();
const view = requirePerm("accounting.view");
const manage = requirePerm("accounting.manage");

type AssetRow = typeof fixedAssets.$inferSelect;

function mapAsset(r: AssetRow, accountName: string): FixedAsset {
  return {
    id: r.id,
    name: r.name,
    accountId: r.accountId,
    accountName,
    paidFromAccountId: r.paidFromAccountId,
    acquiredOn: r.acquiredOn,
    cost: r.cost,
    salvage: r.salvage,
    usefulLifeMonths: r.usefulLifeMonths,
    accumulated: r.accumulated,
    netBookValue: r.cost - r.accumulated,
    depreciatedThrough: r.depreciatedThrough,
    monthlyCharge: monthlyCharge(r.cost, r.salvage, r.usefulLifeMonths),
  };
}

async function activeAccount(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.businessId, ctx.businessId), eq(accounts.id, id)));
  if (!row) throw notFound("Account");
  if (!row.isActive) throw badRequest(`${row.code} ${row.name} is inactive`);
  return row;
}

app.get("/", view, async (c) => {
  const ctx = c.get("ctx");
  const rows = await ctx.db
    .select({ asset: fixedAssets, accountName: accounts.name })
    .from(fixedAssets)
    .innerJoin(accounts, eq(accounts.id, fixedAssets.accountId))
    .where(eq(fixedAssets.businessId, ctx.businessId))
    .orderBy(fixedAssets.acquiredOn);
  const list = rows.map((r) => mapAsset(r.asset, r.accountName));
  const register: FixedAssetRegister = {
    rows: list,
    totalCost: list.reduce((s, a) => s + a.cost, 0),
    totalAccumulated: list.reduce((s, a) => s + a.accumulated, 0),
    totalNetBookValue: list.reduce((s, a) => s + a.netBookValue, 0),
  };
  return c.json(register);
});

app.post("/", manage, vJson(fixedAssetSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const asset = await activeAccount(ctx, input.accountId);
  if (asset.type !== "asset" || asset.subtype !== "fixed_asset") throw badRequest("The asset account must be a fixed asset account");
  const paidFrom = await activeAccount(ctx, input.paidFromAccountId);
  const payable = paidFrom.type === "liability" || (paidFrom.type === "asset" && (paidFrom.subtype === "cash" || paidFrom.subtype === "bank"));
  if (!payable) throw badRequest("Pay from a cash, bank or liability account");

  const id = newId();
  const tx = new Tx(ctx);
  tx.journal({
    date: input.acquiredOn,
    memo: `Fixed asset · ${input.name}`,
    sourceType: "manual",
    lines: [
      { accountId: asset.id, debit: input.cost },
      { accountId: paidFrom.id, credit: input.cost },
    ],
  });
  tx.add(
    ctx.db.insert(fixedAssets).values({
      id,
      businessId: ctx.businessId,
      name: input.name,
      accountId: asset.id,
      paidFromAccountId: paidFrom.id,
      acquiredOn: input.acquiredOn,
      cost: input.cost,
      salvage: input.salvage,
      usefulLifeMonths: input.usefulLifeMonths,
      accumulated: 0,
      depreciatedThrough: null,
      createdAt: ctx.now,
    }) as unknown as Stmt,
  );
  tx.audit("fixed_asset.create", `Fixed asset ${input.name} (${input.cost})`, "fixed_asset", id);
  await tx.commit();
  const [row] = await ctx.db.select().from(fixedAssets).where(eq(fixedAssets.id, id));
  return c.json(mapAsset(row!, asset.name), 201);
});

/**
 * Posts depreciation for every asset up to the end of the last full month before `throughDate`, as one journal.
 * Running it again for the same date posts nothing new.
 */
app.post("/depreciate", manage, vJson(depreciationRunSchema), async (c) => {
  const ctx = c.get("ctx");
  const { throughDate } = c.req.valid("json");
  if (throughDate > ctx.today) throw badRequest("Depreciation can't run beyond today");
  const lastMonth = lastDepreciableMonth(throughDate);
  const through = monthEnd(lastMonth);
  const assets = await ctx.db
    .select()
    .from(fixedAssets)
    .where(eq(fixedAssets.businessId, ctx.businessId));

  const tx = new Tx(ctx);
  const expense = await ensureAccount(ctx, tx, DEPRECIATION_ACCOUNTS.expense);
  const accumulated = await ensureAccount(ctx, tx, DEPRECIATION_ACCOUNTS.accumulated);
  let total = 0;
  let count = 0;
  for (const a of assets) {
    const amount = accumulatedAt(a, lastMonth) - a.accumulated;
    if (amount <= 0) continue;
    total += amount;
    count += 1;
    tx.add(
      ctx.db
        .update(fixedAssets)
        .set({ accumulated: a.accumulated + amount, depreciatedThrough: through })
        .where(eq(fixedAssets.id, a.id)) as unknown as Stmt,
    );
  }
  let journalId: string | null = null;
  if (total > 0) {
    journalId = tx.journal({
      date: throughDate,
      memo: `Depreciation to ${through} · ${count} asset${count === 1 ? "" : "s"}`,
      sourceType: "manual",
      lines: [
        { accountId: expense, debit: total },
        { accountId: accumulated, credit: total },
      ],
    });
    tx.audit("fixed_asset.depreciate", `Depreciation to ${through}: ${total} across ${count} asset(s)`, "journal", journalId);
    await tx.commit();
  }
  const result: DepreciationRunResult = { throughDate, amount: total, assets: count, journalId };
  return c.json(result, total > 0 ? 201 : 200);
});

export default app;
