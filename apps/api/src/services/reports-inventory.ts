import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { InventoryValuationReport, StockLevelRow } from "@shopbooks/shared";
import { categories, products, stockLevels, variants } from "../db/schema";
import type { Ctx } from "../lib/context";
import { num } from "./reports-utils";

function stockSubquery(ctx: Ctx, locationId?: string) {
  const conds: SQL[] = [eq(stockLevels.businessId, ctx.businessId)];
  if (locationId) conds.push(eq(stockLevels.locationId, locationId));
  return ctx.db
    .select({
      variantId: stockLevels.variantId,
      qty: sql<number>`sum(${stockLevels.quantity})`.as("qty"),
    })
    .from(stockLevels)
    .where(and(...conds))
    .groupBy(stockLevels.variantId)
    .as("s");
}

/** Stock rows for tracked, standard products (active only unless `includeInactive`). */
export async function stockRows(
  ctx: Ctx,
  opts: { locationId?: string; mode: "nonzero" | "low"; limit?: number },
): Promise<StockLevelRow[]> {
  const s = stockSubquery(ctx, opts.locationId);
  const qty = sql<number>`coalesce(${s.qty}, 0)`;
  const threshold = sql`coalesce(${variants.reorderLevel}, ${ctx.business.lowStockThreshold})`;
  const conds: SQL[] = [
    eq(variants.businessId, ctx.businessId),
    eq(products.trackInventory, true),
    eq(products.type, "standard"),
  ];
  if (opts.mode === "nonzero") conds.push(sql`${qty} <> 0`);
  else conds.push(eq(variants.isActive, true), eq(products.isActive, true), sql`${qty} <= ${threshold}`);
  let query = ctx.db
    .select({
      variantId: variants.id,
      productId: products.id,
      productName: products.name,
      variantName: variants.name,
      sku: variants.sku,
      barcode: variants.barcode,
      categoryName: categories.name,
      quantity: qty,
      reorderLevel: variants.reorderLevel,
      costPrice: variants.costPrice,
      price: variants.price,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(s, eq(s.variantId, variants.id))
    .where(and(...conds))
    .orderBy(opts.mode === "low" ? asc(qty) : asc(products.name), asc(variants.sortOrder))
    .$dynamic();
  if (opts.limit) query = query.limit(opts.limit);
  const rows = await query;
  return rows.map((r) => {
    const quantity = Math.round(num(r.quantity) * 1000) / 1000;
    return {
      variantId: r.variantId,
      productId: r.productId,
      productName: r.productName,
      variantName: r.variantName,
      sku: r.sku,
      barcode: r.barcode,
      categoryName: r.categoryName ?? null,
      locationId: opts.locationId ?? null,
      quantity,
      reorderLevel: r.reorderLevel,
      costPrice: r.costPrice,
      price: r.price,
      value: Math.round(quantity * r.costPrice),
      retailValue: Math.round(quantity * r.price),
    };
  });
}

/** Low / out-of-stock counts and inventory value in one query. */
export async function stockHealth(ctx: Ctx, locationId?: string) {
  const s = stockSubquery(ctx, locationId);
  const qty = sql<number>`coalesce(${s.qty}, 0)`;
  const threshold = sql`coalesce(${variants.reorderLevel}, ${ctx.business.lowStockThreshold})`;
  const [row] = await ctx.db
    .select({
      low: sql<number>`sum(case when ${variants.isActive} = 1 and ${products.isActive} = 1 and ${qty} > 0 and ${qty} <= ${threshold} then 1 else 0 end)`,
      out: sql<number>`sum(case when ${variants.isActive} = 1 and ${products.isActive} = 1 and ${qty} <= 0 then 1 else 0 end)`,
      value: sql<number>`coalesce(sum(round(${qty} * ${variants.costPrice})), 0)`,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .leftJoin(s, eq(s.variantId, variants.id))
    .where(and(eq(variants.businessId, ctx.businessId), eq(products.trackInventory, true), eq(products.type, "standard")));
  return { lowStockCount: num(row?.low), outOfStockCount: num(row?.out), inventoryValue: num(row?.value) };
}

export async function inventoryValuation(ctx: Ctx, locationId?: string): Promise<InventoryValuationReport> {
  const rows = await stockRows(ctx, { locationId, mode: "nonzero" });
  const byCat = new Map<string, { name: string; quantity: number; value: number; retailValue: number }>();
  for (const r of rows) {
    const name = r.categoryName ?? "Uncategorized";
    const c = byCat.get(name) ?? { name, quantity: 0, value: 0, retailValue: 0 };
    c.quantity += r.quantity;
    c.value += r.value;
    c.retailValue += r.retailValue;
    byCat.set(name, c);
  }
  return {
    asOf: ctx.today,
    rows,
    totalQuantity: Math.round(rows.reduce((s, r) => s + r.quantity, 0) * 1000) / 1000,
    totalValue: rows.reduce((s, r) => s + r.value, 0),
    totalRetailValue: rows.reduce((s, r) => s + r.retailValue, 0),
    byCategory: [...byCat.values()]
      .map((c) => ({ ...c, quantity: Math.round(c.quantity * 1000) / 1000 }))
      .sort((a, b) => b.value - a.value),
  };
}
