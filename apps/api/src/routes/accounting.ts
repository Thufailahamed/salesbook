import { and, desc, eq, gte, inArray, like, lte, lt, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  ACCOUNT_SUBTYPES,
  accountSchema,
  fundsTransferSchema,
  isDebitNormal,
  journalListQuerySchema,
  journalSchema,
  ledgerQuerySchema,
  startOfMonth,
  type AccountType,
  type LedgerEntry,
  type LedgerResponse,
} from "@shopbooks/shared";
import { accounts, journalEntries, journalLines, paymentMethods } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { docDate, type Ctx } from "../lib/context";
import { badRequest, conflict, notFound } from "../lib/errors";
import { likeQ, pageParams, paged } from "../lib/http";
import { newId } from "../lib/ids";
import { vJson, vQuery } from "../lib/validate";
import { getJournalDto, journalSelect, mapAccount, mapJournalEntry } from "../services/accounting-read";
import { accountSums, num, type AccountRow } from "../services/reports-utils";
import { Tx, queueReversals } from "../services/tx";

const app = new Hono<AppEnv>();
const view = requirePerm("accounting.view");
const manage = requirePerm("accounting.manage");

async function getAccountRow(ctx: Ctx, id: string): Promise<AccountRow> {
  const [row] = await ctx.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.businessId, ctx.businessId)));
  if (!row) throw notFound("Account");
  return row;
}

async function accountHasLines(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(journalLines)
    .where(and(eq(journalLines.businessId, ctx.businessId), eq(journalLines.accountId, id)));
  return num(row?.n) > 0;
}

function assertSubtype(type: AccountType, subtype: string) {
  if (!(ACCOUNT_SUBTYPES[type] as readonly string[]).includes(subtype)) {
    throw badRequest(`"${subtype}" is not a valid category for ${type} accounts`);
  }
}

async function assertCodeFree(ctx: Ctx, code: string, exceptId?: string) {
  const [row] = await ctx.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.businessId, ctx.businessId), eq(accounts.code, code)));
  if (row && row.id !== exceptId) throw conflict(`Account code ${code} is already in use`);
}

// ---------------------------------------------------------------- chart of accounts

// Expense categories are expense accounts, so staff who record expenses can read the chart too.
app.get("/accounts", requirePerm("accounting.view", "expenses.manage"), vQuery(z.object({ includeInactive: z.string().optional() })), async (c) => {
  const ctx = c.get("ctx");
  const includeInactive = ["1", "true", "yes"].includes(c.req.valid("query").includeInactive ?? "");
  const conds: SQL[] = [eq(accounts.businessId, ctx.businessId)];
  if (!includeInactive) conds.push(eq(accounts.isActive, true));
  const [rows, sums] = await Promise.all([
    ctx.db.select().from(accounts).where(and(...conds)).orderBy(accounts.code),
    accountSums(ctx, { to: ctx.today }),
  ]);
  return c.json(rows.map((a) => mapAccount(a, sums.get(a.id))));
});

app.post("/accounts", manage, vJson(accountSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  assertSubtype(input.type, input.subtype);
  await assertCodeFree(ctx, input.code);
  const [row] = await ctx.db
    .insert(accounts)
    .values({
      id: newId(),
      businessId: ctx.businessId,
      code: input.code,
      name: input.name,
      type: input.type,
      subtype: input.subtype,
      systemKey: null,
      isSystem: false,
      isActive: input.isActive,
      description: input.description || null,
      createdAt: Date.now(),
    })
    .returning();
  return c.json(mapAccount(row!), 201);
});

