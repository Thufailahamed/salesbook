import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  type AllocationDocType,
  type ApplyCreditInput,
  type CreditRefundInput,
  type PartyPaymentInput,
  type PartyType,
  type Payment,
  type PaymentDirection,
  type PaymentMethodType,
  type PaymentSource,
  type Tender,
  type TenderInput,
} from "@shopbooks/shared";
import {
  customers,
  giftCards,
  invoices,
  journalEntries,
  paymentAllocations,
  paymentMethods,
  payments,
  purchases,
  shifts,
  suppliers,
  users,
} from "../db/schema";
import { insertMany, type Stmt } from "../lib/batch";
import { docDate, type Ctx } from "../lib/context";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { reserveNumbers } from "./sequences";
import { Tx, queueReversals } from "./tx";

export type CustomerRow = typeof customers.$inferSelect;
export type SupplierRow = typeof suppliers.$inferSelect;
export type MethodRow = typeof paymentMethods.$inferSelect;
export type GiftCardRow = typeof giftCards.$inferSelect;
export type ShiftRow = typeof shifts.$inferSelect;

// ---------------------------------------------------------------- lookups

export async function getCustomer(ctx: Ctx, id: string): Promise<CustomerRow> {
  const [row] = await ctx.db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.businessId, ctx.businessId)));
  if (!row) throw notFound("Customer");
  return row;
}

export async function getSupplier(ctx: Ctx, id: string): Promise<SupplierRow> {
  const [row] = await ctx.db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.businessId, ctx.businessId)));
  if (!row) throw notFound("Supplier");
  return row;
}

