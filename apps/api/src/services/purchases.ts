import { and, eq, sql } from "drizzle-orm";
import {
  addDays,
  allocateProportionally,
  calculateDocument,
  paymentStatusOf,
  proportionalLine,
  roundHalfAway,
  roundQty,
  type PurchaseInput,
  type PurchaseReceiveInput,
  type PurchaseReturnInput,
} from "@shopbooks/shared";
import { purchaseLines, purchaseReturnLines, purchaseReturns, purchases } from "../db/schema";
import { insertMany, type Stmt } from "../lib/batch";
import { docDate, type Ctx } from "../lib/context";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import {
  allocationInserts,
  getOpenShift,
  getSupplier,
  loadMethods,
  methodTender,
  paymentInsert,
  purchasePaidDelta,
  requireMethod,
  supplierDelta,
  type ResolvedTender,
  type SupplierRow,
} from "./payments";
import { getPurchaseDto, getPurchaseReturnDto } from "./purchases-read";
import { getLocation, taxRateMap } from "./sales";
import { reserveNumbers } from "./sequences";
import { loadStockCoster, loadVariants, queueCostUpdate, queueStockChanges, stockAt, type LotQty } from "./stock";
import { Tx } from "./tx";

type PurchaseRow = typeof purchases.$inferSelect;
type PurchaseLineRow = typeof purchaseLines.$inferSelect;

interface BuiltLine {
  variantId: string;
  productId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
  discountType: "amount" | "percent" | null;
  discountValue: number | null;
  lineDiscount: number;
  docDiscount: number;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
  /** net + allocated freight */
  landedValue: number;
  /** Expiry date of the goods on this line, if recorded. */
  expiryDate: string | null;
  landedUnitCost: number;
}

async function getPurchaseRow(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, id), eq(purchases.businessId, ctx.businessId)));
  if (!row) throw notFound("Purchase");
  return row;
}

/** Resolve lines, compute totals and landed costs (freight capitalised by line value). */
async function buildDocument(ctx: Ctx, input: PurchaseInput) {
  const info = await loadVariants(
    ctx,
    input.lines.map((l) => l.variantId),
  );
  const rates = await taxRateMap(ctx);
  const resolved = input.lines.map((l) => {
    const v = info.get(l.variantId)!;
    if (!v.trackInventory) throw badRequest(`${v.displayName} doesn't track inventory and can't be purchased into stock`);
    if (!v.allowDecimal && !Number.isInteger(l.quantity)) throw badRequest(`${v.displayName} only allows whole units`);
    if (l.expiryDate && l.expiryDate < ctx.today) {
      throw badRequest(`${v.displayName} is already past its expiry date (${l.expiryDate}). Don't receive it.`);
    }
    return {
      v,
      expiryDate: l.expiryDate ?? null,
      quantity: roundQty(l.quantity),
      unitCost: l.unitCost,
      discountType: l.discountType ?? null,
      discountValue: l.discountValue ?? null,
      taxRate: l.taxRate ?? (v.taxRateId ? (rates.get(v.taxRateId) ?? 0) : 0),
    };
  });
  const calc = calculateDocument(
    resolved.map((r) => ({
      quantity: r.quantity,
      unitPrice: r.unitCost,
      discountType: r.discountType,
      discountValue: r.discountValue,
      taxRate: r.taxRate,
    })),
    {
      taxInclusive: input.taxInclusive,
      docDiscountType: input.docDiscountType ?? null,
      docDiscountValue: input.docDiscountValue ?? null,
      shipping: input.shipping ?? 0,
      roundingIncrement: 0,
    },
  );
  const freight = allocateProportionally(
    calc.shipping,
    calc.lines.map((l) => l.net),
  );
  const lines: BuiltLine[] = resolved.map((r, i) => {
    const c = calc.lines[i]!;
    const landedValue = c.net + (freight[i] ?? 0);
    return {
      variantId: r.v.id,
      productId: r.v.productId,
      name: r.v.displayName,
      sku: r.v.sku,
      quantity: r.quantity,
      unitCost: r.unitCost,
      discountType: r.discountType,
      discountValue: r.discountValue,
      lineDiscount: c.lineDiscount,
      docDiscount: c.docDiscount,
      taxRate: r.taxRate,
      net: c.net,
      tax: c.tax,
      total: c.total,
      landedValue,
      landedUnitCost: r.quantity > 0 ? roundHalfAway(landedValue / r.quantity) : 0,
      expiryDate: r.expiryDate,
    };
  });
  return { calc, lines, info };
}

