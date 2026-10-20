import { and, asc, desc, eq, lte, ne, notInArray } from "drizzle-orm";
import {
  TENDER_LABELS,
  type Customer,
  type CustomerType,
  type OpenDocument,
  type PriceTier,
  type Statement,
  type StatementEntry,
  type Supplier,
  type Tender,
} from "@shopbooks/shared";
import {
  customers,
  invoices,
  locations,
  paymentMethods,
  payments,
  purchaseReturns,
  purchases,
  saleReturns,
  suppliers,
} from "../db/schema";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import type { OpenDoc } from "./payments";

export function mapCustomer(c: typeof customers.$inferSelect): Customer {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    taxNumber: c.taxNumber,
    type: c.type as CustomerType,
    priceTier: c.priceTier as PriceTier,
    allowCredit: c.allowCredit,
    creditLimit: c.creditLimit,
    dueBalance: c.dueBalance,
    creditBalance: c.creditBalance,
    loyaltyPoints: c.loyaltyPoints,
    birthday: c.birthday,
    notes: c.notes,
    isActive: c.isActive,
    createdAt: c.createdAt,
    totalSpent: c.totalSpent,
    invoiceCount: c.invoiceCount,
    lastPurchaseAt: c.lastPurchaseAt,
  };
}

export function mapSupplier(s: typeof suppliers.$inferSelect): Supplier {
  return {
    id: s.id,
    name: s.name,
    contactName: s.contactName,
    phone: s.phone,
    email: s.email,
    address: s.address,
    taxNumber: s.taxNumber,
    paymentTermsDays: s.paymentTermsDays,
    dueBalance: s.dueBalance,
    creditBalance: s.creditBalance,
    notes: s.notes,
    isActive: s.isActive,
    createdAt: s.createdAt,
    totalPurchased: s.totalPurchased,
    lastPurchaseAt: s.lastPurchaseAt,
  };
}

export function mapOpenDoc(d: OpenDoc): OpenDocument {
  return { id: d.id, number: d.number, date: d.date, dueDate: d.dueDate, total: d.total, amountDue: d.amountDue };
}

/** The business's default (or first active) location — used for opening-balance documents. */
export async function defaultLocationId(ctx: Ctx): Promise<string> {
  const [row] = await ctx.db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.businessId, ctx.businessId), eq(locations.isActive, true)))
    .orderBy(desc(locations.isDefault), asc(locations.createdAt))
    .limit(1);
  if (!row) throw badRequest("Create a location first");
  return row.id;
}

type RawEntry = Omit<StatementEntry, "balance">;

function buildStatement(
  partyType: "customer" | "supplier",
  party: { id: string; name: string },
  from: string,
  to: string,
  raw: RawEntry[],
): Statement {
  raw.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  let openingBalance = 0;
  const inRange: RawEntry[] = [];
  for (const e of raw) {
    if (e.date < from) openingBalance += e.debit - e.credit;
    else if (e.date <= to) inRange.push(e);
  }
  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const entries: StatementEntry[] = inRange.map((e) => {
    running += e.debit - e.credit;
    totalDebit += e.debit;
    totalCredit += e.credit;
    return { ...e, balance: running };
  });
  return {
    partyType,
    partyId: party.id,
    partyName: party.name,
    from,
    to,
    openingBalance,
    entries,
    closingBalance: running,
    totalDebit,
    totalCredit,
  };
}

function viaLabel(tender: string, methodName: string | null) {
  return tender === "method" ? methodName : (TENDER_LABELS[tender as Tender] ?? null);
}

export function statementRange(ctx: Ctx, q: { from?: string; to?: string }) {
  const to = q.to ?? ctx.today;
  const from = q.from ?? `${ctx.today.slice(0, 4)}-01-01`;
  if (from > to) throw badRequest("'from' must be on or before 'to'");
  return { from, to };
}

/**
 * Customer statement. Balance = net position (amount owed − store credit).
 * Excluded payments: credit-note applications (the return already credits the account),
 * store-credit tenders (they consume an existing credit, net position unchanged) and gift-card sales.
 */