export async function loadMethods(ctx: Ctx): Promise<Map<string, MethodRow>> {
  const rows = await ctx.db.select().from(paymentMethods).where(eq(paymentMethods.businessId, ctx.businessId));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function requireMethod(ctx: Ctx, methodId: string | null | undefined, methods?: Map<string, MethodRow>) {
  if (!methodId) throw badRequest("Choose a payment method");
  const map = methods ?? (await loadMethods(ctx));
  const m = map.get(methodId);
  if (!m || !m.isActive) throw badRequest("That payment method is not available");
  return m;
}

/** The current user's open register shift (optionally at a location). */
export async function getOpenShift(ctx: Ctx, locationId?: string | null): Promise<ShiftRow | null> {
  const conds = [eq(shifts.businessId, ctx.businessId), eq(shifts.userId, ctx.userId), eq(shifts.status, "open")];
  if (locationId) conds.push(eq(shifts.locationId, locationId));
  const [row] = await ctx.db.select().from(shifts).where(and(...conds)).orderBy(desc(shifts.openedAt)).limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------- tenders

export interface ResolvedTender {
  tender: Tender;
  amount: number;
  accountId: string;
  methodId: string | null;
  methodType: PaymentMethodType | null;
  methodName: string | null;
  tendered: number | null;
  change: number | null;
  reference: string | null;
  giftCard: GiftCardRow | null;
  points: number | null;
}

/** Validates customer-side tenders (POS checkout / invoice payments). */
export async function resolveCustomerTenders(
  ctx: Ctx,
  inputs: TenderInput[],
  customer: CustomerRow | null,
): Promise<ResolvedTender[]> {
  const list = inputs.filter((t) => t.amount > 0);
  if (list.length === 0) return [];
  const sys = await ctx.accounts();
  const methods = list.some((t) => t.tender === "method") ? await loadMethods(ctx) : new Map<string, MethodRow>();
  const out: ResolvedTender[] = [];

  let storeCredit = 0;
  let points = 0;
  const cardUse = new Map<string, number>();

  for (const t of list) {
    const base = {
      amount: t.amount,
      reference: t.reference?.trim() || null,
      tendered: null as number | null,
      change: null as number | null,
      giftCard: null as GiftCardRow | null,
      points: null as number | null,
      methodId: null as string | null,
      methodType: null as PaymentMethodType | null,
      methodName: null as string | null,
    };
    switch (t.tender) {
      case "method": {
        const m = await requireMethod(ctx, t.methodId, methods);
        const tendered = t.tendered && t.tendered > t.amount ? t.tendered : null;
        out.push({
          ...base,
          tender: "method",
          accountId: m.accountId,
          methodId: m.id,
          methodType: m.type as PaymentMethodType,
          methodName: m.name,
          tendered: tendered ?? t.amount,
          change: tendered ? tendered - t.amount : 0,
        });
        break;
      }
      case "store_credit": {
        if (!customer) throw badRequest("Select the customer to use store credit");
        storeCredit += t.amount;
        if (storeCredit > customer.creditBalance) throw badRequest("Not enough store credit");
        out.push({ ...base, tender: "store_credit", accountId: sys.store_credit });
        break;
      }
      case "gift_card": {
        const code = t.giftCardCode?.trim().toUpperCase();
        if (!code) throw badRequest("Enter the gift card code");
        const [card] = await ctx.db
          .select()
          .from(giftCards)
          .where(and(eq(giftCards.businessId, ctx.businessId), eq(giftCards.code, code)));
        if (!card) throw badRequest(`Gift card ${code} not found`);
        if (card.status !== "active") throw badRequest(`Gift card ${code} is ${card.status}`);
        if (card.expiresOn && card.expiresOn < ctx.today) throw badRequest(`Gift card ${code} expired on ${card.expiresOn}`);
        const used = (cardUse.get(card.id) ?? 0) + t.amount;
        if (used > card.balance) throw badRequest(`Gift card ${code} doesn't have enough balance`);
        cardUse.set(card.id, used);
        out.push({ ...base, tender: "gift_card", accountId: sys.gift_card, giftCard: card, reference: code });
        break;
      }
      case "loyalty": {
        if (!ctx.business.loyaltyEnabled) throw badRequest("Loyalty points are not enabled");
        if (!customer) throw badRequest("Select the customer to redeem points");
        const p = t.points ?? 0;
        if (p <= 0) throw badRequest("Enter the points to redeem");
        if (p < ctx.business.loyaltyMinRedeem) throw badRequest(`At least ${ctx.business.loyaltyMinRedeem} points are required`);
        if (p * ctx.business.loyaltyPointValue !== t.amount) throw badRequest("Loyalty amount doesn't match the points redeemed");
        points += p;
        if (points > customer.loyaltyPoints) throw badRequest("Not enough loyalty points");
        out.push({ ...base, tender: "loyalty", accountId: sys.discounts, points: p });
        break;
      }
    }
  }
  return out;
}

export function tenderTotals(tenders: ResolvedTender[]) {
  const sum = (k: Tender) => tenders.filter((t) => t.tender === k).reduce((s, t) => s + t.amount, 0);
  return {
    total: tenders.reduce((s, t) => s + t.amount, 0),
    storeCredit: sum("store_credit"),
    loyaltyPoints: tenders.reduce((s, t) => s + (t.points ?? 0), 0),
    loyaltyAmount: sum("loyalty"),
    change: tenders.reduce((s, t) => s + (t.change ?? 0), 0),
  };
}

// ---------------------------------------------------------------- statement builders

export interface PaymentRowArgs {
  id?: string;
  number: string;
  date: string;
  direction: PaymentDirection;
  source: PaymentSource;
  partyType: PartyType;
  partyId: string | null;
  tender: ResolvedTender;
  shiftId?: string | null;
  locationId?: string | null;
  note?: string | null;
}

export function paymentInsert(ctx: Ctx, a: PaymentRowArgs) {
  const id = a.id ?? newId();
  const stmt = ctx.db.insert(payments).values({
    id,
    businessId: ctx.businessId,
    number: a.number,
    date: a.date,
    direction: a.direction,
    source: a.source,
    partyType: a.partyType,
    partyId: a.partyId,
    tender: a.tender.tender,
    methodId: a.tender.methodId,
    accountId: a.tender.accountId,
    amount: a.tender.amount,
    tendered: a.tender.tendered,
    change: a.tender.change,
    reference: a.tender.reference,
    note: a.note ?? null,
    giftCardId: a.tender.giftCard?.id ?? null,
    points: a.tender.points,
    status: "completed",
    // Only money tenders belong to a register shift.
    shiftId: a.tender.tender === "method" ? (a.shiftId ?? null) : null,
    locationId: a.locationId ?? null,
    createdBy: ctx.userId,
    createdAt: ctx.now,
  }) as unknown as Stmt;
  return { id, stmt };
}

export function allocationInserts(
  ctx: Ctx,
  paymentId: string,
  allocs: { docType: AllocationDocType; docId: string; amount: number }[],
): Stmt[] {
  return insertMany(
    ctx.db,
    paymentAllocations,
    allocs
      .filter((a) => a.amount !== 0)
      .map((a) => ({
        id: newId(),
        businessId: ctx.businessId,
        paymentId,
        docType: a.docType,
        docId: a.docId,
        amount: a.amount,
        createdAt: ctx.now,
      })),
  );
}

/** Relative paid/due update with status recomputed from the new values. */
export function invoicePaidDelta(ctx: Ctx, invoiceId: string, delta: number): Stmt {
  return ctx.db
    .update(invoices)
    .set({
      amountPaid: sql`${invoices.amountPaid} + ${delta}`,
      amountDue: sql`${invoices.amountDue} - ${delta}`,
      paymentStatus: sql`CASE WHEN ${invoices.amountDue} - ${delta} <= 0 THEN 'paid' WHEN ${invoices.amountPaid} + ${delta} > 0 THEN 'partial' ELSE 'unpaid' END`,
    })
    .where(eq(invoices.id, invoiceId)) as unknown as Stmt;
}

export function purchasePaidDelta(ctx: Ctx, purchaseId: string, delta: number): Stmt {
  return ctx.db
    .update(purchases)
    .set({
      amountPaid: sql`${purchases.amountPaid} + ${delta}`,
      amountDue: sql`${purchases.amountDue} - ${delta}`,
      paymentStatus: sql`CASE WHEN ${purchases.amountDue} - ${delta} <= 0 THEN 'paid' WHEN ${purchases.amountPaid} + ${delta} > 0 THEN 'partial' ELSE 'unpaid' END`,
      updatedAt: ctx.now,
    })
    .where(eq(purchases.id, purchaseId)) as unknown as Stmt;
}

export interface CustomerDelta {
  due?: number;
  credit?: number;
  points?: number;
  spent?: number;
  invoices?: number;
  purchasedAt?: number | null;
}

export function customerDelta(ctx: Ctx, customerId: string, d: CustomerDelta): Stmt {
  return ctx.db
    .update(customers)
    .set({
      dueBalance: sql`${customers.dueBalance} + ${d.due ?? 0}`,
      creditBalance: sql`${customers.creditBalance} + ${d.credit ?? 0}`,
      loyaltyPoints: sql`max(0, ${customers.loyaltyPoints} + ${d.points ?? 0})`,
      totalSpent: sql`${customers.totalSpent} + ${d.spent ?? 0}`,
      invoiceCount: sql`max(0, ${customers.invoiceCount} + ${d.invoices ?? 0})`,
      ...(d.purchasedAt ? { lastPurchaseAt: d.purchasedAt } : {}),
    })
    .where(eq(customers.id, customerId)) as unknown as Stmt;
}

export function supplierDelta(
  ctx: Ctx,
  supplierId: string,
  d: { due?: number; credit?: number; purchased?: number; purchasedAt?: number | null },
): Stmt {
  return ctx.db
    .update(suppliers)
    .set({
      dueBalance: sql`${suppliers.dueBalance} + ${d.due ?? 0}`,
      creditBalance: sql`${suppliers.creditBalance} + ${d.credit ?? 0}`,
      totalPurchased: sql`${suppliers.totalPurchased} + ${d.purchased ?? 0}`,
      ...(d.purchasedAt ? { lastPurchaseAt: d.purchasedAt } : {}),
    })
    .where(eq(suppliers.id, supplierId)) as unknown as Stmt;
}

export function giftCardDelta(ctx: Ctx, cardId: string, delta: number): Stmt {
  return ctx.db
    .update(giftCards)
    .set({
      balance: sql`${giftCards.balance} + ${delta}`,
      status: sql`CASE WHEN ${giftCards.status} IN ('void','expired') THEN ${giftCards.status} WHEN ${giftCards.balance} + ${delta} <= 0 THEN 'redeemed' ELSE 'active' END`,
    })
    .where(eq(giftCards.id, cardId)) as unknown as Stmt;
}

/** Party-side effects of customer tenders (store credit / loyalty / gift cards). */
export function queueTenderSideEffects(ctx: Ctx, tx: Tx, tenders: ResolvedTender[], sign: 1 | -1 = 1) {
  for (const t of tenders) {
    if (t.tender === "gift_card" && t.giftCard) tx.add(giftCardDelta(ctx, t.giftCard.id, -sign * t.amount));
  }
}

// ---------------------------------------------------------------- allocation

export interface OpenDoc {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  amountDue: number;
}

export async function openInvoices(ctx: Ctx, customerId: string): Promise<OpenDoc[]> {
  return ctx.db
    .select({
      id: invoices.id,
      number: invoices.number,
      date: invoices.date,
      dueDate: invoices.dueDate,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
      amountDue: invoices.amountDue,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, ctx.businessId),
        eq(invoices.customerId, customerId),
        eq(invoices.status, "completed"),
        gt(invoices.amountDue, 0),
      ),
    )
    .orderBy(asc(invoices.date), asc(invoices.createdAt));
}

export async function openBills(ctx: Ctx, supplierId: string): Promise<OpenDoc[]> {
  return ctx.db
    .select({
      id: purchases.id,
      number: purchases.number,
      date: purchases.orderDate,
      dueDate: purchases.dueDate,
      total: purchases.total,
      amountPaid: purchases.amountPaid,
      amountDue: purchases.amountDue,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.businessId, ctx.businessId),
        eq(purchases.supplierId, supplierId),
        eq(purchases.status, "received"),
        gt(purchases.amountDue, 0),
      ),
    )
    .orderBy(asc(purchases.orderDate), asc(purchases.createdAt));
}

