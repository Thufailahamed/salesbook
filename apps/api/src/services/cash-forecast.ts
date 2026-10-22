/**
 * Cash forecast for the next four weeks. The numbers are rules over the books: cash and bank balances, open customer
 * invoices and supplier bills by due date, and typical sales and spending from recent history. Nothing is assumed
 * beyond those rules. The model (when configured and switched on) only writes a short note about the numbers.
 */
import { and, eq, gt, gte, lte, sql } from "drizzle-orm";
import { addDays, currencyDecimals, daysBetween, toMajor, type CashForecast, type CashForecastWeek } from "@shopbooks/shared";
import { expenses, invoices, purchases } from "../db/schema";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { aiOn, chatText } from "./ai-gateway";
import { accountSums, loadAccounts } from "./reports-utils";

const WEEKS = 4;
const SALES_DAYS = 30;
const SPEND_DAYS = 90;
const CASH_SUBTYPES = new Set(["cash", "bank"]);

export async function cashForecast(ctx: Ctx, env: Env): Promise<CashForecast> {
  const today = ctx.today;
  const horizonEnd = addDays(today, WEEKS * 7 - 1);
  const weekIndex = (due: string | null, fallback: string): number => {
    const days = daysBetween(today, due ?? fallback);
    if (days < 0) return 0; // overdue: assume it lands in the first week
    if (days > WEEKS * 7 - 1) return -1;
    return Math.floor(days / 7);
  };

  const [accs, sums, openInvoices, openBills, spend, sales] = await Promise.all([
    loadAccounts(ctx),
    accountSums(ctx, { to: today }),
    ctx.db
      .select({ date: invoices.date, dueDate: invoices.dueDate, due: invoices.amountDue })
      .from(invoices)
      .where(and(eq(invoices.businessId, ctx.businessId), eq(invoices.status, "completed"), gt(invoices.amountDue, 0))),
    ctx.db
      .select({
        date: sql<string>`coalesce(${purchases.receivedDate}, ${purchases.orderDate})`,
        dueDate: purchases.dueDate,
        due: purchases.amountDue,
      })
      .from(purchases)
      .where(and(eq(purchases.businessId, ctx.businessId), eq(purchases.status, "received"), gt(purchases.amountDue, 0))),
    ctx.db
      .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.businessId, ctx.businessId),
          eq(expenses.status, "posted"),
          gte(expenses.date, addDays(today, -SPEND_DAYS)),
          lte(expenses.date, today),
        ),
      ),
    ctx.db
      .select({ total: sql<number>`coalesce(sum(${invoices.amountPaid}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.businessId, ctx.businessId),
          eq(invoices.status, "completed"),
          gte(invoices.date, addDays(today, -SALES_DAYS)),
          lte(invoices.date, today),
        ),
      ),
  ]);

  const openingCash = accs
    .filter((a) => CASH_SUBTYPES.has(a.subtype))
    .reduce((sum, a) => {
      const s = sums.get(a.id);
      return sum + (s ? s.debit - s.credit : 0);
    }, 0);

  const weekly = (total: number, days: number) => Math.round((Number(total) / days) * 7);
  const salesWeekly = weekly(Number(sales[0]?.total ?? 0), SALES_DAYS);
  const spendWeekly = weekly(Number(spend[0]?.total ?? 0), SPEND_DAYS);

  const buckets = Array.from({ length: WEEKS }, () => ({ collections: 0, bills: 0 }));
  for (const d of openInvoices) {
    const i = weekIndex(d.dueDate, d.date);
    if (i >= 0) buckets[i].collections += Number(d.due);
  }
  for (const d of openBills) {
    const i = weekIndex(d.dueDate, d.date);
    if (i >= 0) buckets[i].bills += Number(d.due);
  }

  let running = openingCash;
  const weeks: CashForecastWeek[] = buckets.map((b, i) => {
    const from = addDays(today, i * 7);
    running += b.collections + salesWeekly - b.bills - spendWeekly;
    return {
      from,
      to: addDays(from, 6),
      collections: b.collections,
      salesReceipts: salesWeekly,
      bills: b.bills,
      expenses: spendWeekly,
      endingCash: running,
    };
  });
  const low = weeks.reduce((m, w) => (w.endingCash < m.endingCash ? w : m), weeks[0]);

  const forecast: CashForecast = {
    asOf: today,
    openingCash,
    weeks,
    lowest: { from: low.from, amount: low.endingCash },
    summary: null,
  };

  if (aiOn(ctx, env, "cashForecast") && env.AI_CASHFLOW_MODEL) {
    const decimals = currencyDecimals(ctx.business.currency);
    const money = (minor: number) => `${ctx.business.currency} ${toMajor(minor, decimals).toFixed(decimals)}`;
    const facts = [
      `Cash and bank today: ${money(openingCash)}`,
      ...weeks.map(
        (w, i) =>
          `Week ${i + 1} (${w.from} to ${w.to}): money in ${money(w.collections + w.salesReceipts)}, money out ${money(w.bills + w.expenses)}, cash at end of week ${money(w.endingCash)}`,
      ),
    ];
    forecast.summary = await chatText(env, env.AI_CASHFLOW_MODEL, [
      {
        role: "system",
        content: [
          "You write a short cash-flow note for a shop owner.",
          "Use ONLY the lines given. Write 2 or 3 short sentences:",
          "whether cash stays above zero over the four weeks, which week is the lowest, and what it depends on.",
          "Do not give advice beyond that, and do not add numbers that are not in the lines.",
        ].join("\n"),
      },
      { role: "user", content: facts.join("\n") },
    ]);
  }
  return forecast;
}