app.put("/accounts/:id", manage, vJson(accountSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const acc = await getAccountRow(ctx, c.req.param("id"));
  let patch: Partial<typeof accounts.$inferInsert>;
  if (acc.isSystem) {
    if (input.isActive === false) throw badRequest("System accounts can't be deactivated");
    patch = { name: input.name, description: input.description || null };
  } else {
    assertSubtype(input.type, input.subtype);
    if (input.code !== acc.code) await assertCodeFree(ctx, input.code, acc.id);
    if (input.type !== acc.type && (await accountHasLines(ctx, acc.id))) {
      throw badRequest("The type of an account with postings can't be changed");
    }
    const [usedBy] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.businessId, ctx.businessId), eq(paymentMethods.accountId, acc.id), eq(paymentMethods.isActive, true)));
    if (num(usedBy?.n) > 0 && (input.type !== "asset" || input.isActive === false)) {
      throw badRequest("This account is used by a payment method; it must stay an active asset account");
    }
    patch = {
      code: input.code,
      name: input.name,
      type: input.type,
      subtype: input.subtype,
      description: input.description || null,
      isActive: input.isActive,
    };
  }
  const [row] = await ctx.db.update(accounts).set(patch).where(eq(accounts.id, acc.id)).returning();
  const sums = await accountSums(ctx, { to: ctx.today });
  return c.json(mapAccount(row!, sums.get(acc.id)));
});

app.delete("/accounts/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const acc = await getAccountRow(ctx, c.req.param("id"));
  if (acc.isSystem) throw badRequest("System accounts can't be deleted");
  if (await accountHasLines(ctx, acc.id)) throw badRequest("This account has postings. Deactivate it instead.");
  const [usedBy] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.businessId, ctx.businessId), eq(paymentMethods.accountId, acc.id)));
  if (num(usedBy?.n) > 0) throw badRequest("This account is used by a payment method");
  await ctx.db.delete(accounts).where(eq(accounts.id, acc.id));
  return c.json({ ok: true as const });
});

// ---------------------------------------------------------------- journals

app.get("/journals", view, vQuery(journalListQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(journalEntries.businessId, ctx.businessId)];
  if (q.from) conds.push(gte(journalEntries.date, q.from));
  if (q.to) conds.push(lte(journalEntries.date, q.to));
  if (q.sourceType) conds.push(eq(journalEntries.sourceType, q.sourceType));
  if (q.accountId) {
    conds.push(
      sql`exists (select 1 from ${journalLines} jl where jl.entry_id = ${journalEntries.id} and jl.account_id = ${q.accountId})`,
    );
  }
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(journalEntries.number, term), like(journalEntries.memo, term), like(journalEntries.sourceNumber, term))!);
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    journalSelect(ctx)
      .where(where)
      .orderBy(q.order === "asc" ? journalEntries.date : desc(journalEntries.date), desc(journalEntries.createdAt), desc(journalEntries.number))
      .limit(limit)
      .offset(offset),
    ctx.db.select({ n: sql<number>`count(*)` }).from(journalEntries).where(where),
  ]);
  return c.json(paged(rows.map(mapJournalEntry), num(count?.n), q));
});

app.get("/journals/:id", view, async (c) => c.json(await getJournalDto(c.get("ctx"), c.req.param("id"))));

async function assertActiveAccounts(ctx: Ctx, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = await ctx.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.businessId, ctx.businessId), inArray(accounts.id, unique)));
  if (rows.length !== unique.length) throw badRequest("One of the accounts doesn't exist");
  const inactive = rows.find((r) => !r.isActive);
  if (inactive) throw badRequest(`${inactive.code} ${inactive.name} is inactive`);
  return new Map(rows.map((r) => [r.id, r]));
}

app.post("/journals", manage, vJson(journalSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  await assertActiveAccounts(
    ctx,
    input.lines.map((l) => l.accountId),
  );
  const tx = new Tx(ctx);
  const id = tx.journal({
    date: input.date,
    memo: input.memo,
    sourceType: "manual",
    lines: input.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo ?? null })),
  });
  if (!id) throw badRequest("The entry has no amounts");
  tx.audit("journal.create", `Manual journal: ${input.memo}`, "journal", id);
  await tx.commit();
  return c.json(await getJournalDto(ctx, id), 201);
});