/** Validates requested allocations or allocates oldest-first. */
export function allocate(
  amount: number,
  docs: OpenDoc[],
  requested?: { docId: string; amount: number }[] | null,
): { docId: string; amount: number; doc: OpenDoc }[] {
  const byId = new Map(docs.map((d) => [d.id, d]));
  if (requested && requested.length > 0) {
    let sum = 0;
    const merged = new Map<string, number>();
    for (const r of requested) merged.set(r.docId, (merged.get(r.docId) ?? 0) + r.amount);
    const out: { docId: string; amount: number; doc: OpenDoc }[] = [];
    for (const [docId, amt] of merged) {
      if (amt <= 0) continue;
      const doc = byId.get(docId);
      if (!doc) throw badRequest("A selected document is not open for payment");
      if (amt > doc.amountDue) throw badRequest(`Allocation exceeds the balance of ${doc.number}`);
      sum += amt;
      out.push({ docId, amount: amt, doc });
    }
    if (sum > amount) throw badRequest("Allocations exceed the payment amount");
    return out;
  }
  let left = amount;
  const out: { docId: string; amount: number; doc: OpenDoc }[] = [];
  for (const d of docs) {
    if (left <= 0) break;
    const a = Math.min(left, d.amountDue);
    if (a > 0) {
      out.push({ docId: d.id, amount: a, doc: d });
      left -= a;
    }
  }
  return out;
}