export async function customerStatement(
  ctx: Ctx,
  customer: { id: string; name: string },
  from: string,
  to: string,
): Promise<Statement> {
  const [invs, rets, pays] = await Promise.all([
    ctx.db
      .select({
        id: invoices.id,
        number: invoices.number,
        kind: invoices.kind,
        date: invoices.date,
        createdAt: invoices.createdAt,
        total: invoices.total,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.businessId, ctx.businessId),
          eq(invoices.customerId, customer.id),
          eq(invoices.status, "completed"),
          lte(invoices.date, to),
        ),
      ),
    ctx.db
      .select({
        id: saleReturns.id,
        number: saleReturns.number,
        date: saleReturns.date,
        createdAt: saleReturns.createdAt,
        total: saleReturns.total,
      })
      .from(saleReturns)
      .where(
        and(eq(saleReturns.businessId, ctx.businessId), eq(saleReturns.customerId, customer.id), lte(saleReturns.date, to)),
      ),
    ctx.db
      .select({ p: payments, methodName: paymentMethods.name })
      .from(payments)
      .leftJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
      .where(
        and(
          eq(payments.businessId, ctx.businessId),
          eq(payments.partyType, "customer"),
          eq(payments.partyId, customer.id),
          eq(payments.status, "completed"),
          notInArray(payments.tender, ["credit_note", "store_credit"]),
          ne(payments.source, "gift_card_sale"),
          lte(payments.date, to),
        ),
      ),
  ]);

  const raw: RawEntry[] = [
    ...invs.map((i) => ({
      date: i.date,
      createdAt: i.createdAt,
      type: i.kind === "opening_balance" ? "opening_balance" : "invoice",
      number: i.number,
      description: i.kind === "opening_balance" ? "Opening balance" : `Invoice ${i.number}`,
      debit: i.total,
      credit: 0,
      refType: "invoice",
      refId: i.id,
    })),
    ...rets.map((r) => ({
      date: r.date,
      createdAt: r.createdAt,
      type: "return",
      number: r.number,
      description: `Return / credit note ${r.number}`,
      debit: 0,
      credit: r.total,
      refType: "sale_return",
      refId: r.id,
    })),
    ...pays.map(({ p, methodName }) => {
      const via = viaLabel(p.tender, methodName ?? null);
      const incoming = p.direction === "in";
      const verb = incoming
        ? "Payment received"
        : p.source === "store_credit_refund"
          ? "Store credit paid out"
          : "Refund paid";
      return {
        date: p.date,
        createdAt: p.createdAt,
        type: incoming ? "payment" : "refund",
        number: p.number,
        description: via ? `${verb} — ${via}` : verb,
        debit: incoming ? 0 : p.amount,
        credit: incoming ? p.amount : 0,
        refType: "payment",
        refId: p.id,
      };
    }),
  ];
  return buildStatement("customer", customer, from, to, raw);
}

/**
 * Supplier statement. Balance = net amount we owe (bills − payments − returns − supplier credit).
 * Excluded payments: credit-note applications and supplier-credit applications (net position unchanged).
 */
export async function supplierStatement(
  ctx: Ctx,
  supplier: { id: string; name: string },
  from: string,
  to: string,
): Promise<Statement> {
  const [bills, rets, pays] = await Promise.all([
    ctx.db
      .select({
        id: purchases.id,
        number: purchases.number,
        kind: purchases.kind,
        date: purchases.receivedDate,
        orderDate: purchases.orderDate,
        createdAt: purchases.createdAt,
        total: purchases.total,
        supplierRef: purchases.supplierRef,
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.businessId, ctx.businessId),
          eq(purchases.supplierId, supplier.id),
          eq(purchases.status, "received"),
        ),
      ),
    ctx.db
      .select({
        id: purchaseReturns.id,
        number: purchaseReturns.number,
        date: purchaseReturns.date,
        createdAt: purchaseReturns.createdAt,
        total: purchaseReturns.total,
      })
      .from(purchaseReturns)
      .where(
        and(
          eq(purchaseReturns.businessId, ctx.businessId),
          eq(purchaseReturns.supplierId, supplier.id),
          lte(purchaseReturns.date, to),
        ),
      ),
    ctx.db
      .select({ p: payments, methodName: paymentMethods.name })
      .from(payments)
      .leftJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
      .where(
        and(
          eq(payments.businessId, ctx.businessId),
          eq(payments.partyType, "supplier"),
          eq(payments.partyId, supplier.id),
          eq(payments.status, "completed"),
          notInArray(payments.tender, ["credit_note", "supplier_credit"]),
          lte(payments.date, to),
        ),
      ),
  ]);

  const raw: RawEntry[] = [
    ...bills
      .map((b) => ({ ...b, date: b.date ?? b.orderDate }))
      .filter((b) => b.date <= to)
      .map((b) => ({
        date: b.date,
        createdAt: b.createdAt,
        type: b.kind === "opening_balance" ? "opening_balance" : "bill",
        number: b.number,
        description:
          b.kind === "opening_balance"
            ? "Opening balance"
            : `Purchase ${b.number}${b.supplierRef ? ` (ref ${b.supplierRef})` : ""}`,
        debit: b.total,
        credit: 0,
        refType: "purchase",
        refId: b.id,
      })),
    ...rets.map((r) => ({
      date: r.date,
      createdAt: r.createdAt,
      type: "return",
      number: r.number,
      description: `Purchase return / debit note ${r.number}`,
      debit: 0,
      credit: r.total,
      refType: "purchase_return",
      refId: r.id,
    })),
    ...pays.map(({ p, methodName }) => {
      const via = viaLabel(p.tender, methodName ?? null);
      const outgoing = p.direction === "out";
      const verb = outgoing ? "Payment made" : "Refund received";
      return {
        date: p.date,
        createdAt: p.createdAt,
        type: outgoing ? "payment" : "refund",
        number: p.number,
        description: via ? `${verb} — ${via}` : verb,
        debit: outgoing ? 0 : p.amount,
        credit: outgoing ? p.amount : 0,
        refType: "payment",
        refId: p.id,
      };
    }),
  ];
  return buildStatement("supplier", supplier, from, to, raw);
}
