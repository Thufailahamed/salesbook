import { and, asc, eq, gt, lte, max, sql, type SQL } from "drizzle-orm";
import { addDays, daysBetween, type DeadStockReport, type ExpiryReport } from "@shopbooks/shared";
import { invoiceLines, invoices, locations, products, stockLots, variants } from "../db/schema";
import type { Ctx } from "../lib/context";
import { num } from "./reports-utils";
import { displayName } from "./stock";
import { stockRows } from "./reports-inventory";

/** Stock that has expired or expires within `days` days, earliest first. */
export async function expiryReport(ctx: Ctx, opts: { locationId?: string; days: number }): Promise<ExpiryReport> {
  const horizon = addDays(ctx.today, opts.days);
  const conds: SQL[] = [
    eq(stockLots.businessId, ctx.businessId),
    gt(stockLots.quantity, 0),
    sql`${stockLots.expiryDate} <> ''`,
    lte(stockLots.expiryDate, horizon),
  ];
  if (opts.locationId) conds.push(eq(stockLots.locationId, opts.locationId));
  const found = await ctx.db
    .select({
      variantId: stockLots.variantId,
      locationId: stockLots.locationId,
      expiryDate: stockLots.expiryDate,
      quantity: stockLots.quantity,
      productName: products.name,
      variantName: variants.name,
      sku: variants.sku,
      costPrice: variants.costPrice,
      locationName: locations.name,
    })
    .from(stockLots)
    .innerJoin(variants, eq(variants.id, stockLots.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(locations, eq(locations.id, stockLots.locationId))
    .where(and(...conds))
    .orderBy(asc(stockLots.expiryDate), asc(products.name));

  const rows = found.map((r) => {
    const daysLeft = daysBetween(ctx.today, r.expiryDate);
    return {
      variantId: r.variantId,
      displayName: displayName(r.productName, r.variantName),
      sku: r.sku,
      locationId: r.locationId,
      locationName: r.locationName,
      expiryDate: r.expiryDate,
      daysLeft,
      quantity: Math.round(r.quantity * 1000) / 1000,
      value: Math.round(r.quantity * r.costPrice),
      status: daysLeft < 0 ? ("expired" as const) : ("expiring" as const),
    };
  });
  const expired = rows.filter((r) => r.status === "expired");
  const expiring = rows.filter((r) => r.status === "expiring");
  return {
    asOf: ctx.today,
    days: opts.days,
    rows,
    expiredCount: expired.length,
    expiredValue: expired.reduce((s, r) => s + r.value, 0),
    expiringCount: expiring.length,
    expiringValue: expiring.reduce((s, r) => s + r.value, 0),
  };
}

/** Items in stock that haven't sold since `days` days ago (or ever). Slowest sellers last. */
export async function deadStockReport(ctx: Ctx, opts: { locationId?: string; days: number }): Promise<DeadStockReport> {
  const cutoff = addDays(ctx.today, -opts.days);
  const lastSales = await ctx.db
    .select({ variantId: invoiceLines.variantId, lastSoldOn: max(invoices.date) })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
    .where(
      and(
        eq(invoiceLines.businessId, ctx.businessId),
        eq(invoices.kind, "sale"),
        eq(invoices.status, "completed"),
      ),
    )
    .groupBy(invoiceLines.variantId);
  const lastSold = new Map(lastSales.filter((r) => r.variantId).map((r) => [r.variantId!, r.lastSoldOn ?? null]));

  const stock = await stockRows(ctx, { locationId: opts.locationId, mode: "nonzero" });
  const rows = stock
    .filter((r) => r.quantity > 0)
    .map((r) => ({
      variantId: r.variantId,
      displayName: displayName(r.productName, r.variantName),
      sku: r.sku,
      categoryName: r.categoryName,
      quantity: r.quantity,
      value: r.value,
      lastSoldOn: lastSold.get(r.variantId) ?? null,
    }))
    .filter((r) => !r.lastSoldOn || r.lastSoldOn < cutoff)
    // Never sold first, then by how long ago they last sold.
    .sort((a, b) => (a.lastSoldOn ?? "").localeCompare(b.lastSoldOn ?? "") || b.value - a.value);

  return {
    asOf: ctx.today,
    days: opts.days,
    rows,
    totalQuantity: Math.round(rows.reduce((s, r) => s + r.quantity, 0) * 1000) / 1000,
    totalValue: rows.reduce((s, r) => s + num(r.value), 0),
  };
}