function lineRows(ctx: Ctx, purchaseId: string, lines: BuiltLine[]) {
  return insertMany(
    ctx.db,
    purchaseLines,
    lines.map((l, i) => ({
      id: newId(),
      purchaseId,
      businessId: ctx.businessId,
      variantId: l.variantId,
      productId: l.productId,
      name: l.name,
      sku: l.sku,
      quantity: l.quantity,
      unitCost: l.unitCost,
      discountType: l.discountType,
      discountValue: l.discountValue,
      lineDiscount: l.lineDiscount,
      docDiscount: l.docDiscount,
      taxRate: l.taxRate,
      net: l.net,
      tax: l.tax,
      total: l.total,
      landedUnitCost: l.landedUnitCost,
      expiryDate: l.expiryDate,
      sortOrder: i,
    })),
  );
}

function fromStoredLines(rows: PurchaseLineRow[], shipping: number): BuiltLine[] {
  // Same freight split as at creation: shipping is shared out by each line's net amount.
  const freight = allocateProportionally(shipping, rows.map((r) => r.net));
  return rows.map((r, i) => ({
    variantId: r.variantId,
    productId: r.productId,
    name: r.name,
    sku: r.sku,
    quantity: r.quantity,
    unitCost: r.unitCost,
    discountType: (r.discountType as "amount" | "percent" | null) ?? null,
    discountValue: r.discountValue,
    lineDiscount: r.lineDiscount,
    docDiscount: r.docDiscount,
    taxRate: r.taxRate,
    net: r.net,
    tax: r.tax,
    total: r.total,
    landedValue: r.net + (freight[i] ?? 0),
    landedUnitCost: r.landedUnitCost,
    expiryDate: r.expiryDate,
  }));
}

interface ReceiveArgs {
  purchaseId: string;
  number: string;
  supplier: SupplierRow;
  locationId: string;
  date: string;
  lines: BuiltLine[];
  netTotal: number;
  shipping: number;
  taxTotal: number;
  total: number;
  payments: { methodId: string; amount: number; reference?: string | null }[];
  applySupplierCredit: boolean;
  updateCostPrice: boolean;
}

/** The expiry date a received line brings in (none recorded = no expiry). */
function receivedLots(l: { quantity: number; expiryDate: string | null }): LotQty[] {
  return [{ expiry: l.expiryDate ?? "", quantity: l.quantity }];
}

