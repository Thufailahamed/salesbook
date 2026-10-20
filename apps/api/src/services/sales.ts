import { and, eq, inArray, sql } from "drizzle-orm";
import {
  addDays,
  calculateDocument,
  daysBetween,
  paymentStatusOf,
  proportionalLine,
  roundHalfAway,
  roundQty,
  type CheckoutInput,
  type CheckoutResponse,
  type InvoicePaymentInput,
  type PriceTier,
} from "@shopbooks/shared";
import {
  heldSales,
  invoiceLines,
  invoices,
  journalEntries,
  locations,
  paymentAllocations,
  payments,
  quotations,
  saleReturnLines,
  saleReturns,
  taxRates,
} from "../db/schema";
import { insertMany, type Stmt } from "../lib/batch";
import { docDate, type Ctx } from "../lib/context";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import {
  allocationInserts,
  customerDelta,
  getCustomer,
  getOpenShift,
  giftCardDelta,
  invoicePaidDelta,
  paymentInsert,
  requireMethod,
  resolveCustomerTenders,
  tenderTotals,
  type CustomerRow,
  type MethodRow,
  type ResolvedTender,
} from "./payments";
import { getInvoiceDto, getReturnDto } from "./sales-read";
import { reserveNumbers } from "./sequences";
import { assertStockAvailable, loadVariants, queueStockChanges, type StockChange } from "./stock";
import { Tx, queueReversals } from "./tx";

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceLineRow = typeof invoiceLines.$inferSelect;

export async function getLocation(ctx: Ctx, id: string) {
  const [loc] = await ctx.db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.businessId, ctx.businessId)));
  if (!loc) throw badRequest("Unknown location");
  if (!loc.isActive) throw badRequest(`${loc.name} is inactive`);
  return loc;
}

export async function getInvoiceRow(ctx: Ctx, id: string) {
  const [inv] = await ctx.db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.businessId, ctx.businessId)));
  if (!inv) throw notFound("Invoice");
  return inv;
}

export async function taxRateMap(ctx: Ctx) {
  const rows = await ctx.db.select().from(taxRates).where(eq(taxRates.businessId, ctx.businessId));
  return new Map(rows.map((r) => [r.id, r.rate]));
}

/** Quantity of a line still returnable. */
export function returnableQty(l: Pick<InvoiceLineRow, "quantity" | "quantityReturned">) {
  return roundQty(l.quantity - l.quantityReturned);
}

interface ResolvedSaleLine {
  variantId: string | null;
  productId: string | null;
  categoryId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  discountType: "amount" | "percent" | null;
  discountValue: number | null;
  taxRate: number;
  unitCost: number;
  track: boolean;
  note: string | null;
}

/**
 * The single entry point for POS transactions:
 * sale, credit sale, split tenders, return-only, and exchange (return + new sale) — all atomic.
 */
