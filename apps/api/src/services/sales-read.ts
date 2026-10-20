import { and, asc, desc, eq, gt, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type {
  DiscountType,
  Invoice,
  InvoiceKind,
  InvoiceLine,
  InvoiceStatus,
  PaymentStatus,
  PriceTier,
  ReturnableLine,
  SaleReturn,
  SaleReturnLine,
} from "@shopbooks/shared";
import { customers, invoiceLines, invoices, locations, saleReturnLines, saleReturns, users } from "../db/schema";
import type { Ctx } from "../lib/context";
import { notFound } from "../lib/errors";
import { likeQ, pageParams, paged } from "../lib/http";
import { paymentsForDoc } from "./payments";

const salesperson = alias(users, "salesperson");
const creator = alias(users, "creator");

function invoiceSelect(ctx: Ctx) {
  return ctx.db
    .select({
      inv: invoices,
      locationName: locations.name,
      customerFullName: customers.name,
      customerPhone: customers.phone,
      salespersonName: salesperson.name,
      createdByName: creator.name,
    })
    .from(invoices)
    .leftJoin(locations, eq(locations.id, invoices.locationId))
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .leftJoin(salesperson, eq(salesperson.id, invoices.salespersonId))
    .leftJoin(creator, eq(creator.id, invoices.createdBy));
}

type InvoiceSelectRow = Awaited<ReturnType<ReturnType<typeof invoiceSelect>["where"]>>[number];

export function mapInvoice(r: InvoiceSelectRow): Invoice {
  const i = r.inv;
  return {
    id: i.id,
    number: i.number,
    kind: i.kind as InvoiceKind,
    date: i.date,
    dueDate: i.dueDate,
    createdAt: i.createdAt,
    status: i.status as InvoiceStatus,
    paymentStatus: i.paymentStatus as PaymentStatus,
    locationId: i.locationId,
    locationName: r.locationName ?? null,
    customerId: i.customerId,
    customerName: r.customerFullName ?? i.customerName ?? null,
    customerPhone: r.customerPhone ?? null,
    salespersonId: i.salespersonId,
    salespersonName: r.salespersonName ?? null,
    createdByName: r.createdByName ?? null,
    priceTier: i.priceTier as PriceTier,
    taxInclusive: i.taxInclusive,
    subtotal: i.subtotal,
    itemDiscount: i.itemDiscount,
    docDiscountType: (i.docDiscountType as DiscountType | null) ?? null,
    docDiscountValue: i.docDiscountValue,
    docDiscount: i.docDiscount,
    discountTotal: i.discountTotal,
    netTotal: i.netTotal,
    taxTotal: i.taxTotal,
    shipping: i.shipping,
    roundOff: i.roundOff,
    total: i.total,
    amountPaid: i.amountPaid,
    amountDue: i.amountDue,
    amountReturned: i.amountReturned,
    costTotal: i.costTotal,
    pointsEarned: i.pointsEarned,
    pointsRedeemed: i.pointsRedeemed,
    itemCount: i.itemCount,
    note: i.note,
    voidReason: i.voidReason,
    voidedAt: i.voidedAt,
    exchangeReturnId: i.exchangeReturnId,
  };
}

export function mapInvoiceLine(l: typeof invoiceLines.$inferSelect): InvoiceLine {
  return {
    id: l.id,
    variantId: l.variantId,
    productId: l.productId,
    name: l.name,
    sku: l.sku,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountType: (l.discountType as DiscountType | null) ?? null,
    discountValue: l.discountValue,
    lineDiscount: l.lineDiscount,
    docDiscount: l.docDiscount,
    taxRate: l.taxRate,
    net: l.net,
    tax: l.tax,
    total: l.total,
    unitCost: l.unitCost,
    quantityReturned: l.quantityReturned,
    note: l.note,
  };
}

export async function getInvoiceDto(ctx: Ctx, id: string): Promise<Invoice> {
  const [row] = await invoiceSelect(ctx).where(and(eq(invoices.id, id), eq(invoices.businessId, ctx.businessId)));
  if (!row) throw notFound("Invoice");
  const [lines, pays, rets] = await Promise.all([
    ctx.db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.sortOrder)),
    paymentsForDoc(ctx, "invoice", id),
    ctx.db
      .select({ id: saleReturns.id, number: saleReturns.number, date: saleReturns.date, total: saleReturns.total })
      .from(saleReturns)
      .where(eq(saleReturns.invoiceId, id))
      .orderBy(asc(saleReturns.createdAt)),
  ]);
  return { ...mapInvoice(row), lines: lines.map(mapInvoiceLine), payments: pays, returns: rets };
}

