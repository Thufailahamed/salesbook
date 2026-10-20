import { and, asc, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  calculateDocument,
  roundQty,
  type DiscountType,
  type Quotation,
  type QuotationInput,
  type QuotationLine,
  type QuotationStatus,
} from "@shopbooks/shared";
import { customers, locations, quotationLines, quotations, users } from "../db/schema";
import { insertMany } from "../lib/batch";
import type { Ctx } from "../lib/context";
import { badRequest, notFound } from "../lib/errors";
import { likeQ, pageParams, paged } from "../lib/http";
import { newId } from "../lib/ids";
import { getCustomer } from "./payments";
import { getLocation, taxRateMap } from "./sales";
import { reserveNumbers } from "./sequences";
import { loadVariants } from "./stock";
import { Tx } from "./tx";

export type QuotationRow = typeof quotations.$inferSelect;

const creator = alias(users, "creator");

function quotationSelect(ctx: Ctx) {
  return ctx.db
    .select({
      q: quotations,
      customerFullName: customers.name,
      customerPhone: customers.phone,
      locationName: locations.name,
      createdByName: creator.name,
    })
    .from(quotations)
    .leftJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(locations, eq(locations.id, quotations.locationId))
    .leftJoin(creator, eq(creator.id, quotations.createdBy));
}

type QuotationSelectRow = Awaited<ReturnType<ReturnType<typeof quotationSelect>["where"]>>[number];

/** Draft/sent quotes past their validity date read as "expired". */
function effectiveStatus(ctx: Ctx, q: QuotationRow): QuotationStatus {
  const s = q.status as QuotationStatus;
  if ((s === "draft" || s === "sent") && q.validUntil && q.validUntil < ctx.today) return "expired";
  return s;
}

function mapQuotation(ctx: Ctx, r: QuotationSelectRow): Quotation {
  const q = r.q;
  return {
    id: q.id,
    number: q.number,
    date: q.date,
    validUntil: q.validUntil,
    status: effectiveStatus(ctx, q),
    customerId: q.customerId,
    customerName: r.customerFullName ?? q.customerName ?? null,
    customerPhone: r.customerPhone ?? null,
    locationId: q.locationId,
    locationName: r.locationName ?? null,
    taxInclusive: q.taxInclusive,
    subtotal: q.subtotal,
    docDiscountType: (q.docDiscountType as DiscountType | null) ?? null,
    docDiscountValue: q.docDiscountValue,
    discountTotal: q.discountTotal,
    netTotal: q.netTotal,
    taxTotal: q.taxTotal,
    shipping: q.shipping,
    total: q.total,
    notes: q.notes,
    terms: q.terms,
    convertedInvoiceId: q.convertedInvoiceId,
    createdByName: r.createdByName ?? null,
    createdAt: q.createdAt,
    itemCount: q.itemCount,
  };
}

function mapLine(l: typeof quotationLines.$inferSelect): QuotationLine {
  return {
    id: l.id,
    variantId: l.variantId,
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
  };
}

export async function getQuotationRow(ctx: Ctx, id: string): Promise<QuotationRow> {
  const [row] = await ctx.db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.businessId, ctx.businessId)));
  if (!row) throw notFound("Quotation");
  return row;
}

export async function getQuotationDto(ctx: Ctx, id: string): Promise<Quotation> {
  const [row] = await quotationSelect(ctx).where(and(eq(quotations.id, id), eq(quotations.businessId, ctx.businessId)));
  if (!row) throw notFound("Quotation");
  const lines = await ctx.db
    .select()
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, id))
    .orderBy(asc(quotationLines.sortOrder));
  return { ...mapQuotation(ctx, row), lines: lines.map(mapLine) };
}