export async function checkout(ctx: Ctx, input: CheckoutInput): Promise<CheckoutResponse> {
  const hasSale = input.lines.length > 0;
  if (hasSale) ctx.require("pos.sell");
  if (input.returnFrom) ctx.require("sales.return");
  const date = docDate(ctx, input.date);
  const location = await getLocation(ctx, input.locationId);
  const biz = ctx.business;

  // ---------------------------------------------------------------- original invoice (returns / exchanges)
  let orig: InvoiceRow | null = null;
  let origLines: InvoiceLineRow[] = [];
  if (input.returnFrom) {
    orig = await getInvoiceRow(ctx, input.returnFrom.invoiceId);
    if (orig.status !== "completed" || orig.kind !== "sale") throw badRequest("Only completed sales can be returned");
    if (
      biz.returnWindowDays > 0 &&
      daysBetween(orig.date, date) > biz.returnWindowDays &&
      !ctx.can("sales.void")
    ) {
      throw badRequest(`The ${biz.returnWindowDays}-day return window has passed. Ask a manager.`);
    }
    origLines = await ctx.db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, orig.id));
    if (orig.customerId && input.customerId && input.customerId !== orig.customerId) {
      throw badRequest("An exchange must be for the same customer as the original invoice");
    }
  }

  const customerId = orig?.customerId ?? input.customerId ?? null;
  const customer: CustomerRow | null = customerId ? await getCustomer(ctx, customerId) : null;
  if (customer && !customer.isActive && hasSale) throw badRequest("This customer is archived");
  const priceTier: PriceTier = input.priceTier ?? (customer?.priceTier as PriceTier) ?? "retail";

  // ---------------------------------------------------------------- resolve sale lines
  const variantIds = [
    ...input.lines.map((l) => l.variantId).filter((v): v is string => !!v),
    ...origLines.map((l) => l.variantId).filter((v): v is string => !!v),
  ];
  const info = await loadVariants(ctx, variantIds);
  const rates = await taxRateMap(ctx);

  const saleLines: ResolvedSaleLine[] = input.lines.map((l) => {
    if (l.variantId) {
      const v = info.get(l.variantId)!;
      if (!v.isActive || !v.productActive) throw badRequest(`${v.displayName} is archived and can't be sold`);
      if (!v.allowDecimal && !Number.isInteger(l.quantity)) {
        throw badRequest(`${v.displayName} can only be sold in whole units`);
      }
      const expected = priceTier === "wholesale" && v.wholesalePrice != null ? v.wholesalePrice : v.price;
      if (l.unitPrice !== expected && !ctx.can("pos.priceOverride")) {
        throw badRequest(`You don't have permission to change the price of ${v.displayName}`);
      }
      return {
        variantId: v.id,
        productId: v.productId,
        categoryId: v.categoryId,
        name: l.name?.trim() || v.displayName,
        sku: v.sku,
        quantity: roundQty(l.quantity),
        unitPrice: l.unitPrice,
        discountType: l.discountType ?? null,
        discountValue: l.discountValue ?? null,
        taxRate: v.taxRateId ? (rates.get(v.taxRateId) ?? 0) : 0,
        unitCost: v.trackInventory ? v.costPrice : 0,
        track: v.trackInventory,
        note: l.note ?? null,
      };
    }
    if (!l.name?.trim()) throw badRequest("Custom items need a name");
    return {
      variantId: null,
      productId: null,
      categoryId: null,
      name: l.name.trim(),
      sku: null,
      quantity: roundQty(l.quantity),
      unitPrice: l.unitPrice,
      discountType: l.discountType ?? null,
      discountValue: l.discountValue ?? null,
      taxRate: l.taxRate ?? 0,
      unitCost: 0,
      track: false,
      note: l.note ?? null,
    };
  });

  const calc = calculateDocument(saleLines, {
    taxInclusive: biz.taxInclusive,
    docDiscountType: input.docDiscountType ?? null,
    docDiscountValue: input.docDiscountValue ?? null,
    shipping: input.shipping ?? 0,
    roundingIncrement: biz.roundingIncrement,
  });
  const saleTotal = hasSale ? calc.total : 0;

  // ---------------------------------------------------------------- resolve return lines
  interface ResolvedReturnLine {
    line: InvoiceLineRow;
    quantity: number;
    net: number;
    tax: number;
    total: number;
    restock: boolean;
    track: boolean;
  }
  const returnLines: ResolvedReturnLine[] = [];
  if (orig && input.returnFrom) {
    const merged = new Map<string, { quantity: number; restock: boolean }>();
    for (const r of input.returnFrom.lines) {
      const cur = merged.get(r.invoiceLineId);
      merged.set(r.invoiceLineId, { quantity: roundQty((cur?.quantity ?? 0) + r.quantity), restock: r.restock });
    }
    for (const [lineId, r] of merged) {
      const ol = origLines.find((l) => l.id === lineId);
      if (!ol) throw badRequest("A returned item is not on the original invoice");
      const left = returnableQty(ol);
      if (r.quantity > left + 1e-9) throw badRequest(`Only ${left} × ${ol.name} can be returned`);
      let amounts = proportionalLine(ol, r.quantity);
      if (Math.abs(r.quantity - left) < 1e-9) {
        // Returning everything left: take the exact remainder to avoid rounding drift.
        const already = proportionalLine(ol, ol.quantityReturned);
        const net = ol.net - already.net;
        const tax = ol.tax - already.tax;
        amounts = { net, tax, total: net + tax };
      }
      const track = !!ol.variantId && !!info.get(ol.variantId)?.trackInventory;
      returnLines.push({ line: ol, quantity: r.quantity, ...amounts, restock: r.restock, track });
    }
  }
  const retNet = returnLines.reduce((s, r) => s + r.net, 0);
  const retTax = returnLines.reduce((s, r) => s + r.tax, 0);
  const retTotal = retNet + retTax;
  const restockCost = returnLines
    .filter((r) => r.track && r.restock)
    .reduce((s, r) => s + roundHalfAway(r.quantity * r.line.unitCost), 0);
  const damagedCost = returnLines
    .filter((r) => r.track && !r.restock)
    .reduce((s, r) => s + roundHalfAway(r.quantity * r.line.unitCost), 0);

  // ---------------------------------------------------------------- settlement
  const appliedToOriginal = orig ? Math.min(retTotal, orig.amountDue) : 0;
  const creditAvail = retTotal - appliedToOriginal;
  const appliedToExchange = hasSale ? Math.min(creditAvail, saleTotal) : 0;
  const remainingSale = saleTotal - appliedToExchange;
  const refundDue = creditAvail - appliedToExchange;

  const tenders = await resolveCustomerTenders(ctx, input.payments, customer);
  const tt = tenderTotals(tenders);
  if (!hasSale && tenders.length > 0) throw badRequest("No payment is needed for a return");
  if (tt.total > remainingSale) throw badRequest("Payments exceed the amount due");
  const due = remainingSale - tt.total;

  if (due > 0) {
    if (!customer) throw badRequest("Select a customer to sell on credit, or take full payment");
    if (!input.allowCredit) throw badRequest("Payment doesn't cover the total. Take full payment or mark the balance as credit.");
    if (!customer.allowCredit) throw badRequest(`Credit sales are not allowed for ${customer.name}`);
    const projected = customer.dueBalance - appliedToOriginal + due;
    if (customer.creditLimit > 0 && projected > customer.creditLimit) {
      throw badRequest(`This sale would exceed ${customer.name}'s credit limit`);
    }
  }

  let refundMethod: MethodRow | null = null;
  const refundMode = refundDue > 0 ? (input.refund?.mode ?? null) : null;
  if (refundDue > 0) {
    if (!refundMode) throw badRequest("Choose how to refund the balance (money or store credit)");
    if (refundMode === "store_credit" && !customer) throw badRequest("Select a customer to issue store credit");
    if (refundMode === "method") refundMethod = await requireMethod(ctx, input.refund?.methodId);
  }

  // ---------------------------------------------------------------- stock & shift checks
  const needs = new Map<string, number>();
  for (const l of saleLines) if (l.track && l.variantId) needs.set(l.variantId, roundQty((needs.get(l.variantId) ?? 0) + l.quantity));
  const credits = new Map<string, number>();
  for (const r of returnLines) {
    if (r.track && r.restock && r.line.variantId) {
      credits.set(r.line.variantId, roundQty((credits.get(r.line.variantId) ?? 0) + r.quantity));
    }
  }
  await assertStockAvailable(ctx, location.id, needs, info, credits);

  const shift = await getOpenShift(ctx, location.id);
  const movesMoney = tenders.some((t) => t.tender === "method") || refundMode === "method";
  if (biz.requireShift && movesMoney && !shift) throw badRequest("Open a register shift before taking payments");

  // ---------------------------------------------------------------- loyalty
  const loyaltyOn = biz.loyaltyEnabled && !!customer && biz.loyaltyEarnPer > 0;
  const pointsEarned = loyaltyOn && hasSale ? Math.floor(Math.max(0, saleTotal - tt.loyaltyAmount) / biz.loyaltyEarnPer) : 0;
  let pointsReversed = 0;
  if (loyaltyOn && orig && orig.pointsEarned > 0 && retTotal > 0) {
    pointsReversed = Math.min(Math.floor(retTotal / biz.loyaltyEarnPer), orig.pointsEarned);
    pointsReversed = Math.min(pointsReversed, Math.max(0, customer!.loyaltyPoints + pointsEarned - tt.loyaltyPoints));
  }

  // ---------------------------------------------------------------- numbers
  const receiptCount = tenders.length + (appliedToExchange > 0 ? 1 : 0) + (appliedToOriginal > 0 ? 1 : 0);
  const nums = await reserveNumbers(ctx, {
    invoice: hasSale ? 1 : 0,
    sale_return: orig ? 1 : 0,
    receipt: receiptCount,
    payment: refundDue > 0 ? 1 : 0,
  });
  const receiptNumbers = [...nums.receipt];

  const sys = await ctx.accounts();
  const tx = new Tx(ctx);
  const party = customer ? { partyType: "customer" as const, partyId: customer.id } : { partyType: null, partyId: null };
  const invoiceId = hasSale ? newId() : null;
  const invoiceNumber = hasSale ? nums.invoice[0]! : null;
  const returnId = orig ? newId() : null;
  const returnNumber = orig ? nums.sale_return[0]! : null;
  const stockChanges: StockChange[] = [];

  // ---------------------------------------------------------------- invoice
  if (invoiceId && invoiceNumber) {
    const amountPaid = appliedToExchange + tt.total;
    const costTotal = saleLines.reduce((s, l) => s + (l.track ? roundHalfAway(l.quantity * l.unitCost) : 0), 0);
    tx.add(
      ctx.db.insert(invoices).values({
        id: invoiceId,
        businessId: ctx.businessId,
        number: invoiceNumber,
        kind: "sale",
        date,
        dueDate: due > 0 ? (input.dueDate ?? addDays(date, biz.creditDueDays)) : null,
        status: "completed",
        paymentStatus: paymentStatusOf(saleTotal, amountPaid),
        locationId: location.id,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        salespersonId: input.salespersonId ?? ctx.userId,
        shiftId: shift?.id ?? null,
        priceTier,
        taxInclusive: biz.taxInclusive,
        subtotal: calc.subtotal,
        itemDiscount: calc.itemDiscount,
        docDiscountType: input.docDiscountType ?? null,
        docDiscountValue: input.docDiscountValue ?? null,
        docDiscount: calc.docDiscount,
        discountTotal: calc.discountTotal,
        netTotal: calc.netTotal,
        taxTotal: calc.taxTotal,
        shipping: calc.shipping,
        roundOff: calc.roundOff,
        total: saleTotal,
        amountPaid,
        amountDue: due,
        costTotal,
        pointsEarned,
        pointsRedeemed: tt.loyaltyPoints,
        itemCount: roundQty(saleLines.reduce((s, l) => s + l.quantity, 0)),
        note: input.note ?? null,
        quotationId: input.quotationId ?? null,
        exchangeReturnId: appliedToExchange > 0 ? returnId : null,
        createdBy: ctx.userId,
        createdAt: ctx.now,
      }) as unknown as Stmt,
    );
    tx.add(
      insertMany(
        ctx.db,
        invoiceLines,
        saleLines.map((l, i) => ({
          id: newId(),
          invoiceId,
          businessId: ctx.businessId,
          variantId: l.variantId,
          productId: l.productId,
          categoryId: l.categoryId,
          name: l.name,
          sku: l.sku,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountType: l.discountType,
          discountValue: l.discountValue,
          lineDiscount: calc.lines[i]!.lineDiscount,
          docDiscount: calc.lines[i]!.docDiscount,
          taxRate: l.taxRate,
          net: calc.lines[i]!.net,
          tax: calc.lines[i]!.tax,
          total: calc.lines[i]!.total,
          unitCost: l.unitCost,
          note: l.note,
          sortOrder: i,
          date,
        })),
      ),
    );
    for (const l of saleLines) {
      if (!l.track || !l.variantId) continue;
      stockChanges.push({
        variantId: l.variantId,
        productId: l.productId!,
        locationId: location.id,
        quantity: -l.quantity,
        unitCost: l.unitCost,
        type: "sale",
        referenceType: "invoice",
        referenceId: invoiceId,
        referenceNumber: invoiceNumber,
        date,
      });
    }
    tx.journal({
      date,
      memo: `Sale ${invoiceNumber}${customer ? ` — ${customer.name}` : ""}`,
      sourceType: "invoice",
      sourceId: invoiceId,
      sourceNumber: invoiceNumber,
      locationId: location.id,
      lines: [
        { accountId: sys.receivable, debit: saleTotal, ...party },
        { accountId: sys.sales, credit: calc.netTotal },
        { accountId: sys.output_tax, credit: calc.taxTotal },
        { accountId: sys.other_income, credit: calc.shipping, memo: "Delivery / other charges" },
        { accountId: sys.rounding, credit: calc.roundOff, memo: "Cash rounding" },
        { accountId: sys.cogs, debit: costTotal },
        { accountId: sys.inventory, credit: costTotal },
      ],
    });

    // Exchange credit applied to the new invoice (AR to AR — no journal).
    if (appliedToExchange > 0) {
      const { id, stmt } = paymentInsert(ctx, {
        number: receiptNumbers.shift()!,
        date,
        direction: "in",
        source: "sale",
        ...partyFields(customer),
        tender: internalTender("credit_note", appliedToExchange, sys.receivable, returnNumber),
        locationId: location.id,
        note: `Exchange credit from ${returnNumber}`,
      });
      tx.add(stmt, allocationInserts(ctx, id, [{ docType: "invoice", docId: invoiceId, amount: appliedToExchange }]));
    }

    // Tenders
    for (const t of tenders) {
      const { id, stmt } = paymentInsert(ctx, {
        number: receiptNumbers.shift()!,
        date,
        direction: "in",
        source: "sale",
        ...partyFields(customer),
        tender: t,
        shiftId: shift?.id,
        locationId: location.id,
      });
      tx.add(stmt, allocationInserts(ctx, id, [{ docType: "invoice", docId: invoiceId, amount: t.amount }]));
      if (t.tender === "gift_card" && t.giftCard) tx.add(giftCardDelta(ctx, t.giftCard.id, -t.amount));
    }
    if (tenders.length > 0) {
      tx.journal({
        date,
        memo: `Payment for ${invoiceNumber}`,
        sourceType: "invoice",
        sourceId: invoiceId,
        sourceNumber: invoiceNumber,
        locationId: location.id,
        lines: [
          ...tenders.map((t) => ({
            accountId: t.accountId,
            debit: t.amount,
            memo: tenderMemo(t),
            ...(t.tender === "store_credit" ? party : {}),
          })),
          { accountId: sys.receivable, credit: tt.total, ...party },
        ],
      });
    }
  }

  // ---------------------------------------------------------------- return / credit note
  if (orig && returnId && returnNumber) {
    const refunded = refundMode === "method" ? refundDue : 0;
    const toStoreCredit = refundMode === "store_credit" ? refundDue : 0;
    tx.add(
      ctx.db.insert(saleReturns).values({
        id: returnId,
        businessId: ctx.businessId,
        number: returnNumber,
        date,
        invoiceId: orig.id,
        customerId: customer?.id ?? null,
        locationId: location.id,
        shiftId: shift?.id ?? null,
        reason: input.returnFrom?.reason ?? null,
        netTotal: retNet,
        taxTotal: retTax,
        total: retTotal,
        costTotal: restockCost + damagedCost,
        appliedToInvoice: appliedToOriginal,
        refunded,
        toStoreCredit,
        appliedToExchange,
        exchangeInvoiceId: appliedToExchange > 0 ? invoiceId : null,
        pointsReversed,
        createdBy: ctx.userId,
        createdAt: ctx.now,
      }) as unknown as Stmt,
    );
    tx.add(
      insertMany(
        ctx.db,
        saleReturnLines,
        returnLines.map((r) => ({
          id: newId(),
          returnId,
          businessId: ctx.businessId,
          invoiceLineId: r.line.id,
          variantId: r.line.variantId,
          productId: r.line.productId,
          categoryId: r.line.categoryId,
          name: r.line.name,
          sku: r.line.sku,
          quantity: r.quantity,
          unitPrice: r.line.unitPrice,
          net: r.net,
          tax: r.tax,
          total: r.total,
          unitCost: r.line.unitCost,
          restock: r.restock,
          date,
        })),
      ),
    );
    for (const r of returnLines) {
      tx.add(
        ctx.db
          .update(invoiceLines)
          .set({ quantityReturned: sql`round(${invoiceLines.quantityReturned} + ${r.quantity}, 3)` })
          .where(eq(invoiceLines.id, r.line.id)) as unknown as Stmt,
      );
      if (r.track && r.restock && r.line.variantId) {
        stockChanges.push({
          variantId: r.line.variantId,
          productId: r.line.productId!,
          locationId: location.id,
          quantity: r.quantity,
          unitCost: r.line.unitCost,
          type: "sale_return",
          referenceType: "sale_return",
          referenceId: returnId,
          referenceNumber: returnNumber,
          date,
        });
      }
    }
    tx.add(
      ctx.db
        .update(invoices)
        .set({ amountReturned: sql`${invoices.amountReturned} + ${retTotal}` })
        .where(eq(invoices.id, orig.id)) as unknown as Stmt,
    );
    if (appliedToOriginal > 0) {
      const { id, stmt } = paymentInsert(ctx, {
        number: receiptNumbers.shift()!,
        date,
        direction: "in",
        source: "sale",
        ...partyFields(customer),
        tender: internalTender("credit_note", appliedToOriginal, sys.receivable, returnNumber),
        locationId: location.id,
        note: `Credit note ${returnNumber} applied`,
      });
      tx.add(stmt, allocationInserts(ctx, id, [{ docType: "invoice", docId: orig.id, amount: appliedToOriginal }]));
      tx.add(invoicePaidDelta(ctx, orig.id, appliedToOriginal));
    }
    tx.journal({
      date,
      memo: `Return ${returnNumber} against ${orig.number}`,
      sourceType: "sale_return",
      sourceId: returnId,
      sourceNumber: returnNumber,
      locationId: location.id,
      lines: [
        { accountId: sys.sales_returns, debit: retNet },
        { accountId: sys.output_tax, debit: retTax },
        { accountId: sys.receivable, credit: retTotal, ...party },
        { accountId: sys.inventory, debit: restockCost, memo: "Returned to stock" },
        { accountId: sys.inventory_adjustments, debit: damagedCost, memo: "Damaged returns written off" },
        { accountId: sys.cogs, credit: restockCost + damagedCost },
      ],
    });

    if (refundDue > 0) {
      const tender =
        refundMode === "method" && refundMethod
          ? {
              ...internalTender("method", refundDue, refundMethod.accountId, input.refund?.reference ?? null),
              methodId: refundMethod.id,
              methodType: refundMethod.type as never,
              methodName: refundMethod.name,
            }
          : internalTender("store_credit", refundDue, sys.store_credit, null);
      const { id, stmt } = paymentInsert(ctx, {
        number: nums.payment[0]!,
        date,
        direction: "out",
        source: "sale_refund",
        ...partyFields(customer),
        tender,
        shiftId: shift?.id,
        locationId: location.id,
        note: `Refund for ${returnNumber}`,
      });
      tx.add(stmt, allocationInserts(ctx, id, [{ docType: "sale_return", docId: returnId, amount: refundDue }]));
      tx.journal({
        date,
        memo: refundMode === "method" ? `Refund paid for ${returnNumber}` : `Store credit issued for ${returnNumber}`,
        sourceType: "sale_return",
        sourceId: returnId,
        sourceNumber: returnNumber,
        locationId: location.id,
        lines: [
          { accountId: sys.receivable, debit: refundDue, ...party },
          { accountId: tender.accountId, credit: refundDue, ...(refundMode === "store_credit" ? party : {}) },
        ],
      });
    }
  }

  queueStockChanges(ctx, tx, stockChanges);

  // ---------------------------------------------------------------- customer, held sale, quotation
  if (customer) {
    tx.add(
      customerDelta(ctx, customer.id, {
        due: due - appliedToOriginal,
        credit: (refundMode === "store_credit" ? refundDue : 0) - tt.storeCredit,
        points: pointsEarned - tt.loyaltyPoints - pointsReversed,
        spent: saleTotal - retTotal,
        invoices: hasSale ? 1 : 0,
        purchasedAt: hasSale ? ctx.now : null,
      }),
    );
  }
  if (input.heldSaleId) {
    tx.add(
      ctx.db
        .delete(heldSales)
        .where(and(eq(heldSales.id, input.heldSaleId), eq(heldSales.businessId, ctx.businessId))) as unknown as Stmt,
    );
  }
  if (input.quotationId && invoiceId) {
    tx.add(
      ctx.db
        .update(quotations)
        .set({ status: "converted", convertedInvoiceId: invoiceId })
        .where(and(eq(quotations.id, input.quotationId), eq(quotations.businessId, ctx.businessId))) as unknown as Stmt,
    );
  }

  const summary = [
    invoiceNumber ? `Sale ${invoiceNumber}` : null,
    returnNumber ? `return ${returnNumber}` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  tx.audit(invoiceNumber ? "invoice.create" : "return.create", summary, invoiceId ? "invoice" : "sale_return", invoiceId ?? returnId, {
    total: saleTotal,
    returned: retTotal,
  });

  await tx.commit();

  return {
    invoice: invoiceId ? await getInvoiceDto(ctx, invoiceId) : null,
    saleReturn: returnId ? await getReturnDto(ctx, returnId) : null,
    change: tt.change,
    refunded: refundMode === "method" ? refundDue : 0,
  };
}

