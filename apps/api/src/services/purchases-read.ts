import { and, asc, desc, eq, gt, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type {
  DiscountType,
  PaymentStatus,
  Purchase,
  PurchaseKind,
  PurchaseLine,
  PurchaseReturn,
  PurchaseReturnSettlement,
  PurchaseStatus,
} from "@shopbooks/shared";
import { locations, purchaseLines, purchaseReturnLines, purchaseReturns, purchases, suppliers, users } from "../db/schema";
import type { Ctx } from "../lib/context";
import { notFound } from "../lib/errors";
import { likeQ, pageParams, paged } from "../lib/http";
import { paymentsForDoc } from "./payments";

const creator = alias(users, "creator");

function purchaseSelect(ctx: Ctx) {
  return ctx.db
    .select({
      p: purchases,
      supplierName: suppliers.name,
      locationName: locations.name,
      createdByName: creator.name,
    })
    .from(purchases)
    .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .leftJoin(locations, eq(locations.id, purchases.locationId))
    .leftJoin(creator, eq(creator.id, purchases.createdBy));
}

type PurchaseSelectRow = Awaited<ReturnType<ReturnType<typeof purchaseSelect>["where"]>>[number];

function mapPurchase(r: PurchaseSelectRow): Purchase {
  const p = r.p;
  return {
    id: p.id,
    number: p.number,
    kind: p.kind as PurchaseKind,
    status: p.status as PurchaseStatus,
    supplierId: p.supplierId,
    supplierName: r.supplierName ?? null,
    locationId: p.locationId,
    locationName: r.locationName ?? null,
    orderDate: p.orderDate,
    receivedDate: p.receivedDate,
    dueDate: p.dueDate,
    supplierRef: p.supplierRef,
    taxInclusive: p.taxInclusive,
    subtotal: p.subtotal,
    itemDiscount: p.itemDiscount,
    docDiscountType: (p.docDiscountType as DiscountType | null) ?? null,
    docDiscountValue: p.docDiscountValue,
    docDiscount: p.docDiscount,
    discountTotal: p.discountTotal,
    netTotal: p.netTotal,
    taxTotal: p.taxTotal,
    shipping: p.shipping,
    total: p.total,
    amountPaid: p.amountPaid,
    amountDue: p.amountDue,
    amountReturned: p.amountReturned,
    paymentStatus: p.paymentStatus as PaymentStatus,
    note: p.note,
    itemCount: p.itemCount,
    createdByName: r.createdByName ?? null,
    createdAt: p.createdAt,
  };
}

export async function getPurchaseDto(ctx: Ctx, id: string): Promise<Purchase> {
  const [row] = await purchaseSelect(ctx).where(and(eq(purchases.id, id), eq(purchases.businessId, ctx.businessId)));
  if (!row) throw notFound("Purchase");
  const [lines, pays, rets] = await Promise.all([
    ctx.db.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, id)).orderBy(asc(purchaseLines.sortOrder)),
    paymentsForDoc(ctx, "purchase", id),
    ctx.db
      .select({ id: purchaseReturns.id, number: purchaseReturns.number, date: purchaseReturns.date, total: purchaseReturns.total })
      .from(purchaseReturns)
      .where(eq(purchaseReturns.purchaseId, id))
      .orderBy(asc(purchaseReturns.createdAt)),
  ]);
  return {
    ...mapPurchase(row),
    lines: lines.map(
      (l): PurchaseLine => ({
        id: l.id,
        variantId: l.variantId,
        productId: l.productId,
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        unitCost: l.unitCost,
        discountType: (l.discountType as DiscountType | null) ?? null,
        discountValue: l.discountValue,
        lineDiscount: l.lineDiscount,
        docDiscount: l.docDiscount,
        taxRate: l.taxRate,
        net: l.net,
        tax: l.tax,
        total: l.total,
        landedUnitCost: l.landedUnitCost,
        expiryDate: l.expiryDate ?? null,
        quantityReturned: l.quantityReturned,
      }),
    ),
    payments: pays,
    returns: rets,
  };
}