// ---------------------------------------------------------------- customer account payments

export async function receiveCustomerPayment(ctx: Ctx, customerId: string, input: PartyPaymentInput) {
  ctx.require("customers.payments");
  const customer = await getCustomer(ctx, customerId);
  const method = await requireMethod(ctx, input.methodId);
  const date = docDate(ctx, input.date);
  const allocs = allocate(input.amount, await openInvoices(ctx, customerId), input.allocations);
  const allocated = allocs.reduce((s, a) => s + a.amount, 0);
  const advance = input.amount - allocated;
  const shift = method.type === "cash" ? await getOpenShift(ctx) : null;
  const sys = await ctx.accounts();
  const { receipt } = await reserveNumbers(ctx, { receipt: 1 });
  const number = receipt[0]!;

  const tx = new Tx(ctx);
  const { id: paymentId, stmt } = paymentInsert(ctx, {
    number,
    date,
    direction: "in",
    source: "customer_payment",
    partyType: "customer",
    partyId: customer.id,
    tender: {
      tender: "method",
      amount: input.amount,
      accountId: method.accountId,
      methodId: method.id,
      methodType: method.type as PaymentMethodType,
      methodName: method.name,
      tendered: null,
      change: null,
      reference: input.reference ?? null,
      giftCard: null,
      points: null,
    },
    shiftId: shift?.id,
    locationId: shift?.locationId,
    note: input.note,
  });
  tx.add(stmt);
  tx.add(allocationInserts(ctx, paymentId, allocs.map((a) => ({ docType: "invoice" as const, docId: a.docId, amount: a.amount }))));
  for (const a of allocs) tx.add(invoicePaidDelta(ctx, a.docId, a.amount));
  tx.add(customerDelta(ctx, customer.id, { due: -allocated, credit: advance }));
  tx.journal({
    date,
    memo: `Payment received from ${customer.name}`,
    sourceType: "payment",
    sourceId: paymentId,
    sourceNumber: number,
    locationId: shift?.locationId,
    lines: [
      { accountId: method.accountId, debit: input.amount },
      { accountId: sys.receivable, credit: allocated, partyType: "customer", partyId: customer.id },
      { accountId: sys.store_credit, credit: advance, partyType: "customer", partyId: customer.id, memo: "Advance / store credit" },
    ],
  });
  tx.audit("payment.receive", `Received ${number} from ${customer.name}`, "payment", paymentId, { amount: input.amount });
  await tx.commit();
  return getPaymentDto(ctx, paymentId);
}