export async function findInvoiceByNumber(ctx: Ctx, number: string): Promise<Invoice> {
  const [row] = await ctx.db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.businessId, ctx.businessId), sql`upper(${invoices.number}) = upper(${number.trim()})`));
  if (!row) throw notFound("Invoice");
  return getInvoiceDto(ctx, row.id);
}

export interface InvoiceListQuery {
  page: number;
  pageSize: number;
  q?: string;
  from?: string;
  to?: string;
  customerId?: string;
  locationId?: string;
  status?: "completed" | "void";
  paymentStatus?: "paid" | "partial" | "unpaid" | "due";
  salespersonId?: string;
  kind?: "sale" | "opening_balance" | "all";
  order?: "asc" | "desc";
}

export async function listInvoices(ctx: Ctx, q: InvoiceListQuery) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(invoices.businessId, ctx.businessId)];
  if (q.kind !== "all") conds.push(eq(invoices.kind, q.kind ?? "sale"));
  if (q.from) conds.push(gte(invoices.date, q.from));
  if (q.to) conds.push(lte(invoices.date, q.to));
  if (q.customerId) conds.push(eq(invoices.customerId, q.customerId));
  if (q.locationId) conds.push(eq(invoices.locationId, q.locationId));
  if (q.status) conds.push(eq(invoices.status, q.status));
  if (q.salespersonId) conds.push(eq(invoices.salespersonId, q.salespersonId));
  if (q.paymentStatus === "due") conds.push(gt(invoices.amountDue, 0), eq(invoices.status, "completed"));
  else if (q.paymentStatus) conds.push(eq(invoices.paymentStatus, q.paymentStatus), eq(invoices.status, "completed"));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(
      or(like(invoices.number, term), like(customers.name, term), like(customers.phone, term), like(invoices.customerName, term))!,
    );
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    invoiceSelect(ctx)
      .where(where)
      .orderBy(q.order === "asc" ? asc(invoices.createdAt) : desc(invoices.createdAt))
      .limit(limit)
      .offset(offset),
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(case when ${invoices.status} = 'completed' then ${invoices.total} else 0 end), 0)`,
        due: sql<number>`coalesce(sum(case when ${invoices.status} = 'completed' then ${invoices.amountDue} else 0 end), 0)`,
      })
      .from(invoices)
      .leftJoin(customers, eq(customers.id, invoices.customerId))
      .where(where),
  ]);
  return {
    ...paged(rows.map(mapInvoice), count?.n ?? 0, q),
    totals: { total: Number(count?.total ?? 0), due: Number(count?.due ?? 0) },
  };
}

export async function getReturnable(ctx: Ctx, invoiceId: string): Promise<ReturnableLine[]> {
  const [inv] = await ctx.db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, ctx.businessId)));
  if (!inv) throw notFound("Invoice");
  const lines = await ctx.db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId))
    .orderBy(asc(invoiceLines.sortOrder));
  return lines.map((l) => ({
    ...mapInvoiceLine(l),
    returnableQuantity: Math.max(0, Math.round((l.quantity - l.quantityReturned) * 1000) / 1000),
  }));
}

// ---------------------------------------------------------------- returns

const exchangeInvoice = alias(invoices, "exchange_invoice");
const origInvoice = alias(invoices, "orig_invoice");

function returnSelect(ctx: Ctx) {
  return ctx.db
    .select({
      r: saleReturns,
      invoiceNumber: origInvoice.number,
      customerName: customers.name,
      locationName: locations.name,
      exchangeInvoiceNumber: exchangeInvoice.number,
      createdByName: creator.name,
    })
    .from(saleReturns)
    .leftJoin(origInvoice, eq(origInvoice.id, saleReturns.invoiceId))
    .leftJoin(customers, eq(customers.id, saleReturns.customerId))
    .leftJoin(locations, eq(locations.id, saleReturns.locationId))
    .leftJoin(exchangeInvoice, eq(exchangeInvoice.id, saleReturns.exchangeInvoiceId))
    .leftJoin(creator, eq(creator.id, saleReturns.createdBy));
}

type ReturnSelectRow = Awaited<ReturnType<ReturnType<typeof returnSelect>["where"]>>[number];

function mapReturn(row: ReturnSelectRow): SaleReturn {
  const r = row.r;
  return {
    id: r.id,
    number: r.number,
    date: r.date,
    createdAt: r.createdAt,
    invoiceId: r.invoiceId,
    invoiceNumber: row.invoiceNumber ?? "",
    customerId: r.customerId,
    customerName: row.customerName ?? null,
    locationId: r.locationId,
    locationName: row.locationName ?? null,
    reason: r.reason,
    netTotal: r.netTotal,
    taxTotal: r.taxTotal,
    total: r.total,
    costTotal: r.costTotal,
    appliedToInvoice: r.appliedToInvoice,
    refunded: r.refunded,
    toStoreCredit: r.toStoreCredit,
    appliedToExchange: r.appliedToExchange,
    exchangeInvoiceId: r.exchangeInvoiceId,
    exchangeInvoiceNumber: row.exchangeInvoiceNumber ?? null,
    createdByName: row.createdByName ?? null,
  };
}

export async function getReturnDto(ctx: Ctx, id: string): Promise<SaleReturn> {
  const [row] = await returnSelect(ctx).where(and(eq(saleReturns.id, id), eq(saleReturns.businessId, ctx.businessId)));
  if (!row) throw notFound("Return");
  const [lines, pays] = await Promise.all([
    ctx.db.select().from(saleReturnLines).where(eq(saleReturnLines.returnId, id)),
    paymentsForDoc(ctx, "sale_return", id),
  ]);
  return {
    ...mapReturn(row),
    lines: lines.map(
      (l): SaleReturnLine => ({
        id: l.id,
        invoiceLineId: l.invoiceLineId,
        variantId: l.variantId,
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        net: l.net,
        tax: l.tax,
        total: l.total,
        unitCost: l.unitCost,
        restock: l.restock,
      }),
    ),
    payments: pays,
  };
}

export async function listReturns(
  ctx: Ctx,
  q: { page: number; pageSize: number; q?: string; from?: string; to?: string; customerId?: string; locationId?: string; invoiceId?: string },
) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(saleReturns.businessId, ctx.businessId)];
  if (q.from) conds.push(gte(saleReturns.date, q.from));
  if (q.to) conds.push(lte(saleReturns.date, q.to));
  if (q.customerId) conds.push(eq(saleReturns.customerId, q.customerId));
  if (q.locationId) conds.push(eq(saleReturns.locationId, q.locationId));
  if (q.invoiceId) conds.push(eq(saleReturns.invoiceId, q.invoiceId));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(saleReturns.number, term), like(origInvoice.number, term), like(customers.name, term))!);
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    returnSelect(ctx).where(where).orderBy(desc(saleReturns.createdAt)).limit(limit).offset(offset),
    ctx.db
      .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${saleReturns.total}), 0)` })
      .from(saleReturns)
      .leftJoin(origInvoice, eq(origInvoice.id, saleReturns.invoiceId))
      .leftJoin(customers, eq(customers.id, saleReturns.customerId))
      .where(where),
  ]);
  return { ...paged(rows.map(mapReturn), count?.n ?? 0, q), totals: { total: Number(count?.total ?? 0) } };
}

