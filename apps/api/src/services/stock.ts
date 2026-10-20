import { and, eq, inArray, sql } from "drizzle-orm";
import { roundHalfAway, roundQty, type StockMovementType } from "@shopbooks/shared";
import { products, stockLevels, stockMovements, units, variants } from "../db/schema";
import { insertMany, type Stmt } from "../lib/batch";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Tx } from "./tx";

export interface VariantInfo {
  id: string;
  productId: string;
  productName: string;
  variantName: string;
  displayName: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  wholesalePrice: number | null;
  costPrice: number;
  isActive: boolean;
  productActive: boolean;
  trackInventory: boolean;
  type: string;
  taxRateId: string | null;
  categoryId: string | null;
  allowDecimal: boolean;
}

export function displayName(productName: string, variantName: string) {
  return variantName ? `${productName} — ${variantName}` : productName;
}

/** Loads variants (with product info) belonging to the business, keyed by id. Throws if any is missing. */
export async function loadVariants(ctx: Ctx, ids: string[]): Promise<Map<string, VariantInfo>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, VariantInfo>();
  if (unique.length === 0) return map;
  for (let i = 0; i < unique.length; i += 90) {
    const chunk = unique.slice(i, i + 90);
    const rows = await ctx.db
      .select({
        id: variants.id,
        productId: variants.productId,
        productName: products.name,
        variantName: variants.name,
        sku: variants.sku,
        barcode: variants.barcode,
        price: variants.price,
        wholesalePrice: variants.wholesalePrice,
        costPrice: variants.costPrice,
        isActive: variants.isActive,
        productActive: products.isActive,
        trackInventory: products.trackInventory,
        type: products.type,
        taxRateId: products.taxRateId,
        categoryId: products.categoryId,
        allowDecimal: units.allowDecimal,
      })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .leftJoin(units, eq(units.id, products.unitId))
      .where(and(eq(variants.businessId, ctx.businessId), inArray(variants.id, chunk)));
    for (const r of rows) {
      map.set(r.id, {
        ...r,
        trackInventory: r.trackInventory && r.type !== "service",
        allowDecimal: !!r.allowDecimal,
        displayName: displayName(r.productName, r.variantName),
      });
    }
  }
  for (const id of unique) if (!map.has(id)) throw badRequest("One of the items no longer exists");
  return map;
}

/** Stock on hand at one location. */
export async function stockAt(ctx: Ctx, variantIds: string[], locationId: string): Promise<Map<string, number>> {
  const unique = [...new Set(variantIds)];
  const map = new Map<string, number>();
  for (let i = 0; i < unique.length; i += 90) {
    const rows = await ctx.db
      .select({ variantId: stockLevels.variantId, quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(and(eq(stockLevels.locationId, locationId), inArray(stockLevels.variantId, unique.slice(i, i + 90))));
    for (const r of rows) map.set(r.variantId, r.quantity);
  }
  return map;
}

/** Total stock on hand across all locations (used for weighted-average costing). */
export async function stockTotals(ctx: Ctx, variantIds: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(variantIds)];
  const map = new Map<string, number>();
  for (let i = 0; i < unique.length; i += 90) {
    const rows = await ctx.db
      .select({ variantId: stockLevels.variantId, quantity: sql<number>`sum(${stockLevels.quantity})` })
      .from(stockLevels)
      .where(inArray(stockLevels.variantId, unique.slice(i, i + 90)))
      .groupBy(stockLevels.variantId);
    for (const r of rows) map.set(r.variantId, Number(r.quantity) || 0);
  }
  return map;
}

export interface StockChange {
  variantId: string;
  productId: string;
  locationId: string;
  /** signed */
  quantity: number;
  unitCost: number;
  type: StockMovementType;
  referenceType: string;
  referenceId: string;
  referenceNumber: string | null;
  note?: string | null;
  date: string;
}

/** Queue stock level upserts + movement rows. */
export function queueStockChanges(ctx: Ctx, tx: Tx, changes: StockChange[]) {
  const relevant = changes.filter((c) => roundQty(c.quantity) !== 0);
  if (relevant.length === 0) return;

  // Aggregate per (variant, location) for the level upsert.
  const agg = new Map<string, { variantId: string; locationId: string; quantity: number }>();
  for (const c of relevant) {
    const key = `${c.variantId}|${c.locationId}`;
    const cur = agg.get(key) ?? { variantId: c.variantId, locationId: c.locationId, quantity: 0 };
    cur.quantity = roundQty(cur.quantity + c.quantity);
    agg.set(key, cur);
  }
  const levelRows = [...agg.values()]
    .filter((r) => r.quantity !== 0)
    .map((r) => ({ businessId: ctx.businessId, ...r }));
  for (let i = 0; i < levelRows.length; i += 24) {
    tx.add(
      ctx.db
        .insert(stockLevels)
        .values(levelRows.slice(i, i + 24))
        .onConflictDoUpdate({
          target: [stockLevels.variantId, stockLevels.locationId],
          set: { quantity: sql`round(${stockLevels.quantity} + excluded.quantity, 3)` },
        }) as unknown as Stmt,
    );
  }

  tx.add(
    insertMany(
      ctx.db,
      stockMovements,
      relevant.map((c) => ({
        id: newId(),
        businessId: ctx.businessId,
        variantId: c.variantId,
        productId: c.productId,
        locationId: c.locationId,
        type: c.type,
        quantity: roundQty(c.quantity),
        unitCost: c.unitCost,
        referenceType: c.referenceType,
        referenceId: c.referenceId,
        referenceNumber: c.referenceNumber,
        note: c.note ?? null,
        date: c.date,
        userId: ctx.userId,
        createdAt: ctx.now,
      })),
    ),
  );
}

/** Ensure enough stock is available unless negative stock is allowed. */
export async function assertStockAvailable(
  ctx: Ctx,
  locationId: string,
  needs: Map<string, number>,
  info: Map<string, VariantInfo>,
  credits?: Map<string, number>,
) {
  if (ctx.business.allowNegativeStock || needs.size === 0) return;
  const tracked = [...needs.keys()].filter((id) => info.get(id)?.trackInventory);
  if (tracked.length === 0) return;
  const onHand = await stockAt(ctx, tracked, locationId);
  for (const id of tracked) {
    const need = needs.get(id) ?? 0;
    const have = roundQty((onHand.get(id) ?? 0) + (credits?.get(id) ?? 0));
    if (need > have + 1e-9) {
      const v = info.get(id)!;
      throw badRequest(`Not enough stock for ${v.displayName}: ${have} available, ${need} needed`);
    }
  }
}

/** New weighted-average cost after receiving `qty` at `unitCost`. */
export function weightedAverage(currentQty: number, currentCost: number, qty: number, unitCost: number) {
  const base = Math.max(0, currentQty);
  if (base + qty <= 0) return unitCost;
  return roundHalfAway((base * currentCost + qty * unitCost) / (base + qty));
}

export function queueCostUpdate(ctx: Ctx, tx: Tx, variantId: string, costPrice: number) {
  tx.add(ctx.db.update(variants).set({ costPrice }).where(eq(variants.id, variantId)) as unknown as Stmt);
}