export async function applyCustomerCredit(ctx: Ctx, customerId: string, input: ApplyCreditInput) {
  ctx.require("customers.payments");
  const customer = await getCustomer(ctx, customerId);
  if (customer.creditBalance <= 0) throw badRequest("This customer has no store credit");
  const docs = await openInvoices(ctx, customerId);
  const totalDue = docs.reduce((s, d) => s + d.amountDue, 0);
  if (totalDue <= 0) throw badRequest("This customer has no open invoices");
  const requestedTotal = input.allocations?.reduce((s, a) => s + a.amount, 0);
  const amount = Math.min(requestedTotal ?? input.amount ?? customer.creditBalance, customer.creditBalance, totalDue);
  if (amount <= 0) throw badRequest("Nothing to apply");
  if (requestedTotal !== undefined && requestedTotal > customer.creditBalance) throw badRequest("Not enough store credit");
  const allocs = allocate(amount, docs, input.allocations);
  const applied = allocs.reduce((s, a) => s + a.amount, 0);
  const sys = await ctx.accounts();
  const { receipt } = await reserveNumbers(ctx, { receipt: 1 });
  const number = receipt[0]!;

  const tx = new Tx(ctx);
  const { id: paymentId, stmt } = paymentInsert(ctx, {
    number,
    date: ctx.today,
    direction: "in",
    source: "customer_payment",
    partyType: "customer",
    partyId: customer.id,
    tender: {
      tender: "store_credit",
      amount: applied,
      accountId: sys.store_credit,
      methodId: null,
      methodType: null,
      methodName: null,
      tendered: null,
      change: null,
      reference: null,
      giftCard: null,
      points: null,
    },
    note: "Store credit applied to invoices",
  });
  tx.add(stmt);
  tx.add(allocationInserts(ctx, paymentId, allocs.map((a) => ({ docType: "invoice" as const, docId: a.docId, amount: a.amount }))));
  for (const a of allocs) tx.add(invoicePaidDelta(ctx, a.docId, a.amount));
  tx.add(customerDelta(ctx, customer.id, { due: -applied, credit: -applied }));
  tx.journal({
    date: ctx.today,
    memo: `Store credit applied for ${customer.name}`,
    sourceType: "payment",
    sourceId: paymentId,
    sourceNumber: number,
    lines: [
      { accountId: sys.store_credit, debit: applied, partyType: "customer", partyId: customer.id },
      { accountId: sys.receivable, credit: applied, partyType: "customer", partyId: customer.id },
    ],
  });
  tx.audit("customer.apply_credit", `Applied store credit ${number} for ${customer.name}`, "customer", customer.id);
  await tx.commit();
  return getCustomer(ctx, customerId);
}

export async function refundCustomerCredit(ctx: Ctx, customerId: string, input: CreditRefundInput) {
  ctx.require("customers.payments");
  const customer = await getCustomer(ctx, customerId);
  if (input.amount > customer.creditBalance) throw badRequest("Amount exceeds the customer's store credit");
  const method = await requireMethod(ctx, input.methodId);
  const date = docDate(ctx, input.date);
  const shift = method.type === "cash" ? await getOpenShift(ctx) : null;
  const sys = await ctx.accounts();
  const { payment } = await reserveNumbers(ctx, { payment: 1 });
  const number = payment[0]!;

  const tx = new Tx(ctx);
  const { id: paymentId, stmt } = paymentInsert(ctx, {
    number,
    date,
    direction: "out",
    source: "store_credit_refund",
    partyType: "customer",
    partyId: customer.id,
    tender: {
      tender: "method",
      amount: input.amount,
      accountId: method.accountId,
      methodId: method.id,
      methodType: method.type as PaymentMethodType,
      methodName: method.name,
      tendered: null,
      change: null,
      reference: input.reference ?? null,
      giftCard: null,
      points: null,
    },
    shiftId: shift?.id,
    locationId: shift?.locationId,
    note: input.note ?? "Store credit paid out",
  });
  tx.add(stmt);
  tx.add(customerDelta(ctx, customer.id, { credit: -input.amount }));
  tx.journal({
    date,
    memo: `Store credit refunded to ${customer.name}`,
    sourceType: "payment",
    sourceId: paymentId,
    sourceNumber: number,
    locationId: shift?.locationId,
    lines: [
      { accountId: sys.store_credit, debit: input.amount, partyType: "customer", partyId: customer.id },
      { accountId: method.accountId, credit: input.amount },
    ],
  });
  tx.audit("customer.refund_credit", `Refunded store credit ${number} to ${customer.name}`, "payment", paymentId);
  await tx.commit();
  return getPaymentDto(ctx, paymentId);
}

// ---------------------------------------------------------------- supplier account payments

function methodTender(m: MethodRow, amount: number, reference?: string | null): ResolvedTender {
  return {
    tender: "method",
    amount,
    accountId: m.accountId,
    methodId: m.id,
    methodType: m.type as PaymentMethodType,
    methodName: m.name,
    tendered: null,
    change: null,
    reference: reference ?? null,
    giftCard: null,
    points: null,
  };
}

export { methodTender };