export async function listQuotations(
  ctx: Ctx,
  q: {
    page: number;
    pageSize: number;
    q?: string;
    from?: string;
    to?: string;
    status?: QuotationStatus;
    customerId?: string;
    locationId?: string;
  },
) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(quotations.businessId, ctx.businessId)];
  if (q.from) conds.push(gte(quotations.date, q.from));
  if (q.to) conds.push(lte(quotations.date, q.to));
  if (q.customerId) conds.push(eq(quotations.customerId, q.customerId));
  if (q.locationId) conds.push(eq(quotations.locationId, q.locationId));
  if (q.status === "expired") {
    conds.push(
      or(
        eq(quotations.status, "expired"),
        and(sql`${quotations.status} IN ('draft','sent')`, sql`${quotations.validUntil} < ${ctx.today}`),
      )!,
    );
  } else if (q.status === "draft" || q.status === "sent") {
    conds.push(
      eq(quotations.status, q.status),
      or(sql`${quotations.validUntil} IS NULL`, sql`${quotations.validUntil} >= ${ctx.today}`)!,
    );
  } else if (q.status) {
    conds.push(eq(quotations.status, q.status));
  }
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(quotations.number, term), like(customers.name, term), like(quotations.customerName, term))!);
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    quotationSelect(ctx).where(where).orderBy(desc(quotations.createdAt)).limit(limit).offset(offset),
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(quotations)
      .leftJoin(customers, eq(customers.id, quotations.customerId))
      .where(where),
  ]);
  return paged(
    rows.map((r) => mapQuotation(ctx, r)),
    count?.n ?? 0,
    q,
  );
}

/** Validates the input and computes all line/document amounts. */
async function buildQuotation(ctx: Ctx, input: QuotationInput) {
  const location = await getLocation(ctx, input.locationId);
  const customer = input.customerId ? await getCustomer(ctx, input.customerId) : null;
  const info = await loadVariants(
    ctx,
    input.lines.map((l) => l.variantId).filter((v): v is string => !!v),
  );
  const rates = await taxRateMap(ctx);
  const lines = input.lines.map((l) => {
    if (l.variantId) {
      const v = info.get(l.variantId)!;
      return {
        variantId: v.id,
        name: l.name?.trim() || v.displayName,
        sku: v.sku,
        quantity: roundQty(l.quantity),
        unitPrice: l.unitPrice,
        discountType: l.discountType ?? null,
        discountValue: l.discountValue ?? null,
        taxRate: v.taxRateId ? (rates.get(v.taxRateId) ?? 0) : 0,
      };
    }
    if (!l.name?.trim()) throw badRequest("Custom items need a name");
    return {
      variantId: null,
      name: l.name.trim(),
      sku: null,
      quantity: roundQty(l.quantity),
      unitPrice: l.unitPrice,
      discountType: l.discountType ?? null,
      discountValue: l.discountValue ?? null,
      taxRate: l.taxRate ?? 0,
    };
  });
  const calc = calculateDocument(lines, {
    taxInclusive: ctx.business.taxInclusive,
    docDiscountType: input.docDiscountType ?? null,
    docDiscountValue: input.docDiscountValue ?? null,
    shipping: input.shipping ?? 0,
    roundingIncrement: 0,
  });
  if (input.validUntil && input.date && input.validUntil < input.date) {
    throw badRequest("'Valid until' must be on or after the quotation date");
  }
  return { location, customer, lines, calc };
}

function lineRows(ctx: Ctx, quotationId: string, built: Awaited<ReturnType<typeof buildQuotation>>) {
  return built.lines.map((l, i) => ({
    id: newId(),
    quotationId,
    businessId: ctx.businessId,
    variantId: l.variantId,
    name: l.name,
    sku: l.sku,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountType: l.discountType,
    discountValue: l.discountValue,
    lineDiscount: built.calc.lines[i]!.lineDiscount,
    docDiscount: built.calc.lines[i]!.docDiscount,
    taxRate: l.taxRate,
    net: built.calc.lines[i]!.net,
    tax: built.calc.lines[i]!.tax,
    total: built.calc.lines[i]!.total,
    sortOrder: i,
  }));
}

