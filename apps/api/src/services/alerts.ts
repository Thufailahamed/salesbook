/**
 * Daily alerts: rules over the books, no model. Each check runs only when the user may see its area, so nothing
 * leaks to people without the permission.
 */
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { addDays, currencyDecimals, toMajor, type DailyAlert } from "@shopbooks/shared";
import { invoices, purchases } from "../db/schema";
import type { Ctx } from "../lib/context";
import { stockRows } from "./reports-inventory";

const SOON_DAYS = 3;

export async function dailyAlerts(ctx: Ctx): Promise<DailyAlert[]> {
  const today = ctx.today;
  const soonEnd = addDays(today, SOON_DAYS);
  const decimals = currencyDecimals(ctx.business.currency);
  const money = (minor: number) => `${ctx.business.currency} ${toMajor(minor, decimals).toFixed(decimals)}`;
  const alerts: DailyAlert[] = [];

  if (ctx.can("sales.view")) {
    const dueDay = sql<string>`coalesce(${invoices.dueDate}, ${invoices.date})`;
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${invoices.amountDue}), 0)`, oldest: sql<string | null>`min(${dueDay})` })
      .from(invoices)
      .where(
        and(
          eq(invoices.businessId, ctx.businessId),
          eq(invoices.status, "completed"),
          gt(invoices.amountDue, 0),
          lte(dueDay, today),
        ),
      );
    const n = Number(row?.n ?? 0);
    if (n > 0) {
      const days = row?.oldest ? Math.max(0, Math.round((Date.parse(today) - Date.parse(row.oldest)) / 86_400_000)) : 0;
      alerts.push({
        kind: "overdue_invoices",
        severity: "urgent",
        title: `${n} ${n === 1 ? "invoice is" : "invoices are"} overdue`,
        detail: `${money(Number(row.total))} still owed, oldest ${days} days past due.`,
        href: "/reports/receivables",
      });
    }
  }

  if (ctx.can("suppliers.view")) {
    const dueDay = sql<string>`coalesce(${purchases.dueDate}, ${purchases.orderDate})`;
    const [overdue, soon] = await Promise.all([
      ctx.db
        .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${purchases.amountDue}), 0)` })
        .from(purchases)
        .where(and(eq(purchases.businessId, ctx.businessId), eq(purchases.status, "received"), gt(purchases.amountDue, 0), lte(dueDay, today))),
      ctx.db
        .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${purchases.amountDue}), 0)` })
        .from(purchases)
        .where(
          and(
            eq(purchases.businessId, ctx.businessId),
            eq(purchases.status, "received"),
            gt(purchases.amountDue, 0),
            gt(dueDay, today),
            lte(dueDay, soonEnd),
          ),
        ),
    ]);
    const nOver = Number(overdue[0]?.n ?? 0);
    const nSoon = Number(soon[0]?.n ?? 0);
    if (nOver > 0) {
      alerts.push({
        kind: "overdue_bills",
        severity: "urgent",
        title: `${nOver} supplier ${nOver === 1 ? "bill is" : "bills are"} overdue`,
        detail: `${money(Number(overdue[0].total))} to pay.`,
        href: "/reports/payables",
      });
    }
    if (nSoon > 0) {
      alerts.push({
        kind: "bills_due_soon",
        severity: "soon",
        title: `${nSoon} supplier ${nSoon === 1 ? "bill is" : "bills are"} due in the next ${SOON_DAYS} days`,
        detail: `${money(Number(soon[0].total))} to pay.`,
        href: "/reports/payables",
      });
    }
  }

  if (ctx.can("inventory.view")) {
    const low = await stockRows(ctx, { mode: "low" });
    if (low.length > 0) {
      const out = low.filter((r) => Number(r.quantity) <= 0).length;
      alerts.push({
        kind: "low_stock",
        severity: "soon",
        title: `${low.length} ${low.length === 1 ? "item is" : "items are"} low on stock`,
        detail: out > 0 ? `${out} already out of stock.` : "Check the reorder advice on the Stock page.",
        href: "/inventory",
      });
    }
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "urgent" ? -1 : 1));
}