/** Stock in, weighted-average cost, AP journal, immediate payments. Returns the settlement figures. */
async function queueReceive(ctx: Ctx, tx: Tx, a: ReceiveArgs) {
  const sys = await ctx.accounts();
  const methods = a.payments.length > 0 ? await loadMethods(ctx) : null;
  const tenders: ResolvedTender[] = [];
  for (const p of a.payments.filter((p) => p.amount > 0)) {
    const m = await requireMethod(ctx, p.methodId, methods ?? undefined);
    tenders.push(methodTender(m, p.amount, p.reference ?? null));
  }
  const paid = tenders.reduce((s, t) => s + t.amount, 0);
  if (paid > a.total) throw badRequest("Payments exceed the purchase total");
  const creditUsed = a.applySupplierCredit ? Math.min(a.supplier.creditBalance, a.total - paid) : 0;
  const { payment: numbers } = await reserveNumbers(ctx, { payment: tenders.length + (creditUsed > 0 ? 1 : 0) });
  const shift = tenders.some((t) => t.methodType === "cash") ? await getOpenShift(ctx) : null;

  // Stock comes in at the landed value the journal books, so valuation and the Inventory account agree.
  const variantIds = [...new Set(a.lines.map((l) => l.variantId))];
  const info = await loadVariants(ctx, variantIds);
  const coster = await loadStockCoster(ctx, variantIds, new Map([...info].map(([id, v]) => [id, v.costPrice])));
  for (const l of a.lines) coster.in(l.variantId, a.locationId, l.quantity, l.landedValue, receivedLots(l));
  if (a.updateCostPrice) for (const u of coster.costUpdates()) queueCostUpdate(ctx, tx, u.variantId, u.costPrice);

  queueStockChanges(
    ctx,
    tx,
    a.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      locationId: a.locationId,
      quantity: l.quantity,
      value: l.landedValue,
      lots: receivedLots(l),
      type: "purchase" as const,
      referenceType: "purchase",
      referenceId: a.purchaseId,
      referenceNumber: a.number,
      date: a.date,
    })),
  );

  const party = { partyType: "supplier" as const, partyId: a.supplier.id };
  tx.journal({
    date: a.date,
    memo: `Purchase ${a.number} — ${a.supplier.name}`,
    sourceType: "purchase",
    sourceId: a.purchaseId,
    sourceNumber: a.number,
    locationId: a.locationId,
    lines: [
      { accountId: sys.inventory, debit: a.netTotal + a.shipping },
      { accountId: sys.input_tax, debit: a.taxTotal },
      { accountId: sys.payable, credit: a.total, ...party },
    ],
  });

  tenders.forEach((t, i) => {
    const { id, stmt } = paymentInsert(ctx, {
      number: numbers[i]!,
      date: a.date,
      direction: "out",
      source: "purchase",
      ...party,
      tender: t,
      shiftId: shift?.id,
      locationId: a.locationId,
    });
    tx.add(stmt, allocationInserts(ctx, id, [{ docType: "purchase", docId: a.purchaseId, amount: t.amount }]));
  });
  if (paid > 0) {
    tx.journal({
      date: a.date,
      memo: `Payment for ${a.number}`,
      sourceType: "purchase",
      sourceId: a.purchaseId,
      sourceNumber: a.number,
      locationId: a.locationId,
      lines: [
        { accountId: sys.payable, debit: paid, ...party },
        ...tenders.map((t) => ({ accountId: t.accountId, credit: t.amount, memo: t.methodName })),
      ],
    });
  }
  if (creditUsed > 0) {
    const { id, stmt } = paymentInsert(ctx, {
      number: numbers[tenders.length]!,
      date: a.date,
      direction: "out",
      source: "purchase",
      ...party,
      tender: {
        ...methodTender({ id: "", accountId: sys.supplier_advances, name: "", type: "other" } as never, creditUsed),
        tender: "supplier_credit",
        methodId: null,
        methodType: null,
        methodName: null,
      },
      locationId: a.locationId,
      note: "Supplier credit applied",
    });
    tx.add(stmt, allocationInserts(ctx, id, [{ docType: "purchase", docId: a.purchaseId, amount: creditUsed }]));
    tx.journal({
      date: a.date,
      memo: `Supplier credit applied to ${a.number}`,
      sourceType: "purchase",
      sourceId: a.purchaseId,
      sourceNumber: a.number,
      lines: [
        { accountId: sys.payable, debit: creditUsed, ...party },
        { accountId: sys.supplier_advances, credit: creditUsed, ...party },
      ],
    });
  }

  const amountPaid = paid + creditUsed;
  const amountDue = a.total - amountPaid;
  tx.add(
    supplierDelta(ctx, a.supplier.id, {
      due: amountDue,
      credit: -creditUsed,
      purchased: a.total,
      purchasedAt: ctx.now,
    }),
  );
  return {
    amountPaid,
    amountDue,
    paymentStatus: paymentStatusOf(a.total, amountPaid),
    dueDate: amountDue > 0 && a.supplier.paymentTermsDays > 0 ? addDays(a.date, a.supplier.paymentTermsDays) : null,
  };
}

