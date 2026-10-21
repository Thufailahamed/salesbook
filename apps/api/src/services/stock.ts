import { and, eq, inArray, sql } from "drizzle-orm";
import { roundHalfAway, roundQty, type PromotionTerms, type StockMovementType } from "@shopbooks/shared";
import { products, stockLevels, stockLots, stockMovements, units, variants } from "../db/schema";
import { insertMany, type Stmt } from "../lib/batch";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { newId } from "../lib/ids";
import { promotionsFor } from "./promotions";
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
  /** Offer running today for this variant (null = sold at the tier price). */
  promotion: PromotionTerms | null;
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
        promotion: null,
      });
    }
  }
  for (const id of unique) if (!map.has(id)) throw badRequest("One of the items no longer exists");
  const promos = await promotionsFor(ctx, [...map.values()].map((v) => ({ variantId: v.id, productId: v.productId })));
  for (const v of map.values()) v.promotion = promos.get(v.id) ?? null;
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

/** Total stock on hand across all locations. */
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

/** Quantity of one expiry date within a location's stock. `expiry` is YYYY-MM-DD, or "" for none. Signed. */
export interface LotQty {
  expiry: string;
  quantity: number;
}

/** Expiry order: earliest date first, stock without a date last (first expired, first out). */
function compareLots(a: LotQty, b: LotQty): number {
  if (a.expiry === b.expiry) return 0;
  if (!a.expiry) return 1;
  if (!b.expiry) return -1;
  return a.expiry < b.expiry ? -1 : 1;
}

/** The earliest expired date among lots being taken out (null when none has expired). */
export function expiredLotDate(lots: LotQty[], today: string): string | null {
  const expired = lots.filter((l) => l.quantity < 0 && l.expiry && l.expiry < today).map((l) => l.expiry);
  return expired.length ? expired.sort()[0]! : null;
}

export interface StockChange {
  variantId: string;
  productId: string;
  locationId: string;
  /** signed */
  quantity: number;
  /**
   * Expiry breakdown of `quantity`, signed like it. Omit for stock with no expiry date (plain quantity).
   * Outflows take their lots from StockCoster.outLots; inflows state the expiry of what arrived.
   */
  lots?: LotQty[];
  /** Ledger amount in minor units, signed like the quantity (positive = value in). */
  value: number;
  type: StockMovementType;
  referenceType: string;
  referenceId: string;
  referenceNumber: string | null;
  note?: string | null;
  date: string;
}