function partyFields(customer: CustomerRow | null) {
  return customer
    ? { partyType: "customer" as const, partyId: customer.id }
    : { partyType: "none" as const, partyId: null };
}

function internalTender(
  tender: ResolvedTender["tender"],
  amount: number,
  accountId: string,
  reference: string | null,
): ResolvedTender {
  return {
    tender,
    amount,
    accountId,
    methodId: null,
    methodType: null,
    methodName: null,
    tendered: null,
    change: null,
    reference,
    giftCard: null,
    points: null,
  };
}

function tenderMemo(t: ResolvedTender) {
  switch (t.tender) {
    case "method":
      return t.methodName;
    case "gift_card":
      return `Gift card ${t.giftCard?.code ?? ""}`.trim();
    case "loyalty":
      return `${t.points} loyalty points`;
    case "store_credit":
      return "Store credit";
    default:
      return null;
  }
}

// ---------------------------------------------------------------- payments against an existing invoice

export async function addInvoicePayment(ctx: Ctx, invoiceId: string, input: InvoicePaymentInput) {
  ctx.require("customers.payments");
  const inv = await getInvoiceRow(ctx, invoiceId);
  if (inv.status !== "completed") throw badRequest("This invoice is void");
  if (inv.amountDue <= 0) throw badRequest("This invoice is already fully paid");
  const customer = inv.customerId ? await getCustomer(ctx, inv.customerId) : null;
  const tenders = await resolveCustomerTenders(ctx, input.payments, customer);
  const tt = tenderTotals(tenders);
  if (tt.total <= 0) throw badRequest("Enter a payment amount");
  if (tt.total > inv.amountDue) throw badRequest("Payment exceeds the balance due");
  const date = docDate(ctx, input.date);
  const shift = await getOpenShift(ctx);
  const sys = await ctx.accounts();
  const { receipt } = await reserveNumbers(ctx, { receipt: tenders.length });
  const party = customer ? { partyType: "customer" as const, partyId: customer.id } : {};

  const tx = new Tx(ctx);
  tenders.forEach((t, i) => {
    const number = receipt[i]!;
    const { id, stmt } = paymentInsert(ctx, {
      number,
      date,
      direction: "in",
      source: "invoice_payment",
      ...partyFields(customer),
      tender: t,
      shiftId: shift?.id,
      locationId: shift?.locationId ?? inv.locationId,
    });
    tx.add(stmt, allocationInserts(ctx, id, [{ docType: "invoice", docId: inv.id, amount: t.amount }]));
    if (t.tender === "gift_card" && t.giftCard) tx.add(giftCardDelta(ctx, t.giftCard.id, -t.amount));
    tx.journal({
      date,
      memo: `Payment ${number} for ${inv.number}`,
      sourceType: "payment",
      sourceId: id,
      sourceNumber: number,
      locationId: inv.locationId,
      lines: [
        { accountId: t.accountId, debit: t.amount, memo: tenderMemo(t), ...(t.tender === "store_credit" ? party : {}) },
        { accountId: sys.receivable, credit: t.amount, ...party },
      ],
    });
  });
  tx.add(invoicePaidDelta(ctx, inv.id, tt.total));
  if (customer) {
    tx.add(customerDelta(ctx, customer.id, { due: -tt.total, credit: -tt.storeCredit, points: -tt.loyaltyPoints }));
  }
  tx.audit("invoice.payment", `Payment of ${tt.total} on ${inv.number}`, "invoice", inv.id);
  await tx.commit();
  return getInvoiceDto(ctx, inv.id);
}