export async function createPurchase(ctx: Ctx, input: PurchaseInput) {
  ctx.require("purchases.manage");
  const supplier = await getSupplier(ctx, input.supplierId);
  if (!supplier.isActive) throw badRequest("This supplier is archived");
  const location = await getLocation(ctx, input.locationId);
  const orderDate = docDate(ctx, input.orderDate);
  if (input.status === "ordered" && input.payments.some((p) => p.amount > 0)) {
    throw badRequest("Record payments when the goods are received");
  }
  const { calc, lines } = await buildDocument(ctx, input);
  const { purchase } = await reserveNumbers(ctx, { purchase: 1 });
  const number = purchase[0]!;
  const id = newId();
  const tx = new Tx(ctx);

  let settlement = { amountPaid: 0, amountDue: 0, paymentStatus: "unpaid" as string, dueDate: input.dueDate ?? null };
  let receivedDate: string | null = null;
  if (input.status === "received") {
    receivedDate = docDate(ctx, input.receivedDate ?? orderDate);
    const s = await queueReceive(ctx, tx, {
      purchaseId: id,
      number,
      supplier,
      locationId: location.id,
      date: receivedDate,
      lines,
      netTotal: calc.netTotal,
      shipping: calc.shipping,
      taxTotal: calc.taxTotal,
      total: calc.total,
      payments: input.payments,
      applySupplierCredit: input.applySupplierCredit,
      updateCostPrice: input.updateCostPrice,
    });
    settlement = { ...s, dueDate: input.dueDate ?? s.dueDate };
  }

  tx.add(
    ctx.db.insert(purchases).values({
      id,
      businessId: ctx.businessId,
      number,
      kind: "purchase",
      status: input.status,
      supplierId: supplier.id,
      locationId: location.id,
      orderDate,
      receivedDate,
      dueDate: settlement.dueDate,
      supplierRef: input.supplierRef ?? null,
      taxInclusive: input.taxInclusive,
      subtotal: calc.subtotal,
      itemDiscount: calc.itemDiscount,
      docDiscountType: input.docDiscountType ?? null,
      docDiscountValue: input.docDiscountValue ?? null,
      docDiscount: calc.docDiscount,
      discountTotal: calc.discountTotal,
      netTotal: calc.netTotal,
      taxTotal: calc.taxTotal,
      shipping: calc.shipping,
      total: calc.total,
      amountPaid: settlement.amountPaid,
      amountDue: settlement.amountDue,
      paymentStatus: settlement.paymentStatus,
      itemCount: roundQty(lines.reduce((s, l) => s + l.quantity, 0)),
      note: input.note ?? null,
      createdBy: ctx.userId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }) as unknown as Stmt,
  );
  tx.add(lineRows(ctx, id, lines));
  tx.audit(
    input.status === "received" ? "purchase.receive" : "purchase.order",
    `${input.status === "received" ? "Received" : "Ordered"} ${number} from ${supplier.name}`,
    "purchase",
    id,
    { total: calc.total },
  );
  await tx.commit();
  return getPurchaseDto(ctx, id);
}

export async function updatePurchase(ctx: Ctx, id: string, input: PurchaseInput) {
  ctx.require("purchases.manage");
  const existing = await getPurchaseRow(ctx, id);
  if (existing.status !== "ordered") throw badRequest("Only open purchase orders can be edited");
  if (input.status === "received") {
    // Edit then receive in one go.
    await updatePurchase(ctx, id, { ...input, status: "ordered", payments: [] });
    return receivePurchase(ctx, id, {
      receivedDate: input.receivedDate,
      payments: input.payments,
      applySupplierCredit: input.applySupplierCredit,
    });
  }
  const supplier = await getSupplier(ctx, input.supplierId);
  const location = await getLocation(ctx, input.locationId);
  const orderDate = docDate(ctx, input.orderDate ?? existing.orderDate);
  const { calc, lines } = await buildDocument(ctx, input);
  const tx = new Tx(ctx);
  tx.add(ctx.db.delete(purchaseLines).where(eq(purchaseLines.purchaseId, id)) as unknown as Stmt);
  tx.add(
    ctx.db
      .update(purchases)
      .set({
        supplierId: supplier.id,
        locationId: location.id,
        orderDate,
        dueDate: input.dueDate ?? null,
        supplierRef: input.supplierRef ?? null,
        taxInclusive: input.taxInclusive,
        subtotal: calc.subtotal,
        itemDiscount: calc.itemDiscount,
        docDiscountType: input.docDiscountType ?? null,
        docDiscountValue: input.docDiscountValue ?? null,
        docDiscount: calc.docDiscount,
        discountTotal: calc.discountTotal,
        netTotal: calc.netTotal,
        taxTotal: calc.taxTotal,
        shipping: calc.shipping,
        total: calc.total,
        itemCount: roundQty(lines.reduce((s, l) => s + l.quantity, 0)),
        note: input.note ?? null,
        updatedAt: ctx.now,
      })
      .where(eq(purchases.id, id)) as unknown as Stmt,
  );
  tx.add(lineRows(ctx, id, lines));
  tx.audit("purchase.update", `Updated ${existing.number}`, "purchase", id);
  await tx.commit();
  return getPurchaseDto(ctx, id);
}