export async function paySupplier(ctx: Ctx, supplierId: string, input: PartyPaymentInput) {
  ctx.require("suppliers.manage");
  const supplier = await getSupplier(ctx, supplierId);
  const method = await requireMethod(ctx, input.methodId);
  const date = docDate(ctx, input.date);
  const allocs = allocate(input.amount, await openBills(ctx, supplierId), input.allocations);
  const allocated = allocs.reduce((s, a) => s + a.amount, 0);
  const advance = input.amount - allocated;
  const shift = method.type === "cash" ? await getOpenShift(ctx) : null;
  const sys = await ctx.accounts();
  const { payment } = await reserveNumbers(ctx, { payment: 1 });
  const number = payment[0]!;

  const tx = new Tx(ctx);
  const { id: paymentId, stmt } = paymentInsert(ctx, {
    number,
    date,
    direction: "out",
    source: "supplier_payment",
    partyType: "supplier",
    partyId: supplier.id,
    tender: methodTender(method, input.amount, input.reference),
    shiftId: shift?.id,
    locationId: shift?.locationId,
    note: input.note,
  });
  tx.add(stmt);
  tx.add(allocationInserts(ctx, paymentId, allocs.map((a) => ({ docType: "purchase" as const, docId: a.docId, amount: a.amount }))));
  for (const a of allocs) tx.add(purchasePaidDelta(ctx, a.docId, a.amount));
  tx.add(supplierDelta(ctx, supplier.id, { due: -allocated, credit: advance }));
  tx.journal({
    date,
    memo: `Payment to ${supplier.name}`,
    sourceType: "payment",
    sourceId: paymentId,
    sourceNumber: number,
    lines: [
      { accountId: sys.payable, debit: allocated, partyType: "supplier", partyId: supplier.id },
      { accountId: sys.supplier_advances, debit: advance, partyType: "supplier", partyId: supplier.id, memo: "Advance to supplier" },
      { accountId: method.accountId, credit: input.amount },
    ],
  });
  tx.audit("payment.make", `Paid ${number} to ${supplier.name}`, "payment", paymentId, { amount: input.amount });
  await tx.commit();
  return getPaymentDto(ctx, paymentId);
}

export async function applySupplierCredit(ctx: Ctx, supplierId: string, input: ApplyCreditInput) {
  ctx.require("suppliers.manage");
  const supplier = await getSupplier(ctx, supplierId);
  if (supplier.creditBalance <= 0) throw badRequest("This supplier has no credit with you");
  const docs = await openBills(ctx, supplierId);
  const totalDue = docs.reduce((s, d) => s + d.amountDue, 0);
  if (totalDue <= 0) throw badRequest("This supplier has no open bills");
  const requestedTotal = input.allocations?.reduce((s, a) => s + a.amount, 0);
  if (requestedTotal !== undefined && requestedTotal > supplier.creditBalance) throw badRequest("Not enough supplier credit");
  const amount = Math.min(requestedTotal ?? input.amount ?? supplier.creditBalance, supplier.creditBalance, totalDue);
  const allocs = allocate(amount, docs, input.allocations);
  const applied = allocs.reduce((s, a) => s + a.amount, 0);
  if (applied <= 0) throw badRequest("Nothing to apply");
  const sys = await ctx.accounts();
  const { payment } = await reserveNumbers(ctx, { payment: 1 });
  const number = payment[0]!;

  const tx = new Tx(ctx);
  const { id: paymentId, stmt } = paymentInsert(ctx, {
    number,
    date: ctx.today,
    direction: "out",
    source: "supplier_payment",
    partyType: "supplier",
    partyId: supplier.id,
    tender: {
      ...methodTender({ id: "", accountId: sys.supplier_advances, name: "", type: "other" } as MethodRow, applied),
      tender: "supplier_credit",
      methodId: null,
      methodType: null,
      methodName: null,
    },
    note: "Supplier credit applied to bills",
  });
  tx.add(stmt);
  tx.add(allocationInserts(ctx, paymentId, allocs.map((a) => ({ docType: "purchase" as const, docId: a.docId, amount: a.amount }))));
  for (const a of allocs) tx.add(purchasePaidDelta(ctx, a.docId, a.amount));
  tx.add(supplierDelta(ctx, supplier.id, { due: -applied, credit: -applied }));
  tx.journal({
    date: ctx.today,
    memo: `Supplier credit applied for ${supplier.name}`,
    sourceType: "payment",
    sourceId: paymentId,
    sourceNumber: number,
    lines: [
      { accountId: sys.payable, debit: applied, partyType: "supplier", partyId: supplier.id },
      { accountId: sys.supplier_advances, credit: applied, partyType: "supplier", partyId: supplier.id },
    ],
  });
  tx.audit("supplier.apply_credit", `Applied supplier credit ${number} for ${supplier.name}`, "supplier", supplier.id);
  await tx.commit();
  return getSupplier(ctx, supplierId);
}

