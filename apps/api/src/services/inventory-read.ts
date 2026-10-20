import { and, asc, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type {
  AdjustmentReason,
  StockAdjustment,
  StockAdjustmentLine,
  StockLevelRow,
  StockMovement,
  StockMovementType,
  StockTransfer,
  StockTransferLine,
} from "@shopbooks/shared";
import {
  categories,
  locations,
  products,
  stockAdjustmentLines,
  stockAdjustments,
  stockLevels,
  stockMovements,
  stockTransferLines,
  stockTransfers,
  users,
  variants,
} from "../db/schema";
import type { Ctx } from "../lib/context";
import { notFound } from "../lib/errors";
import { likeQ, pageParams, paged } from "../lib/http";

const r3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

// ---------------------------------------------------------------- stock levels

export interface StockQuery {
  page: number;
  pageSize: number;
  q?: string;
  locationId?: string;
  categoryId?: string;
  stock?: "low" | "out" | "in" | "negative";
  sort?: string;
  order?: "asc" | "desc";
}

export async function listStock(ctx: Ctx, q: StockQuery) {
  const { limit, offset } = pageParams(q);
  const threshold = ctx.business.lowStockThreshold;

  const levelConds: SQL[] = [eq(stockLevels.businessId, ctx.businessId)];
  if (q.locationId) levelConds.push(eq(stockLevels.locationId, q.locationId));
  const s = ctx.db
    .select({
      variantId: stockLevels.variantId,
      qty: sql<number>`sum(${stockLevels.quantity})`.as("qty"),
    })
    .from(stockLevels)
    .where(and(...levelConds))
    .groupBy(stockLevels.variantId)
    .as("s");

  const qty = sql<number>`coalesce(${s.qty}, 0)`;
  const conds: SQL[] = [
    eq(variants.businessId, ctx.businessId),
    eq(products.isActive, true),
    eq(products.trackInventory, true),
    sql`${products.type} <> 'service'`,
    sql`(${variants.isActive} = 1 OR coalesce(${s.qty}, 0) <> 0)`,
  ];
  if (q.categoryId) conds.push(eq(products.categoryId, q.categoryId));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(
      or(like(products.name, term), like(variants.name, term), like(variants.sku, term), like(variants.barcode, term))!,
    );
  }
  const level = sql`coalesce(${variants.reorderLevel}, ${threshold})`;
  if (q.stock === "out") conds.push(sql`${qty} <= 0`);
  if (q.stock === "in") conds.push(sql`${qty} > 0`);
  if (q.stock === "negative") conds.push(sql`${qty} < 0`);
  if (q.stock === "low") conds.push(sql`${qty} > 0 AND ${qty} <= ${level}`);
  const where = and(...conds);

  const dir = q.order === "desc" ? "desc" : "asc";
  const orderBy: SQL[] = (() => {
    switch (q.sort) {
      case "quantity":
        return [sql.raw(`coalesce("s"."qty", 0) ${dir}`)];
      case "value":
        return [sql`(coalesce(${s.qty}, 0) * ${variants.costPrice}) ${sql.raw(dir)}`];
      case "sku":
        return [sql`${variants.sku} ${sql.raw(dir)}`];
      default:
        return [sql`${products.name} COLLATE NOCASE ${sql.raw(dir)}`, asc(variants.sortOrder)];
    }
  })();

  const base = () =>
    ctx.db
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
      .leftJoin(s, eq(s.variantId, variants.id));

  const [rows, [totals]] = await Promise.all([
    base()
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        quantity: sql<number>`coalesce(sum(coalesce(${s.qty}, 0)), 0)`,
        value: sql<number>`coalesce(sum(round(coalesce(${s.qty}, 0) * ${variants.costPrice})), 0)`,
        retailValue: sql<number>`coalesce(sum(round(coalesce(${s.qty}, 0) * ${variants.price})), 0)`,
      })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(s, eq(s.variantId, variants.id))
      .where(where),
  ]);

  const data = rows.map(
    (r): StockLevelRow => {
      const quantity = r3(r.quantity);
      return {
        variantId: r.variantId,
        productId: r.productId,
        productName: r.productName,
        variantName: r.variantName,
        sku: r.sku,
        barcode: r.barcode,
        categoryName: r.categoryName ?? null,
        locationId: q.locationId ?? null,
        quantity,
        reorderLevel: r.reorderLevel,
        costPrice: r.costPrice,
        price: r.price,
        value: Math.round(quantity * r.costPrice),
        retailValue: Math.round(quantity * r.price),
      };
    },
  );
  return {
    ...paged(data, Number(totals?.n ?? 0), q),
    totals: {
      quantity: r3(totals?.quantity ?? 0),
      value: Number(totals?.value ?? 0),
      retailValue: Number(totals?.retailValue ?? 0),
    },
  };
}