export async function receivePurchase(ctx: Ctx, id: string, input: PurchaseReceiveInput) {
  ctx.require("purchases.manage");
  const p = await getPurchaseRow(ctx, id);
  if (p.status !== "ordered") throw badRequest(p.status === "received" ? "Already received" : "This order was cancelled");
  const supplier = await getSupplier(ctx, p.supplierId);
  const stored = await ctx.db.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, id));
  const receivedDate = docDate(ctx, input.receivedDate);
  const tx = new Tx(ctx);
  const s = await queueReceive(ctx, tx, {
    purchaseId: id,
    number: p.number,
    supplier,
    locationId: p.locationId,
    date: receivedDate,
    lines: fromStoredLines(stored, p.shipping),
    netTotal: p.netTotal,
    shipping: p.shipping,
    taxTotal: p.taxTotal,
    total: p.total,
    payments: input.payments,
    applySupplierCredit: input.applySupplierCredit,
    updateCostPrice: true,
  });
  tx.add(
    ctx.db
      .update(purchases)
      .set({
        status: "received",
        receivedDate,
        dueDate: p.dueDate ?? s.dueDate,
        amountPaid: s.amountPaid,
        amountDue: s.amountDue,
        paymentStatus: s.paymentStatus,
        updatedAt: ctx.now,
      })
      .where(eq(purchases.id, id)) as unknown as Stmt,
  );
  tx.audit("purchase.receive", `Received ${p.number} from ${supplier.name}`, "purchase", id);
  await tx.commit();
  return getPurchaseDto(ctx, id);
}

export async function cancelPurchase(ctx: Ctx, id: string) {
  ctx.require("purchases.manage");
  const p = await getPurchaseRow(ctx, id);
  if (p.status !== "ordered") throw badRequest("Only open purchase orders can be cancelled");
  const tx = new Tx(ctx);
  tx.add(ctx.db.update(purchases).set({ status: "cancelled", updatedAt: ctx.now }).where(eq(purchases.id, id)) as unknown as Stmt);
  tx.audit("purchase.cancel", `Cancelled ${p.number}`, "purchase", id);
  await tx.commit();
  return getPurchaseDto(ctx, id);
}

/** Pay an existing bill (each payment is individually voidable from /payments). */
export async function addPurchasePayments(
  ctx: Ctx,
  id: string,
  input: { date?: string; payments: { methodId: string; amount: number; reference?: string | null }[] },
) {
  ctx.require("purchases.manage");
  const p = await getPurchaseRow(ctx, id);
  if (p.status !== "received") throw badRequest("Receive the goods before paying");
  const supplier = await getSupplier(ctx, p.supplierId);
  const methods = await loadMethods(ctx);
  const tenders: ResolvedTender[] = [];
  for (const x of input.payments.filter((x) => x.amount > 0)) {
    tenders.push(methodTender(await requireMethod(ctx, x.methodId, methods), x.amount, x.reference ?? null));
  }
  const total = tenders.reduce((s, t) => s + t.amount, 0);
  if (total <= 0) throw badRequest("Enter a payment amount");
  if (total > p.amountDue) throw badRequest("Payment exceeds the balance due");
  const date = docDate(ctx, input.date);
  const shift = tenders.some((t) => t.methodType === "cash") ? await getOpenShift(ctx) : null;
  const sys = await ctx.accounts();
  const { payment: numbers } = await reserveNumbers(ctx, { payment: tenders.length });
  const party = { partyType: "supplier" as const, partyId: supplier.id };
  const tx = new Tx(ctx);
  tenders.forEach((t, i) => {
    const { id: paymentId, stmt } = paymentInsert(ctx, {
      number: numbers[i]!,
      date,
      direction: "out",
      source: "supplier_payment",
      ...party,
      tender: t,
      shiftId: shift?.id,
      locationId: p.locationId,
    });
    tx.add(stmt, allocationInserts(ctx, paymentId, [{ docType: "purchase", docId: p.id, amount: t.amount }]));
    tx.journal({
      date,
      memo: `Payment ${numbers[i]} for ${p.number}`,
      sourceType: "payment",
      sourceId: paymentId,
      sourceNumber: numbers[i]!,
      lines: [
        { accountId: sys.payable, debit: t.amount, ...party },
        { accountId: t.accountId, credit: t.amount, memo: t.methodName },
      ],
    });
  });
  tx.add(purchasePaidDelta(ctx, p.id, total));
  tx.add(supplierDelta(ctx, supplier.id, { due: -total }));
  tx.audit("purchase.payment", `Paid ${total} on ${p.number}`, "purchase", p.id);
  await tx.commit();
  return getPurchaseDto(ctx, id);
}