function headerValues(ctx: Ctx, input: QuotationInput, built: Awaited<ReturnType<typeof buildQuotation>>) {
  return {
    date: input.date ?? ctx.today,
    validUntil: input.validUntil ?? null,
    customerId: built.customer?.id ?? null,
    customerName: built.customer?.name ?? input.customerName?.trim() ?? null,
    locationId: built.location.id,
    taxInclusive: ctx.business.taxInclusive,
    subtotal: built.calc.subtotal,
    docDiscountType: input.docDiscountType ?? null,
    docDiscountValue: input.docDiscountValue ?? null,
    discountTotal: built.calc.discountTotal,
    netTotal: built.calc.netTotal,
    taxTotal: built.calc.taxTotal,
    shipping: built.calc.shipping,
    total: built.calc.total,
    itemCount: roundQty(built.lines.reduce((s, l) => s + l.quantity, 0)),
    notes: input.notes ?? null,
    terms: input.terms ?? ctx.business.invoiceTerms ?? null,
  };
}

export async function createQuotation(ctx: Ctx, input: QuotationInput) {
  ctx.require("quotations.manage");
  if (input.status === "converted") throw badRequest("Quotations are converted by checking them out at the POS");
  const built = await buildQuotation(ctx, input);
  const { quotation } = await reserveNumbers(ctx, { quotation: 1 });
  const number = quotation[0]!;
  const id = newId();
  const tx = new Tx(ctx);
  tx.add(
    ctx.db.insert(quotations).values({
      id,
      businessId: ctx.businessId,
      number,
      status: input.status ?? "draft",
      ...headerValues(ctx, input, built),
      createdBy: ctx.userId,
      createdAt: ctx.now,
    }),
  );
  tx.add(insertMany(ctx.db, quotationLines, lineRows(ctx, id, built)));
  tx.audit("quotation.create", `Created quotation ${number}`, "quotation", id, { total: built.calc.total });
  await tx.commit();
  return getQuotationDto(ctx, id);
}

export async function updateQuotation(ctx: Ctx, id: string, input: QuotationInput) {
  ctx.require("quotations.manage");
  const existing = await getQuotationRow(ctx, id);
  if (existing.status === "converted") throw badRequest("A converted quotation can't be edited");
  if (input.status === "converted") throw badRequest("Quotations are converted by checking them out at the POS");
  const built = await buildQuotation(ctx, input);
  const tx = new Tx(ctx);
  tx.add(
    ctx.db
      .update(quotations)
      .set({ ...headerValues(ctx, input, built), status: input.status ?? existing.status })
      .where(eq(quotations.id, id)),
  );
  tx.add(ctx.db.delete(quotationLines).where(eq(quotationLines.quotationId, id)));
  tx.add(insertMany(ctx.db, quotationLines, lineRows(ctx, id, built)));
  tx.audit("quotation.update", `Updated quotation ${existing.number}`, "quotation", id);
  await tx.commit();
  return getQuotationDto(ctx, id);
}

export async function setQuotationStatus(ctx: Ctx, id: string, status: QuotationStatus) {
  ctx.require("quotations.manage");
  const existing = await getQuotationRow(ctx, id);
  if (existing.status === "converted") throw badRequest("This quotation has already been converted to a sale");
  if (status === "converted") throw badRequest("Quotations are converted by checking them out at the POS");
  const tx = new Tx(ctx);
  tx.add(ctx.db.update(quotations).set({ status }).where(eq(quotations.id, id)));
  tx.audit("quotation.status", `Quotation ${existing.number} marked ${status}`, "quotation", id);
  await tx.commit();
  return getQuotationDto(ctx, id);
}

export async function deleteQuotation(ctx: Ctx, id: string) {
  ctx.require("quotations.manage");
  const existing = await getQuotationRow(ctx, id);
  if (existing.status === "converted") throw badRequest("A converted quotation can't be deleted");
  const tx = new Tx(ctx);
  tx.add(ctx.db.delete(quotationLines).where(eq(quotationLines.quotationId, id)));
  tx.add(ctx.db.delete(quotations).where(eq(quotations.id, id)));
  tx.audit("quotation.delete", `Deleted quotation ${existing.number}`, "quotation", id);
  await tx.commit();
}