export async function supplierRefundCredit(ctx: Ctx, supplierId: string, input: CreditRefundInput) {
  ctx.require("suppliers.manage");
  const supplier = await getSupplier(ctx, supplierId);
  if (input.amount > supplier.creditBalance) throw badRequest("Amount exceeds the supplier's credit");
  const method = await requireMethod(ctx, input.methodId);
  const date = docDate(ctx, input.date);
  const sys = await ctx.accounts();
  const { receipt } = await reserveNumbers(ctx, { receipt: 1 });
  const number = receipt[0]!;
  const shift = method.type === "cash" ? await getOpenShift(ctx) : null;

  const tx = new Tx(ctx);
  const { id: paymentId, stmt } = paymentInsert(ctx, {
    number,
    date,
    direction: "in",
    source: "supplier_refund",
    partyType: "supplier",
    partyId: supplier.id,
    tender: methodTender(method, input.amount, input.reference),
    shiftId: shift?.id,
    locationId: shift?.locationId,
    note: input.note ?? "Refund received from supplier",
  });
  tx.add(stmt);
  tx.add(supplierDelta(ctx, supplier.id, { credit: -input.amount }));
  tx.journal({
    date,
    memo: `Refund received from ${supplier.name}`,
    sourceType: "payment",
    sourceId: paymentId,
    sourceNumber: number,
    lines: [
      { accountId: method.accountId, debit: input.amount },
      { accountId: sys.supplier_advances, credit: input.amount, partyType: "supplier", partyId: supplier.id },
    ],
  });
  tx.audit("supplier.refund_credit", `Supplier refund ${number} from ${supplier.name}`, "payment", paymentId);
  await tx.commit();
  return getPaymentDto(ctx, paymentId);
}

// ---------------------------------------------------------------- void

const VOIDABLE: PaymentSource[] = [
  "customer_payment",
  "invoice_payment",
  "store_credit_refund",
  "supplier_payment",
  "supplier_refund",
];

export async function voidPayment(ctx: Ctx, paymentId: string, reason: string) {
  const [p] = await ctx.db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.businessId, ctx.businessId)));
  if (!p) throw notFound("Payment");
  if (p.status === "void") throw badRequest("This payment is already void");
  if (!VOIDABLE.includes(p.source as PaymentSource)) {
    throw badRequest("Payments taken at checkout are reversed by voiding or returning the invoice");
  }
  if (p.partyType === "supplier") ctx.require("suppliers.manage");
  else ctx.require("sales.void");

  const allocs = await ctx.db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, p.id));
  const allocated = allocs.reduce((s, a) => s + a.amount, 0);
  const unallocated = p.amount - allocated;
  const tx = new Tx(ctx);

  for (const a of allocs) {
    if (a.docType === "invoice") tx.add(invoicePaidDelta(ctx, a.docId, -a.amount));
    if (a.docType === "purchase") tx.add(purchasePaidDelta(ctx, a.docId, -a.amount));
  }

  if (p.partyType === "customer" && p.partyId) {
    const c = await getCustomer(ctx, p.partyId);
    if (p.source === "store_credit_refund") {
      tx.add(customerDelta(ctx, c.id, { credit: p.amount }));
    } else if (p.tender === "store_credit") {
      tx.add(customerDelta(ctx, c.id, { due: allocated, credit: allocated }));
    } else if (p.tender === "loyalty") {
      tx.add(customerDelta(ctx, c.id, { due: allocated, points: p.points ?? 0 }));
    } else {
      if (unallocated > c.creditBalance) {
        throw badRequest("The store credit created by this payment has already been used");
      }
      tx.add(customerDelta(ctx, c.id, { due: allocated, credit: -unallocated }));
    }
  } else if (p.partyType === "supplier" && p.partyId) {
    const s = await getSupplier(ctx, p.partyId);
    if (p.source === "supplier_refund") {
      tx.add(supplierDelta(ctx, s.id, { credit: p.amount }));
    } else if (p.tender === "supplier_credit") {
      tx.add(supplierDelta(ctx, s.id, { due: allocated, credit: allocated }));
    } else {
      if (unallocated > s.creditBalance) throw badRequest("The supplier credit from this payment has already been used");
      tx.add(supplierDelta(ctx, s.id, { due: allocated, credit: -unallocated }));
    }
  }
  if (p.tender === "gift_card" && p.giftCardId) tx.add(giftCardDelta(ctx, p.giftCardId, p.amount));

  const entries = await ctx.db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.businessId, ctx.businessId),
        eq(journalEntries.sourceType, "payment"),
        eq(journalEntries.sourceId, p.id),
      ),
    );
  await queueReversals(
    ctx,
    tx,
    entries.map((e) => e.id),
    { date: ctx.today, memo: `Void payment ${p.number}`, sourceType: "payment_void", sourceId: p.id, sourceNumber: p.number },
  );
  tx.add(
    ctx.db
      .update(payments)
      .set({ status: "void", note: [p.note, `Voided: ${reason}`].filter(Boolean).join(" — ") })
      .where(eq(payments.id, p.id)) as unknown as Stmt,
  );
  tx.audit("payment.void", `Voided payment ${p.number}: ${reason}`, "payment", p.id);
  await tx.commit();
  return getPaymentDto(ctx, p.id);
}