export async function listPurchases(
  ctx: Ctx,
  q: {
    page: number;
    pageSize: number;
    q?: string;
    from?: string;
    to?: string;
    supplierId?: string;
    locationId?: string;
    status?: "ordered" | "received" | "cancelled";
    paymentStatus?: "paid" | "partial" | "unpaid" | "due";
  },
) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(purchases.businessId, ctx.businessId), eq(purchases.kind, "purchase")];
  if (q.from) conds.push(gte(purchases.orderDate, q.from));
  if (q.to) conds.push(lte(purchases.orderDate, q.to));
  if (q.supplierId) conds.push(eq(purchases.supplierId, q.supplierId));
  if (q.locationId) conds.push(eq(purchases.locationId, q.locationId));
  if (q.status) conds.push(eq(purchases.status, q.status));
  if (q.paymentStatus === "due") conds.push(gt(purchases.amountDue, 0), eq(purchases.status, "received"));
  else if (q.paymentStatus) conds.push(eq(purchases.paymentStatus, q.paymentStatus), eq(purchases.status, "received"));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(purchases.number, term), like(purchases.supplierRef, term), like(suppliers.name, term))!);
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    purchaseSelect(ctx).where(where).orderBy(desc(purchases.createdAt)).limit(limit).offset(offset),
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(case when ${purchases.status} = 'received' then ${purchases.total} else 0 end), 0)`,
        due: sql<number>`coalesce(sum(case when ${purchases.status} = 'received' then ${purchases.amountDue} else 0 end), 0)`,
      })
      .from(purchases)
      .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
      .where(where),
  ]);
  return {
    ...paged(rows.map(mapPurchase), count?.n ?? 0, q),
    totals: { total: Number(count?.total ?? 0), due: Number(count?.due ?? 0) },
  };
}

// ---------------------------------------------------------------- purchase returns

const parent = alias(purchases, "parent_purchase");

function returnSelect(ctx: Ctx) {
  return ctx.db
    .select({
      r: purchaseReturns,
      purchaseNumber: parent.number,
      supplierName: suppliers.name,
      locationName: locations.name,
      createdByName: creator.name,
    })
    .from(purchaseReturns)
    .leftJoin(parent, eq(parent.id, purchaseReturns.purchaseId))
    .leftJoin(suppliers, eq(suppliers.id, purchaseReturns.supplierId))
    .leftJoin(locations, eq(locations.id, purchaseReturns.locationId))
    .leftJoin(creator, eq(creator.id, purchaseReturns.createdBy));
}

type ReturnSelectRow = Awaited<ReturnType<ReturnType<typeof returnSelect>["where"]>>[number];

function mapReturn(row: ReturnSelectRow): PurchaseReturn {
  const r = row.r;
  return {
    id: r.id,
    number: r.number,
    date: r.date,
    createdAt: r.createdAt,
    purchaseId: r.purchaseId,
    purchaseNumber: row.purchaseNumber ?? "",
    supplierId: r.supplierId,
    supplierName: row.supplierName ?? null,
    locationId: r.locationId,
    locationName: row.locationName ?? null,
    settlement: r.settlement as PurchaseReturnSettlement,
    netTotal: r.netTotal,
    taxTotal: r.taxTotal,
    total: r.total,
    appliedToBill: r.appliedToBill,
    refunded: r.refunded,
    toCredit: r.toCredit,
    note: r.note,
    createdByName: row.createdByName ?? null,
  };
}

export async function getPurchaseReturnDto(ctx: Ctx, id: string): Promise<PurchaseReturn> {
  const [row] = await returnSelect(ctx).where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.businessId, ctx.businessId)));
  if (!row) throw notFound("Purchase return");
  const lines = await ctx.db.select().from(purchaseReturnLines).where(eq(purchaseReturnLines.returnId, id));
  return {
    ...mapReturn(row),
    lines: lines.map((l) => ({
      id: l.id,
      purchaseLineId: l.purchaseLineId,
      variantId: l.variantId,
      name: l.name,
      sku: l.sku,
      quantity: l.quantity,
      unitCost: l.unitCost,
      net: l.net,
      tax: l.tax,
      total: l.total,
    })),
  };
}

export async function listPurchaseReturns(
  ctx: Ctx,
  q: { page: number; pageSize: number; q?: string; from?: string; to?: string; supplierId?: string; purchaseId?: string },
) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(purchaseReturns.businessId, ctx.businessId)];
  if (q.from) conds.push(gte(purchaseReturns.date, q.from));
  if (q.to) conds.push(lte(purchaseReturns.date, q.to));
  if (q.supplierId) conds.push(eq(purchaseReturns.supplierId, q.supplierId));
  if (q.purchaseId) conds.push(eq(purchaseReturns.purchaseId, q.purchaseId));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(purchaseReturns.number, term), like(parent.number, term), like(suppliers.name, term))!);
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    returnSelect(ctx).where(where).orderBy(desc(purchaseReturns.createdAt)).limit(limit).offset(offset),
    ctx.db
      .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${purchaseReturns.total}), 0)` })
      .from(purchaseReturns)
      .leftJoin(parent, eq(parent.id, purchaseReturns.purchaseId))
      .leftJoin(suppliers, eq(suppliers.id, purchaseReturns.supplierId))
      .where(where),
  ]);
  return { ...paged(rows.map(mapReturn), count?.n ?? 0, q), totals: { total: Number(count?.total ?? 0) } };
}
