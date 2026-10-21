import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  bankMatchSchema,
  bankStatementImportSchema,
  bankStatementQuerySchema,
  daysBetween,
  type BankMatchResult,
  type BankStatementView,
} from "@shopbooks/shared";
import { accounts, bankStatementLines, journalLines } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import type { Ctx } from "../lib/context";
import { notFound } from "../lib/errors";
import { insertMany, type Stmt } from "../lib/batch";
import { newId } from "../lib/ids";
import { vJson, vQuery } from "../lib/validate";
import { assertReconcilable } from "../services/ledger-accounts";
import { num } from "../services/reports-utils";
import { Tx } from "../services/tx";

const app = new Hono<AppEnv>();
const view = requirePerm("accounting.view");
const manage = requirePerm("accounting.manage");

/** A statement line and a book line match when the amounts are equal and the dates are within this many days. */
const MATCH_WINDOW_DAYS = 7;

async function reconcilableAccount(ctx: Ctx, id: string) {
  const [acc] = await ctx.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.businessId, ctx.businessId), eq(accounts.id, id)));
  if (!acc) throw notFound("Account");
  assertReconcilable(acc);
  return acc;
}

app.get("/", view, vQuery(bankStatementQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const { accountId } = c.req.valid("query");
  await reconcilableAccount(ctx, accountId);
  const rows = await ctx.db
    .select()
    .from(bankStatementLines)
    .where(and(eq(bankStatementLines.businessId, ctx.businessId), eq(bankStatementLines.accountId, accountId)))
    .orderBy(asc(bankStatementLines.date), asc(bankStatementLines.createdAt));
  const result: BankStatementView = {
    accountId,
    rows: rows.map((r) => ({ id: r.id, date: r.date, description: r.description, amount: r.amount, matched: r.matchedLineId !== null })),
  };
  return c.json(result);
});

/** Adds statement lines. Rows are stored as given; matching is a separate step. */
app.post("/", manage, vJson(bankStatementImportSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  await reconcilableAccount(ctx, input.accountId);
  // Each chunk is its own batch so a large statement stays within D1's statement limits.
  for (let i = 0; i < input.rows.length; i += 250) {
    const tx = new Tx(ctx);
    tx.add(
      ...insertMany(
        ctx.db,
        bankStatementLines,
        input.rows.slice(i, i + 250).map((r) => ({
          id: newId(),
          businessId: ctx.businessId,
          accountId: input.accountId,
          date: r.date,
          description: r.description,
          amount: r.amount,
          matchedLineId: null,
          createdAt: ctx.now,
        })),
      ),
    );
    await tx.commit();
  }
  return c.json({ imported: input.rows.length }, 201);
});

/** Removes statement lines that aren't matched to a book entry yet, so a statement can be re-imported. */
app.delete("/", manage, vQuery(bankStatementQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const { accountId } = c.req.valid("query");
  await reconcilableAccount(ctx, accountId);
  await ctx.db
    .delete(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.businessId, ctx.businessId),
        eq(bankStatementLines.accountId, accountId),
        isNull(bankStatementLines.matchedLineId),
      ),
    );
  return c.json({ ok: true as const });
});

/**
 * Pairs each unmatched statement line with an uncleared book line on the same account that has the same amount and a
 * date within the window. Each book line is used at most once; the earliest statement line wins.
 */
app.post("/match", manage, vJson(bankMatchSchema), async (c) => {
  const ctx = c.get("ctx");
  const { accountId } = c.req.valid("json");
  await reconcilableAccount(ctx, accountId);
  const [statement, books, taken] = await Promise.all([
    ctx.db
      .select()
      .from(bankStatementLines)
      .where(
        and(
          eq(bankStatementLines.businessId, ctx.businessId),
          eq(bankStatementLines.accountId, accountId),
          isNull(bankStatementLines.matchedLineId),
        ),
      )
      .orderBy(asc(bankStatementLines.date)),
    ctx.db
      .select({
        id: journalLines.id,
        date: journalLines.date,
        amount: sql<number>`${journalLines.debit} - ${journalLines.credit}`,
      })
      .from(journalLines)
      .where(
        and(
          eq(journalLines.businessId, ctx.businessId),
          eq(journalLines.accountId, accountId),
          isNull(journalLines.reconciliationId),
        ),
      ),
    ctx.db
      .select({ id: bankStatementLines.matchedLineId })
      .from(bankStatementLines)
      .where(
        and(
          eq(bankStatementLines.businessId, ctx.businessId),
          eq(bankStatementLines.accountId, accountId),
          isNotNull(bankStatementLines.matchedLineId),
        ),
      ),
  ]);

  const usedIds = new Set(taken.map((t) => t.id));
  const byAmount = new Map<number, { id: string; date: string }[]>();
  for (const b of books) {
    if (usedIds.has(b.id)) continue;
    const amount = num(b.amount);
    const list = byAmount.get(amount) ?? [];
    list.push({ id: b.id, date: b.date });
    byAmount.set(amount, list);
  }

  const pairs: { statementId: string; lineId: string }[] = [];
  for (const row of statement) {
    const candidates = byAmount.get(row.amount) ?? [];
    let best = -1;
    let bestGap = Infinity;
    candidates.forEach((cand, i) => {
      const gap = Math.abs(daysBetween(cand.date, row.date));
      if (gap <= MATCH_WINDOW_DAYS && gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    });
    if (best < 0) continue;
    pairs.push({ statementId: row.id, lineId: candidates[best]!.id });
    candidates.splice(best, 1);
  }

  for (let i = 0; i < pairs.length; i += 100) {
    const tx = new Tx(ctx);
    for (const p of pairs.slice(i, i + 100)) {
      tx.add(
        ctx.db
          .update(bankStatementLines)
          .set({ matchedLineId: p.lineId })
          .where(eq(bankStatementLines.id, p.statementId)) as unknown as Stmt,
      );
    }
    await tx.commit();
  }

  const result: BankMatchResult = { matched: pairs.length, unmatched: statement.length - pairs.length };
  return c.json(result);
});

export default app;
