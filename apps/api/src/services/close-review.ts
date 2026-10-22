/**
 * Pre-close review of a period. The checks are fixed rules over the books; nothing here is decided by a model.
 * The model (when configured) only writes a short summary of the findings the rules produced.
 */
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { addDays, currencyDecimals, startOfMonth, toMajor, type CloseFinding, type CloseReview } from "@shopbooks/shared";
import { accounts, bankStatementLines, expenses, journalEntries, journalLines } from "../db/schema";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { aiGatewayReady, chatText } from "./ai-gateway";
import { receivablesAging } from "./reports-finance";
import { salesTotals } from "./reports-sales";

const SEVERITY_ORDER = { high: 0, medium: 1, info: 2 } as const;

/** Period to review: since the last close (or the start of this month), up to yesterday. */
export function reviewPeriod(ctx: Ctx, input: { from?: string; to?: string }) {
  const to = input.to ?? addDays(ctx.today, -1);
  if (to >= ctx.today) throw badRequest("Review a period that ends before today");
  const from = input.from ?? (ctx.business.booksClosedThrough ? addDays(ctx.business.booksClosedThrough, 1) : startOfMonth(to));
  if (from > to) throw badRequest("The period starts after it ends");
  return { from, to };
}

export async function reviewClose(ctx: Ctx, env: Env, input: { from?: string; to?: string }): Promise<CloseReview> {
  const { from, to } = reviewPeriod(ctx, input);
  const decimals = currencyDecimals(ctx.business.currency);
  const money = (minor: number) => toMajor(minor, decimals);
  const findings: CloseFinding[] = [];

  // 1. Expenses with the same date, payee and amount (common when a bill is entered twice).
  const dupes = await ctx.db
    .select({ date: expenses.date, payee: expenses.payee, amount: expenses.amount, count: sql<number>`count(*)` })
    .from(expenses)
    .where(
      and(eq(expenses.businessId, ctx.businessId), eq(expenses.status, "posted"), gte(expenses.date, from), lte(expenses.date, to)),
    )
    .groupBy(expenses.date, expenses.payee, expenses.amount)
    .having(sql`count(*) > 1`)
    .orderBy(asc(expenses.date));
  if (dupes.length) {
    const extra = dupes.reduce((sum, d) => sum + (Number(d.count) - 1) * Number(d.amount), 0);
    findings.push({
      id: "duplicate-expenses",
      severity: "high",
      title: "Possible duplicate expenses",
      detail: dupes
        .slice(0, 5)
        .map((d) => `${d.payee || "No payee"} on ${d.date}: ${d.count}× ${money(Number(d.amount))}`)
        .join("; "),
      count: dupes.length,
      amount: money(extra),
    });
  }

  // 2. Bank statement lines that are not matched to a book entry yet.
  const unmatched = await ctx.db
    .select({ amount: bankStatementLines.amount, count: sql<number>`count(*)` })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.businessId, ctx.businessId),
        isNull(bankStatementLines.matchedLineId),
        gte(bankStatementLines.date, from),
        lte(bankStatementLines.date, to),
      ),
    );
  const unmatchedCount = Number(unmatched[0]?.count ?? 0);
  if (unmatchedCount > 0) {
    const sum = await ctx.db
      .select({ total: sql<number>`coalesce(sum(abs(${bankStatementLines.amount})), 0)` })
      .from(bankStatementLines)
      .where(
        and(
          eq(bankStatementLines.businessId, ctx.businessId),
          isNull(bankStatementLines.matchedLineId),
          gte(bankStatementLines.date, from),
          lte(bankStatementLines.date, to),
        ),
      );
    findings.push({
      id: "unmatched-bank-lines",
      severity: "high",
      title: "Bank lines not in the books",
      detail: "Statement lines in this period with no matching entry. Record them, or run Auto-match on the reconcile page.",
      count: unmatchedCount,
      amount: money(Number(sum[0]?.total ?? 0)),
    });
  }

  // 3. Cash and bank entries in the period that are not reconciled yet.
  const bankAccounts = await ctx.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.businessId, ctx.businessId), eq(accounts.type, "asset"), inArray(accounts.subtype, ["cash", "bank"])));
  const bankIds = bankAccounts.map((a) => a.id);
  if (bankIds.length) {
    const uncleared = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(journalLines)
      .where(
        and(
          eq(journalLines.businessId, ctx.businessId),
          inArray(journalLines.accountId, bankIds),
          isNull(journalLines.reconciliationId),
          gte(journalLines.date, from),
          lte(journalLines.date, to),
        ),
      );
    const n = Number(uncleared[0]?.count ?? 0);
    if (n > 0) {
      findings.push({
        id: "unreconciled-bank",
        severity: "medium",
        title: "Bank entries not reconciled",
        detail: "Cash and bank entries in this period that no reconciliation has ticked yet.",
        count: n,
      });
    }
  }

  // 4. Manual journals: fine when expected (e.g. depreciation), worth a look before the period is locked.
  const manual = await ctx.db
    .select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${journalEntries.totalDebit}), 0)` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.businessId, ctx.businessId),
        eq(journalEntries.sourceType, "manual"),
        gte(journalEntries.date, from),
        lte(journalEntries.date, to),
      ),
    );
  const manualCount = Number(manual[0]?.count ?? 0);
  if (manualCount > 0) {
    findings.push({
      id: "manual-journals",
      severity: "info",
      title: "Manual journal entries",
      detail: "Hand-made journals in this period. Check they are intended before locking.",
      count: manualCount,
      amount: money(Number(manual[0]?.total ?? 0)),
    });
  }

  // 5. Customer balances older than 90 days at the end of the period.
  const aging = await receivablesAging(ctx, to);
  if (aging.totals.d90plus > 0) {
    findings.push({
      id: "old-receivables",
      severity: "medium",
      title: "Customer balances over 90 days",
      detail: "Money customers have owed for more than 90 days at the end of the period.",
      count: aging.rows.filter((r) => r.d90plus > 0).length,
      amount: money(aging.totals.d90plus),
    });
  }

  // 6. A period with no sales is often a missed day of entries.
  const sales = await salesTotals(ctx, { from, to });
  if (sales.invoices === 0) {
    findings.push({
      id: "no-sales",
      severity: "info",
      title: "No sales in this period",
      detail: "No invoices were recorded between these dates. Confirm that is right.",
      count: 0,
    });
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  let summary: string | null = null;
  if (aiGatewayReady(env) && env.AI_REVIEW_MODEL) {
    const facts = findings.length
      ? findings.map((f) => `- [${f.severity}] ${f.title}: ${f.detail} (count ${f.count}${f.amount !== undefined ? `, amount ${f.amount}` : ""})`).join("\n")
      : "- No findings.";
    summary = await chatText(env, env.AI_REVIEW_MODEL, [
      {
        role: "system",
        content: [
          "You write a short pre-close review for a shop owner.",
          "Write exactly one bullet per finding given, in the same order. Each bullet says what to check, using that finding only.",
          "Do not add any other checks, advice, or numbers. Do not mention system behaviour or anything not in the findings.",
          `Currency: ${ctx.business.currency}. Amounts are in major units.`,
          findings.length ? "" : "If there are no findings, say the period looks clean.",
        ].join("\n"),
      },
      { role: "user", content: `Period ${from} to ${to}.\nFindings:\n${facts}` },
    ]);
  }

  return { from, to, findings, summary };
}