app.post("/journals/:id/reverse", manage, async (c) => {
  const ctx = c.get("ctx");
  const [entry] = await ctx.db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, c.req.param("id")), eq(journalEntries.businessId, ctx.businessId)));
  if (!entry) throw notFound("Journal entry");
  if (!["manual", "transfer"].includes(entry.sourceType)) {
    throw badRequest("Only manual entries and transfers can be reversed here. Void the source document instead.");
  }
  if (entry.reversedById) throw badRequest("This entry has already been reversed");
  if (entry.reversalOfId) throw badRequest("A reversal can't be reversed");
  const tx = new Tx(ctx);
  await queueReversals(ctx, tx, [entry.id], {
    date: ctx.today,
    memo: `Reversal of ${entry.number}`,
    sourceType: "reversal",
    sourceId: entry.id,
    sourceNumber: entry.number,
  });
  tx.audit("journal.reverse", `Reversed journal ${entry.number}`, "journal", entry.id);
  await tx.commit();
  const [rev] = await ctx.db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.businessId, ctx.businessId), eq(journalEntries.reversalOfId, entry.id)));
  return c.json(await getJournalDto(ctx, rev?.id ?? entry.id), 201);
});

app.post("/transfers", manage, vJson(fundsTransferSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const map = await assertActiveAccounts(ctx, [input.fromAccountId, input.toAccountId]);
  for (const acc of map.values()) {
    const ok = (acc.type === "asset" && (acc.subtype === "cash" || acc.subtype === "bank")) || acc.type === "equity";
    if (!ok) throw badRequest(`${acc.name} can't be used for transfers (use a cash, bank or equity account)`);
  }
  const from = map.get(input.fromAccountId)!;
  const to = map.get(input.toAccountId)!;
  const date = docDate(ctx, input.date);
  const tx = new Tx(ctx);
  const id = tx.journal({
    date,
    memo: input.memo?.trim() || `Transfer from ${from.name} to ${to.name}`,
    sourceType: "transfer",
    lines: [
      { accountId: to.id, debit: input.amount },
      { accountId: from.id, credit: input.amount },
    ],
  });
  tx.audit("journal.transfer", `Transfer ${input.amount} from ${from.name} to ${to.name}`, "journal", id);
  await tx.commit();
  return c.json(await getJournalDto(ctx, id!), 201);
});

// ---------------------------------------------------------------- ledger

app.get("/ledger/:accountId", view, vQuery(ledgerQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const acc = await getAccountRow(ctx, c.req.param("accountId"));
  const to = q.to ?? ctx.today;
  const from = q.from ?? startOfMonth(to);
  const debitNormal = isDebitNormal(acc.type as AccountType, acc.subtype);
  const sign = (d: number, cr: number) => (debitNormal ? d - cr : cr - d);

  const [opening] = await ctx.db
    .select({
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .where(and(eq(journalLines.businessId, ctx.businessId), eq(journalLines.accountId, acc.id), lt(journalLines.date, from)));
  const rows = await ctx.db
    .select({ l: journalLines, e: journalEntries })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalLines.businessId, ctx.businessId),
        eq(journalLines.accountId, acc.id),
        gte(journalLines.date, from),
        lte(journalLines.date, to),
      ),
    )
    .orderBy(journalLines.date, journalEntries.createdAt, journalEntries.number);

  const openingBalance = sign(num(opening?.debit), num(opening?.credit));
  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const entries: LedgerEntry[] = rows.map(({ l, e }) => {
    running += sign(l.debit, l.credit);
    totalDebit += l.debit;
    totalCredit += l.credit;
    return {
      lineId: l.id,
      entryId: e.id,
      entryNumber: e.number,
      date: l.date,
      memo: l.memo && l.memo !== e.memo ? `${e.memo} · ${l.memo}` : e.memo,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      debit: l.debit,
      credit: l.credit,
      balance: running,
    };
  });
  const response: LedgerResponse = {
    account: { ...mapAccount(acc), balance: running },
    from,
    to,
    openingBalance,
    entries,
    totalDebit,
    totalCredit,
    closingBalance: running,
  };
  return c.json(response);
});

export default app;