// ---------------------------------------------------------------- movements

export interface MovementQuery {
  page: number;
  pageSize: number;
  q?: string;
  from?: string;
  to?: string;
  locationId?: string;
  variantId?: string;
  productId?: string;
  type?: string;
}

export async function listMovements(ctx: Ctx, q: MovementQuery) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(stockMovements.businessId, ctx.businessId)];
  if (q.from) conds.push(gte(stockMovements.date, q.from));
  if (q.to) conds.push(lte(stockMovements.date, q.to));
  if (q.locationId) conds.push(eq(stockMovements.locationId, q.locationId));
  if (q.variantId) conds.push(eq(stockMovements.variantId, q.variantId));
  if (q.productId) conds.push(eq(stockMovements.productId, q.productId));
  if (q.type) conds.push(eq(stockMovements.type, q.type));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(
      or(like(products.name, term), like(stockMovements.referenceNumber, term), like(variants.sku, term))!,
    );
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select({
        m: stockMovements,
        productName: products.name,
        variantName: variants.name,
        sku: variants.sku,
        locationName: locations.name,
        userName: users.name,
      })
      .from(stockMovements)
      .leftJoin(variants, eq(variants.id, stockMovements.variantId))
      .leftJoin(products, eq(products.id, stockMovements.productId))
      .leftJoin(locations, eq(locations.id, stockMovements.locationId))
      .leftJoin(users, eq(users.id, stockMovements.userId))
      .where(where)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(limit)
      .offset(offset),
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(stockMovements)
      .leftJoin(variants, eq(variants.id, stockMovements.variantId))
      .leftJoin(products, eq(products.id, stockMovements.productId))
      .where(where),
  ]);
  const data = rows.map(
    (r): StockMovement => ({
      id: r.m.id,
      date: r.m.date,
      createdAt: r.m.createdAt,
      type: r.m.type as StockMovementType,
      variantId: r.m.variantId,
      productId: r.m.productId,
      productName: r.productName ?? "",
      variantName: r.variantName ?? "",
      sku: r.sku ?? null,
      locationId: r.m.locationId,
      locationName: r.locationName ?? "",
      quantity: r.m.quantity,
      unitCost: r.m.unitCost,
      referenceType: r.m.referenceType,
      referenceId: r.m.referenceId,
      referenceNumber: r.m.referenceNumber,
      note: r.m.note,
      userName: r.userName ?? null,
    }),
  );
  return paged(data, Number(count?.n ?? 0), q);
}

// ---------------------------------------------------------------- adjustments

function mapAdjustment(r: {
  a: typeof stockAdjustments.$inferSelect;
  locationName: string | null;
  createdByName: string | null;
}): StockAdjustment {
  return {
    id: r.a.id,
    number: r.a.number,
    date: r.a.date,
    locationId: r.a.locationId,
    locationName: r.locationName ?? "",
    reason: r.a.reason as AdjustmentReason,
    note: r.a.note,
    totalValue: r.a.totalValue,
    lineCount: r.a.lineCount,
    createdByName: r.createdByName ?? null,
    createdAt: r.a.createdAt,
  };
}

export interface AdjustmentQuery {
  page: number;
  pageSize: number;
  q?: string;
  from?: string;
  to?: string;
  locationId?: string;
  reason?: string;
}

export async function listAdjustments(ctx: Ctx, q: AdjustmentQuery) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(stockAdjustments.businessId, ctx.businessId)];
  if (q.from) conds.push(gte(stockAdjustments.date, q.from));
  if (q.to) conds.push(lte(stockAdjustments.date, q.to));
  if (q.locationId) conds.push(eq(stockAdjustments.locationId, q.locationId));
  if (q.reason) conds.push(eq(stockAdjustments.reason, q.reason));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(stockAdjustments.number, term), like(stockAdjustments.note, term))!);
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select({ a: stockAdjustments, locationName: locations.name, createdByName: users.name })
      .from(stockAdjustments)
      .leftJoin(locations, eq(locations.id, stockAdjustments.locationId))
      .leftJoin(users, eq(users.id, stockAdjustments.createdBy))
      .where(where)
      .orderBy(desc(stockAdjustments.createdAt))
      .limit(limit)
      .offset(offset),
    ctx.db.select({ n: sql<number>`count(*)` }).from(stockAdjustments).where(where),
  ]);
  return paged(rows.map(mapAdjustment), Number(count?.n ?? 0), q);
}