/** Queue stock level upserts + movement rows. */
export function queueStockChanges(ctx: Ctx, tx: Tx, changes: StockChange[]) {
  const relevant = changes.filter((c) => roundQty(c.quantity) !== 0 || c.value !== 0);
  if (relevant.length === 0) return;

  // Aggregate per (variant, location) for the level upsert.
  const agg = new Map<string, { variantId: string; locationId: string; quantity: number; value: number }>();
  for (const c of relevant) {
    const key = `${c.variantId}|${c.locationId}`;
    const cur = agg.get(key) ?? { variantId: c.variantId, locationId: c.locationId, quantity: 0, value: 0 };
    cur.quantity = roundQty(cur.quantity + c.quantity);
    cur.value += c.value;
    agg.set(key, cur);
  }
  const levelRows = [...agg.values()]
    .filter((r) => r.quantity !== 0 || r.value !== 0)
    .map((r) => ({ businessId: ctx.businessId, ...r }));
  // Five bound parameters per row, so 18 rows stay under D1's 100-parameter limit.
  for (let i = 0; i < levelRows.length; i += 18) {
    tx.add(
      ctx.db
        .insert(stockLevels)
        .values(levelRows.slice(i, i + 18))
        .onConflictDoUpdate({
          target: [stockLevels.variantId, stockLevels.locationId],
          set: {
            quantity: sql`round(${stockLevels.quantity} + excluded.quantity, 3)`,
            value: sql`${stockLevels.value} + excluded.value`,
          },
        }) as unknown as Stmt,
    );
  }

  // Expiry lots, aggregated per (variant, location, expiry) and upserted with the levels.
  const lotAgg = new Map<string, { variantId: string; locationId: string; expiryDate: string; quantity: number }>();
  for (const c of relevant) {
    for (const lot of c.lots ?? [{ expiry: "", quantity: c.quantity }]) {
      if (roundQty(lot.quantity) === 0) continue;
      const key = `${c.variantId}|${c.locationId}|${lot.expiry}`;
      const cur = lotAgg.get(key) ?? { variantId: c.variantId, locationId: c.locationId, expiryDate: lot.expiry, quantity: 0 };
      cur.quantity = roundQty(cur.quantity + lot.quantity);
      lotAgg.set(key, cur);
    }
  }
  const lotRows = [...lotAgg.values()]
    .filter((r) => r.quantity !== 0)
    .map((r) => ({ businessId: ctx.businessId, ...r }));
  // Six bound parameters per row: 16 rows stay under D1's 100-parameter limit.
  for (let i = 0; i < lotRows.length; i += 16) {
    tx.add(
      ctx.db
        .insert(stockLots)
        .values(lotRows.slice(i, i + 16))
        .onConflictDoUpdate({
          target: [stockLots.variantId, stockLots.locationId, stockLots.expiryDate],
          set: { quantity: sql`round(${stockLots.quantity} + excluded.quantity, 3)` },
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
        unitCost: c.quantity === 0 ? 0 : roundHalfAway(Math.abs(c.value) / Math.abs(c.quantity)),
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

interface LevelState {
  quantity: number;
  value: number;
}

/**
 * Inventory costing for one business operation. It loads the stock levels (quantity and value) of the
 * variants involved, then applies each movement to them in memory, in the order the operation lists them.
 * Every ledger amount comes from here and is written to stock_levels.value with the movement, so the
 * Inventory account always equals the stock valuation.
 *
 * Goods leave a location at that location's average cost (value ÷ quantity). Taking the last units takes
 * the whole remaining value, so nothing is left behind on an empty location.
 */
export class StockCoster {
  private readonly levels = new Map<string, Map<string, LevelState>>();
  private readonly touched = new Set<string>();
  /** Expiry lots per `variantId|locationId`, earliest expiry first. */
  private readonly lots = new Map<string, LotQty[]>();

  constructor(
    rows: { variantId: string; locationId: string; quantity: number; value: number }[],
    private readonly costPrices: Map<string, number>,
    lotRows: { variantId: string; locationId: string; expiryDate: string; quantity: number }[] = [],
  ) {
    for (const r of rows) {
      const lv = this.level(r.variantId, r.locationId);
      lv.quantity = r.quantity;
      lv.value = r.value;
    }
    for (const r of lotRows) {
      if (r.quantity > 0) this.lotList(r.variantId, r.locationId).push({ expiry: r.expiryDate, quantity: r.quantity });
    }
    for (const list of this.lots.values()) list.sort(compareLots);
  }

  private lotList(variantId: string, locationId: string): LotQty[] {
    const key = `${variantId}|${locationId}`;
    let list = this.lots.get(key);
    if (!list) {
      list = [];
      this.lots.set(key, list);
    }
    return list;
  }

  private level(variantId: string, locationId: string): LevelState {
    let byLocation = this.levels.get(variantId);
    if (!byLocation) {
      byLocation = new Map();
      this.levels.set(variantId, byLocation);
    }
    let lv = byLocation.get(locationId);
    if (!lv) {
      lv = { quantity: 0, value: 0 };
      byLocation.set(locationId, lv);
    }
    return lv;
  }

  /** Every stock level of a variant across locations, as loaded and updated so far. */
  entries(variantId: string): { locationId: string; quantity: number; value: number }[] {
    return [...(this.levels.get(variantId)?.entries() ?? [])].map(([locationId, lv]) => ({ locationId, ...lv }));
  }

  /** Ledger amount (positive) for taking `qty` out of a location. Updates the in-memory level. */
  out(variantId: string, locationId: string, qty: number): number {
    return this.outLots(variantId, locationId, qty).amount;
  }

  /**
   * Takes `qty` out of a location: the ledger amount, and which expiry lots it came from (earliest expiry first).
   * Quantity beyond the known lots (negative stock) is taken from stock with no expiry date.
   * The lots are signed negative, ready for StockChange.lots.
   */
  outLots(variantId: string, locationId: string, qty: number): { amount: number; lots: LotQty[] } {
    const lv = this.level(variantId, locationId);
    const unit = this.costPrices.get(variantId) ?? 0;
    let amount: number;
    if (lv.quantity > 0 && qty < lv.quantity) amount = roundHalfAway((qty * lv.value) / lv.quantity);
    else if (lv.quantity > 0) amount = lv.value + roundHalfAway((qty - lv.quantity) * unit);
    else amount = roundHalfAway(qty * unit);
    lv.quantity = roundQty(lv.quantity - qty);
    lv.value -= amount;
    this.touched.add(variantId);

    const taken: LotQty[] = [];
    let remaining = roundQty(qty);
    for (const lot of this.lotList(variantId, locationId)) {
      if (remaining <= 0) break;
      const take = roundQty(Math.min(lot.quantity, remaining));
      if (take <= 0) continue;
      lot.quantity = roundQty(lot.quantity - take);
      remaining = roundQty(remaining - take);
      taken.push({ expiry: lot.expiry, quantity: -take });
    }
    const list = this.lotList(variantId, locationId);
    list.splice(0, list.length, ...list.filter((l) => l.quantity > 0));
    if (remaining > 0) taken.push({ expiry: "", quantity: -remaining });
    return { amount, lots: taken };
  }

  /**
   * Adds `qty` to a location at ledger amount `amount`. `lots` says which expiry dates arrived
   * (default: no expiry date). Updates the in-memory level and lots.
   */
  in(variantId: string, locationId: string, qty: number, amount: number, lots?: LotQty[]) {
    const lv = this.level(variantId, locationId);
    lv.quantity = roundQty(lv.quantity + qty);
    lv.value += amount;
    this.touched.add(variantId);
    for (const arrived of lots ?? [{ expiry: "", quantity: qty }]) {
      if (roundQty(arrived.quantity) <= 0) continue;
      const list = this.lotList(variantId, locationId);
      const lot = list.find((l) => l.expiry === arrived.expiry);
      if (lot) lot.quantity = roundQty(lot.quantity + arrived.quantity);
      else list.push({ expiry: arrived.expiry, quantity: roundQty(arrived.quantity) });
    }
    this.lotList(variantId, locationId).sort(compareLots);
  }

  /** Average-cost changes for the variants that moved, from their post-operation totals. */
  costUpdates(): { variantId: string; costPrice: number }[] {
    const out: { variantId: string; costPrice: number }[] = [];
    for (const variantId of this.touched) {
      let quantity = 0;
      let value = 0;
      for (const lv of this.levels.get(variantId)?.values() ?? []) {
        quantity += lv.quantity;
        value += lv.value;
      }
      if (quantity <= 0) continue;
      const costPrice = roundHalfAway(value / quantity);
      if (costPrice !== this.costPrices.get(variantId)) out.push({ variantId, costPrice });
    }
    return out;
  }
}

/** Loads the stock levels of the given variants (all locations) into a costing session. */
export async function loadStockCoster(ctx: Ctx, variantIds: string[], costPrices: Map<string, number>): Promise<StockCoster> {
  const unique = [...new Set(variantIds)];
  const rows: { variantId: string; locationId: string; quantity: number; value: number }[] = [];
  const lotRows: { variantId: string; locationId: string; expiryDate: string; quantity: number }[] = [];
  for (let i = 0; i < unique.length; i += 90) {
    const foundLots = await ctx.db
      .select({
        variantId: stockLots.variantId,
        locationId: stockLots.locationId,
        expiryDate: stockLots.expiryDate,
        quantity: stockLots.quantity,
      })
      .from(stockLots)
      .where(and(eq(stockLots.businessId, ctx.businessId), inArray(stockLots.variantId, unique.slice(i, i + 90))));
    lotRows.push(...foundLots);
    const found = await ctx.db
      .select({
        variantId: stockLevels.variantId,
        locationId: stockLevels.locationId,
        quantity: stockLevels.quantity,
        value: stockLevels.value,
      })
      .from(stockLevels)
      .where(and(eq(stockLevels.businessId, ctx.businessId), inArray(stockLevels.variantId, unique.slice(i, i + 90))));
    rows.push(...found);
  }
  return new StockCoster(rows, costPrices, lotRows);
}

export function queueCostUpdate(ctx: Ctx, tx: Tx, variantId: string, costPrice: number) {
  tx.add(ctx.db.update(variants).set({ costPrice }).where(eq(variants.id, variantId)) as unknown as Stmt);
}