// ---------------------------------------------------------------- void

export async function voidInvoice(ctx: Ctx, invoiceId: string, reason: string) {
  ctx.require("sales.void");
  const inv = await getInvoiceRow(ctx, invoiceId);
  if (inv.status === "void") throw badRequest("This invoice is already void");
  if (inv.amountReturned > 0) throw badRequest("Invoices with returns can't be voided. Return the remaining items instead.");
  if (inv.exchangeReturnId) throw badRequest("This invoice is part of an exchange. Process a return instead.");

  const lines = await ctx.db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));
  const allocRows = await ctx.db
    .select({ a: paymentAllocations, p: payments })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(and(eq(paymentAllocations.docType, "invoice"), eq(paymentAllocations.docId, inv.id)));

  const sys = await ctx.accounts();
  const tx = new Tx(ctx);
  const party = inv.customerId ? { partyType: "customer" as const, partyId: inv.customerId } : {};
  let creditBack = 0;
  let pointsBack = 0;
  const paymentJournalSources: string[] = [];

  for (const { a, p } of allocRows) {
    if (p.status !== "completed") continue;
    if (p.source === "sale" || p.source === "invoice_payment") {
      tx.add(ctx.db.update(payments).set({ status: "void" }).where(eq(payments.id, p.id)) as unknown as Stmt);
      if (p.tender === "gift_card" && p.giftCardId) tx.add(giftCardDelta(ctx, p.giftCardId, p.amount));
      if (p.tender === "store_credit") creditBack += p.amount;
      if (p.tender === "loyalty") pointsBack += p.points ?? 0;
      if (p.source === "invoice_payment") paymentJournalSources.push(p.id);
    } else if (p.source === "customer_payment") {
      // Money received on account stays with the customer as store credit.
      tx.add(ctx.db.delete(paymentAllocations).where(eq(paymentAllocations.id, a.id)) as unknown as Stmt);
      creditBack += a.amount;
      tx.journal({
        date: ctx.today,
        memo: `${p.number} unallocated from voided ${inv.number}`,
        sourceType: "invoice_void",
        sourceId: inv.id,
        sourceNumber: inv.number,
        locationId: inv.locationId,
        lines: [
          { accountId: sys.receivable, debit: a.amount, ...party },
          { accountId: sys.store_credit, credit: a.amount, ...party },
        ],
      });
    }
  }

  const entryRows = await ctx.db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.businessId, ctx.businessId),
        sql`((${journalEntries.sourceType} IN ('invoice','opening_balance') AND ${journalEntries.sourceId} = ${inv.id})${
          paymentJournalSources.length
            ? sql` OR (${journalEntries.sourceType} = 'payment' AND ${inArray(journalEntries.sourceId, paymentJournalSources)})`
            : sql``
        })`,
      ),
    );
  await queueReversals(
    ctx,
    tx,
    entryRows.map((e) => e.id),
    { date: ctx.today, memo: `Void ${inv.number}`, sourceType: "invoice_void", sourceId: inv.id, sourceNumber: inv.number },
  );

  const info = await loadVariants(
    ctx,
    lines.map((l) => l.variantId).filter((v): v is string => !!v),
  );
  queueStockChanges(
    ctx,
    tx,
    lines
      .filter((l) => l.variantId && info.get(l.variantId)?.trackInventory)
      .map((l) => ({
        variantId: l.variantId!,
        productId: l.productId!,
        locationId: inv.locationId,
        quantity: l.quantity,
        unitCost: l.unitCost,
        type: "void" as const,
        referenceType: "invoice",
        referenceId: inv.id,
        referenceNumber: inv.number,
        note: `Void: ${reason}`,
        date: ctx.today,
      })),
  );

  if (inv.customerId) {
    tx.add(
      customerDelta(ctx, inv.customerId, {
        due: -inv.amountDue,
        credit: creditBack,
        points: pointsBack - inv.pointsEarned,
        spent: inv.kind === "sale" ? -inv.total : 0,
        invoices: inv.kind === "sale" ? -1 : 0,
      }),
    );
  }
  tx.add(
    ctx.db
      .update(invoices)
      .set({ status: "void", amountDue: 0, voidReason: reason, voidedAt: ctx.now, voidedBy: ctx.userId })
      .where(eq(invoices.id, inv.id)) as unknown as Stmt,
  );
  tx.audit("invoice.void", `Voided ${inv.number}: ${reason}`, "invoice", inv.id);
  await tx.commit();
  return getInvoiceDto(ctx, inv.id);
}