// ---------------------------------------------------------------- read models

const creator = alias(users, "creator");

function paymentSelect(ctx: Ctx) {
  return ctx.db
    .select({
      p: payments,
      methodName: paymentMethods.name,
      methodType: paymentMethods.type,
      giftCardCode: giftCards.code,
      customerName: customers.name,
      supplierName: suppliers.name,
      createdByName: creator.name,
    })
    .from(payments)
    .leftJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
    .leftJoin(giftCards, eq(giftCards.id, payments.giftCardId))
    .leftJoin(customers, and(eq(payments.partyType, "customer"), eq(customers.id, payments.partyId)))
    .leftJoin(suppliers, and(eq(payments.partyType, "supplier"), eq(suppliers.id, payments.partyId)))
    .leftJoin(creator, eq(creator.id, payments.createdBy));
}

type PaymentSelectRow = Awaited<ReturnType<ReturnType<typeof paymentSelect>["where"]>>[number];

async function allocationsFor(ctx: Ctx, paymentIds: string[]) {
  const map = new Map<string, Payment["allocations"]>();
  if (paymentIds.length === 0) return map;
  for (let i = 0; i < paymentIds.length; i += 90) {
    const chunk = paymentIds.slice(i, i + 90);
    const rows = await ctx.db
      .select({
        a: paymentAllocations,
        invoiceNumber: invoices.number,
        purchaseNumber: purchases.number,
      })
      .from(paymentAllocations)
      .leftJoin(invoices, and(eq(paymentAllocations.docType, "invoice"), eq(invoices.id, paymentAllocations.docId)))
      .leftJoin(purchases, and(eq(paymentAllocations.docType, "purchase"), eq(purchases.id, paymentAllocations.docId)))
      .where(inArray(paymentAllocations.paymentId, chunk));
    for (const r of rows) {
      const list = map.get(r.a.paymentId) ?? [];
      list.push({
        docType: r.a.docType as AllocationDocType,
        docId: r.a.docId,
        docNumber: r.invoiceNumber ?? r.purchaseNumber ?? null,
        amount: r.a.amount,
      });
      map.set(r.a.paymentId, list);
    }
  }
  return map;
}

export async function mapPayments(ctx: Ctx, rows: PaymentSelectRow[]): Promise<Payment[]> {
  const allocs = await allocationsFor(
    ctx,
    rows.map((r) => r.p.id),
  );
  return rows.map(({ p, ...j }) => ({
    id: p.id,
    number: p.number,
    date: p.date,
    createdAt: p.createdAt,
    direction: p.direction as PaymentDirection,
    source: p.source as PaymentSource,
    partyType: p.partyType as PartyType,
    partyId: p.partyId,
    partyName: j.customerName ?? j.supplierName ?? null,
    tender: p.tender as Tender,
    methodId: p.methodId,
    methodName: j.methodName ?? null,
    methodType: (j.methodType as PaymentMethodType | null) ?? null,
    accountId: p.accountId,
    amount: p.amount,
    tendered: p.tendered,
    change: p.change,
    reference: p.reference,
    note: p.note,
    giftCardId: p.giftCardId,
    giftCardCode: j.giftCardCode ?? null,
    points: p.points,
    status: p.status as "completed" | "void",
    shiftId: p.shiftId,
    createdByName: j.createdByName ?? null,
    allocations: allocs.get(p.id) ?? [],
  }));
}

export async function getPaymentDto(ctx: Ctx, id: string): Promise<Payment> {
  const rows = await paymentSelect(ctx).where(and(eq(payments.id, id), eq(payments.businessId, ctx.businessId)));
  if (!rows[0]) throw notFound("Payment");
  return (await mapPayments(ctx, rows))[0]!;
}

/** Payments linked to a document via allocations (invoice / return / purchase / purchase return). */
export async function paymentsForDoc(ctx: Ctx, docType: AllocationDocType, docId: string): Promise<Payment[]> {
  const ids = await ctx.db
    .select({ id: paymentAllocations.paymentId })
    .from(paymentAllocations)
    .where(and(eq(paymentAllocations.docType, docType), eq(paymentAllocations.docId, docId)));
  if (ids.length === 0) return [];
  const rows = await paymentSelect(ctx)
    .where(inArray(payments.id, [...new Set(ids.map((i) => i.id))]))
    .orderBy(asc(payments.createdAt));
  return mapPayments(ctx, rows);
}

export { paymentSelect };