export async function createPurchaseReturn(ctx: Ctx, input: PurchaseReturnInput) {
  ctx.require("purchases.manage");
  const p = await getPurchaseRow(ctx, input.purchaseId);
  if (p.status !== "received" || p.kind !== "purchase") throw badRequest("Only received purchases can be returned");
  const supplier = await getSupplier(ctx, p.supplierId);
  const date = docDate(ctx, input.date);
  const stored = await ctx.db.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, p.id));

  const merged = new Map<string, number>();
  for (const l of input.lines) merged.set(l.purchaseLineId, roundQty((merged.get(l.purchaseLineId) ?? 0) + l.quantity));
  const lines = [...merged.entries()].map(([lineId, qty]) => {
    const pl = stored.find((s) => s.id === lineId);
    if (!pl) throw badRequest("A returned item is not on this purchase");
    const left = roundQty(pl.quantity - pl.quantityReturned);
    if (qty > left + 1e-9) throw badRequest(`Only ${left} × ${pl.name} can be returned`);
    let amounts = proportionalLine(pl, qty);
    if (Math.abs(qty - left) < 1e-9) {
      const already = proportionalLine(pl, pl.quantityReturned);
      amounts = { net: pl.net - already.net, tax: pl.tax - already.tax, total: pl.total - already.total };
    }
    return { pl, qty, ...amounts };
  });

  // Stock must be available at the purchase location.
  if (!ctx.business.allowNegativeStock) {
    const have = await stockAt(
      ctx,
      lines.map((l) => l.pl.variantId),
      p.locationId,
    );
    const need = new Map<string, number>();
    for (const l of lines) need.set(l.pl.variantId, (need.get(l.pl.variantId) ?? 0) + l.qty);
    for (const [variantId, q] of need) {
      if (q > (have.get(variantId) ?? 0) + 1e-9) {
        const name = lines.find((l) => l.pl.variantId === variantId)!.pl.name;
        throw badRequest(`Not enough ${name} in stock to return (${have.get(variantId) ?? 0} available)`);
      }
    }
  }

  const net = lines.reduce((s, l) => s + l.net, 0);
  const tax = lines.reduce((s, l) => s + l.tax, 0);
  const total = net + tax;
  const variantIds = [...new Set(lines.map((l) => l.pl.variantId))];
  const info = await loadVariants(ctx, variantIds);
  const coster = await loadStockCoster(ctx, variantIds, new Map([...info].map(([id, v]) => [id, v.costPrice])));
  const outs = lines.map((l) => coster.outLots(l.pl.variantId, p.locationId, l.qty));
  const inventoryOut = outs.reduce((s, c) => s + c.amount, 0);
  const appliedToBill = Math.min(total, p.amountDue);
  const remainder = total - appliedToBill;
  const refundMethod = input.settlement === "refund" && remainder > 0 ? await requireMethod(ctx, input.methodId) : null;

  const nums = await reserveNumbers(ctx, {
    purchase_return: 1,
    payment: appliedToBill > 0 ? 1 : 0,
    receipt: refundMethod ? 1 : 0,
  });
  const number = nums.purchase_return[0]!;
  const id = newId();
  const sys = await ctx.accounts();
  const party = { partyType: "supplier" as const, partyId: supplier.id };
  const tx = new Tx(ctx);

  tx.add(
    ctx.db.insert(purchaseReturns).values({
      id,
      businessId: ctx.businessId,
      number,
      date,
      purchaseId: p.id,
      supplierId: supplier.id,
      locationId: p.locationId,
      settlement: input.settlement,
      netTotal: net,
      taxTotal: tax,
      total,
      appliedToBill,
      refunded: refundMethod ? remainder : 0,
      toCredit: refundMethod ? 0 : remainder,
      note: input.note ?? null,
      createdBy: ctx.userId,
      createdAt: ctx.now,
    }) as unknown as Stmt,
  );
  tx.add(
    insertMany(
      ctx.db,
      purchaseReturnLines,
      lines.map((l) => ({
        id: newId(),
        returnId: id,
        businessId: ctx.businessId,
        purchaseLineId: l.pl.id,
        variantId: l.pl.variantId,
        name: l.pl.name,
        sku: l.pl.sku,
        quantity: l.qty,
        unitCost: l.pl.landedUnitCost,
        net: l.net,
        tax: l.tax,
        total: l.net + l.tax,
      })),
    ),
  );
  for (const l of lines) {
    tx.add(
      ctx.db
        .update(purchaseLines)
        .set({ quantityReturned: sql`round(${purchaseLines.quantityReturned} + ${l.qty}, 3)` })
        .where(eq(purchaseLines.id, l.pl.id)) as unknown as Stmt,
    );
  }
  tx.add(
    ctx.db
      .update(purchases)
      .set({ amountReturned: sql`${purchases.amountReturned} + ${total}`, updatedAt: ctx.now })
      .where(eq(purchases.id, p.id)) as unknown as Stmt,
  );

  for (const u of coster.costUpdates()) queueCostUpdate(ctx, tx, u.variantId, u.costPrice);
  queueStockChanges(
    ctx,
    tx,
    lines.map((l, i) => ({
      variantId: l.pl.variantId,
      productId: l.pl.productId,
      locationId: p.locationId,
      quantity: -l.qty,
      value: -outs[i]!.amount,
      lots: outs[i]!.lots,
      type: "purchase_return" as const,
      referenceType: "purchase_return",
      referenceId: id,
      referenceNumber: number,
      date,
    })),
  );

  tx.journal({
    date,
    memo: `Purchase return ${number} to ${supplier.name}`,
    sourceType: "purchase_return",
    sourceId: id,
    sourceNumber: number,
    locationId: p.locationId,
    lines: [
      { accountId: sys.payable, debit: total, ...party },
      { accountId: sys.inventory_adjustments, debit: inventoryOut - net, memo: "Cost of returned stock above the bill" },
      { accountId: sys.inventory, credit: inventoryOut },
      { accountId: sys.input_tax, credit: tax },
    ],
  });

  if (appliedToBill > 0) {
    const { id: payId, stmt } = paymentInsert(ctx, {
      number: nums.payment[0]!,
      date,
      direction: "out",
      source: "purchase",
      ...party,
      tender: {
        ...methodTender({ id: "", accountId: sys.payable, name: "", type: "other" } as never, appliedToBill, number),
        tender: "credit_note",
        methodId: null,
        methodType: null,
        methodName: null,
      },
      locationId: p.locationId,
      note: `Debit note ${number} applied`,
    });
    tx.add(stmt, allocationInserts(ctx, payId, [{ docType: "purchase", docId: p.id, amount: appliedToBill }]));
    tx.add(purchasePaidDelta(ctx, p.id, appliedToBill));
  }

  if (remainder > 0) {
    if (refundMethod) {
      const tender = methodTender(refundMethod, remainder, input.reference ?? null);
      const { id: payId, stmt } = paymentInsert(ctx, {
        number: nums.receipt[0]!,
        date,
        direction: "in",
        source: "supplier_refund",
        ...party,
        tender,
        locationId: p.locationId,
        note: `Refund for ${number}`,
      });
      tx.add(stmt, allocationInserts(ctx, payId, [{ docType: "purchase_return", docId: id, amount: remainder }]));
      tx.journal({
        date,
        memo: `Refund received for ${number}`,
        sourceType: "purchase_return",
        sourceId: id,
        sourceNumber: number,
        lines: [
          { accountId: refundMethod.accountId, debit: remainder },
          { accountId: sys.payable, credit: remainder, ...party },
        ],
      });
    } else {
      tx.journal({
        date,
        memo: `Supplier credit from ${number}`,
        sourceType: "purchase_return",
        sourceId: id,
        sourceNumber: number,
        lines: [
          { accountId: sys.supplier_advances, debit: remainder, ...party },
          { accountId: sys.payable, credit: remainder, ...party },
        ],
      });
    }
  }
  tx.add(
    supplierDelta(ctx, supplier.id, {
      due: -appliedToBill,
      credit: refundMethod ? 0 : remainder,
      purchased: -total,
    }),
  );
  tx.audit("purchase_return.create", `Purchase return ${number} (${p.number})`, "purchase_return", id, { total });
  await tx.commit();
  return getPurchaseReturnDto(ctx, id);
}

export type { PurchaseRow };