export async function getAdjustmentDto(ctx: Ctx, id: string): Promise<StockAdjustment> {
  const [row] = await ctx.db
    .select({ a: stockAdjustments, locationName: locations.name, createdByName: users.name })
    .from(stockAdjustments)
    .leftJoin(locations, eq(locations.id, stockAdjustments.locationId))
    .leftJoin(users, eq(users.id, stockAdjustments.createdBy))
    .where(and(eq(stockAdjustments.id, id), eq(stockAdjustments.businessId, ctx.businessId)));
  if (!row) throw notFound("Stock adjustment");
  const lines = await ctx.db
    .select({ l: stockAdjustmentLines, productName: products.name, variantName: variants.name, sku: variants.sku })
    .from(stockAdjustmentLines)
    .leftJoin(variants, eq(variants.id, stockAdjustmentLines.variantId))
    .leftJoin(products, eq(products.id, variants.productId))
    .where(eq(stockAdjustmentLines.adjustmentId, id))
    .orderBy(asc(products.name));
  return {
    ...mapAdjustment(row),
    lines: lines.map(
      (r): StockAdjustmentLine => ({
        id: r.l.id,
        variantId: r.l.variantId,
        productName: r.productName ?? "",
        variantName: r.variantName ?? "",
        sku: r.sku ?? null,
        quantityBefore: r.l.quantityBefore,
        quantity: r.l.quantity,
        unitCost: r.l.unitCost,
        value: r.l.value,
      }),
    ),
  };
}

// ---------------------------------------------------------------- transfers

const fromLoc = alias(locations, "from_loc");
const toLoc = alias(locations, "to_loc");

function transferSelect(ctx: Ctx) {
  return ctx.db
    .select({ t: stockTransfers, fromName: fromLoc.name, toName: toLoc.name, createdByName: users.name })
    .from(stockTransfers)
    .leftJoin(fromLoc, eq(fromLoc.id, stockTransfers.fromLocationId))
    .leftJoin(toLoc, eq(toLoc.id, stockTransfers.toLocationId))
    .leftJoin(users, eq(users.id, stockTransfers.createdBy));
}

function mapTransfer(r: {
  t: typeof stockTransfers.$inferSelect;
  fromName: string | null;
  toName: string | null;
  createdByName: string | null;
}): StockTransfer {
  return {
    id: r.t.id,
    number: r.t.number,
    date: r.t.date,
    fromLocationId: r.t.fromLocationId,
    fromLocationName: r.fromName ?? "",
    toLocationId: r.t.toLocationId,
    toLocationName: r.toName ?? "",
    note: r.t.note,
    itemCount: r.t.itemCount,
    totalQuantity: r.t.totalQuantity,
    createdByName: r.createdByName ?? null,
    createdAt: r.t.createdAt,
  };
}

export interface TransferQuery {
  page: number;
  pageSize: number;
  q?: string;
  from?: string;
  to?: string;
  locationId?: string;
}

export async function listTransfers(ctx: Ctx, q: TransferQuery) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(stockTransfers.businessId, ctx.businessId)];
  if (q.from) conds.push(gte(stockTransfers.date, q.from));
  if (q.to) conds.push(lte(stockTransfers.date, q.to));
  if (q.locationId) {
    conds.push(or(eq(stockTransfers.fromLocationId, q.locationId), eq(stockTransfers.toLocationId, q.locationId))!);
  }
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(stockTransfers.number, term), like(stockTransfers.note, term))!);
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    transferSelect(ctx).where(where).orderBy(desc(stockTransfers.createdAt)).limit(limit).offset(offset),
    ctx.db.select({ n: sql<number>`count(*)` }).from(stockTransfers).where(where),
  ]);
  return paged(rows.map(mapTransfer), Number(count?.n ?? 0), q);
}

export async function getTransferDto(ctx: Ctx, id: string): Promise<StockTransfer> {
  const [row] = await transferSelect(ctx).where(
    and(eq(stockTransfers.id, id), eq(stockTransfers.businessId, ctx.businessId)),
  );
  if (!row) throw notFound("Stock transfer");
  const lines = await ctx.db
    .select({ l: stockTransferLines, productName: products.name, variantName: variants.name, sku: variants.sku })
    .from(stockTransferLines)
    .leftJoin(variants, eq(variants.id, stockTransferLines.variantId))
    .leftJoin(products, eq(products.id, variants.productId))
    .where(eq(stockTransferLines.transferId, id))
    .orderBy(asc(products.name));
  return {
    ...mapTransfer(row),
    lines: lines.map(
      (r): StockTransferLine => ({
        id: r.l.id,
        variantId: r.l.variantId,
        productName: r.productName ?? "",
        variantName: r.variantName ?? "",
        sku: r.sku ?? null,
        quantity: r.l.quantity,
      }),
    ),
  };
}
