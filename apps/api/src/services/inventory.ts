import {
  ADJUSTMENT_REASON_LABELS,
  roundHalfAway,
  roundQty,
  type StockAdjustmentInput,
  type StockTransferInput,
} from "@shopbooks/shared";
import { stockAdjustmentLines, stockAdjustments, stockTransferLines, stockTransfers } from "../db/schema";
import { insertMany, type Stmt } from "../lib/batch";
import { docDate, type Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { newId } from "../lib/ids";
import { getLocation } from "./sales";
import { reserveNumbers } from "./sequences";
import {
  loadVariants,
  queueCostUpdate,
  queueStockChanges,
  stockAt,
  stockTotals,
  weightedAverage,
} from "./stock";
import { Tx } from "./tx";

export interface OpeningStockItem {
  variantId: string;
  productId: string;
  quantity: number;
  unitCost: number;
}

/**
 * Queue an "opening stock" adjustment for variants that may not exist in the DB yet
 * (used when creating a product with initial stock). Posts Dr Inventory / Cr Opening Balance Equity.
 */
export async function queueOpeningStock(
  ctx: Ctx,
  tx: Tx,
  args: { locationId: string; number: string; date: string; items: OpeningStockItem[]; note?: string | null },
) {
  const items = args.items.filter((i) => i.quantity > 0);
  if (items.length === 0) return null;
  const sys = await ctx.accounts();
  const id = newId();
  const totalValue = items.reduce((s, i) => s + roundHalfAway(i.quantity * i.unitCost), 0);
  tx.add(
    ctx.db.insert(stockAdjustments).values({
      id,
      businessId: ctx.businessId,
      number: args.number,
      locationId: args.locationId,
      date: args.date,
      reason: "opening",
      note: args.note ?? "Opening stock",
      totalValue,
      lineCount: items.length,
      createdBy: ctx.userId,
      createdAt: ctx.now,
    }) as unknown as Stmt,
  );
  tx.add(
    insertMany(
      ctx.db,
      stockAdjustmentLines,
      items.map((i) => ({
        id: newId(),
        adjustmentId: id,
        businessId: ctx.businessId,
        variantId: i.variantId,
        quantityBefore: 0,
        quantity: roundQty(i.quantity),
        unitCost: i.unitCost,
        value: roundHalfAway(i.quantity * i.unitCost),
      })),
    ),
  );
  queueStockChanges(
    ctx,
    tx,
    items.map((i) => ({
      variantId: i.variantId,
      productId: i.productId,
      locationId: args.locationId,
      quantity: i.quantity,
      unitCost: i.unitCost,
      type: "opening" as const,
      referenceType: "adjustment",
      referenceId: id,
      referenceNumber: args.number,
      date: args.date,
    })),
  );
  tx.journal({
    date: args.date,
    memo: `Opening stock ${args.number}`,
    sourceType: "adjustment",
    sourceId: id,
    sourceNumber: args.number,
    locationId: args.locationId,
    lines: [
      { accountId: sys.inventory, debit: totalValue },
      { accountId: sys.opening_equity, credit: totalValue },
    ],
  });
  return id;
}

export async function createAdjustment(ctx: Ctx, input: StockAdjustmentInput) {
  ctx.require("inventory.manage");
  const date = docDate(ctx, input.date);
  const location = await getLocation(ctx, input.locationId);
  const info = await loadVariants(
    ctx,
    input.lines.map((l) => l.variantId),
  );
  const current = await stockAt(
    ctx,
    input.lines.map((l) => l.variantId),
    location.id,
  );
  const totals = await stockTotals(
    ctx,
    input.lines.map((l) => l.variantId),
  );

  // Merge duplicate variants (counted quantity wins; changes add up).
  const merged = new Map<string, { change: number; unitCost?: number }>();
  for (const l of input.lines) {
    const v = info.get(l.variantId)!;
    if (!v.trackInventory) throw badRequest(`${v.displayName} doesn't track inventory`);
    const before = current.get(l.variantId) ?? 0;
    const change =
      l.countedQuantity !== undefined ? roundQty(l.countedQuantity - before) : roundQty(l.quantityChange ?? 0);
    if (!v.allowDecimal && !Number.isInteger(change)) throw badRequest(`${v.displayName} only allows whole units`);
    const prev = merged.get(l.variantId);
    merged.set(l.variantId, {
      change: l.countedQuantity !== undefined ? change : roundQty((prev?.change ?? 0) + change),
      unitCost: l.unitCost ?? prev?.unitCost,
    });
  }
  const rows = [...merged.entries()].filter(([, m]) => m.change !== 0);
  if (rows.length === 0) throw badRequest("Nothing to adjust — quantities are unchanged");

  if (!ctx.business.allowNegativeStock) {
    for (const [variantId, m] of rows) {
      const after = roundQty((current.get(variantId) ?? 0) + m.change);
      if (after < 0) throw badRequest(`${info.get(variantId)!.displayName} would go below zero`);
    }
  }

  const { adjustment } = await reserveNumbers(ctx, { adjustment: 1 });
  const number = adjustment[0]!;
  const id = newId();
  const sys = await ctx.accounts();
  const tx = new Tx(ctx);

  const lines = rows.map(([variantId, m]) => {
    const v = info.get(variantId)!;
    const unitCost = m.change > 0 ? (m.unitCost ?? v.costPrice) : v.costPrice;
    if (m.change > 0 && m.unitCost !== undefined && m.unitCost !== v.costPrice) {
      queueCostUpdate(ctx, tx, variantId, weightedAverage(totals.get(variantId) ?? 0, v.costPrice, m.change, m.unitCost));
    }
    return {
      variantId,
      productId: v.productId,
      before: current.get(variantId) ?? 0,
      change: m.change,
      unitCost,
      value: roundHalfAway(m.change * unitCost),
    };
  });
  const totalValue = lines.reduce((s, l) => s + l.value, 0);

  tx.add(
    ctx.db.insert(stockAdjustments).values({
      id,
      businessId: ctx.businessId,
      number,
      locationId: location.id,
      date,
      reason: input.reason,
      note: input.note ?? null,
      totalValue,
      lineCount: lines.length,
      createdBy: ctx.userId,
      createdAt: ctx.now,
    }) as unknown as Stmt,
  );
  tx.add(
    insertMany(
      ctx.db,
      stockAdjustmentLines,
      lines.map((l) => ({
        id: newId(),
        adjustmentId: id,
        businessId: ctx.businessId,
        variantId: l.variantId,
        quantityBefore: l.before,
        quantity: l.change,
        unitCost: l.unitCost,
        value: l.value,
      })),
    ),
  );
  queueStockChanges(
    ctx,
    tx,
    lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      locationId: location.id,
      quantity: l.change,
      unitCost: l.unitCost,
      type: input.reason === "opening" ? ("opening" as const) : ("adjustment" as const),
      referenceType: "adjustment",
      referenceId: id,
      referenceNumber: number,
      note: input.note ?? ADJUSTMENT_REASON_LABELS[input.reason],
      date,
    })),
  );
  const counter = input.reason === "opening" ? sys.opening_equity : sys.inventory_adjustments;
  tx.journal({
    date,
    memo: `Stock adjustment ${number} — ${ADJUSTMENT_REASON_LABELS[input.reason]}`,
    sourceType: "adjustment",
    sourceId: id,
    sourceNumber: number,
    locationId: location.id,
    lines: [
      { accountId: sys.inventory, debit: totalValue },
      { accountId: counter, credit: totalValue },
    ],
  });
  tx.audit("inventory.adjust", `Stock adjustment ${number} (${ADJUSTMENT_REASON_LABELS[input.reason]})`, "adjustment", id);
  await tx.commit();
  return id;
}

export async function createTransfer(ctx: Ctx, input: StockTransferInput) {
  ctx.require("inventory.manage");
  const date = docDate(ctx, input.date);
  const from = await getLocation(ctx, input.fromLocationId);
  const to = await getLocation(ctx, input.toLocationId);
  const info = await loadVariants(
    ctx,
    input.lines.map((l) => l.variantId),
  );
  const merged = new Map<string, number>();
  for (const l of input.lines) {
    const v = info.get(l.variantId)!;
    if (!v.trackInventory) throw badRequest(`${v.displayName} doesn't track inventory`);
    if (!v.allowDecimal && !Number.isInteger(l.quantity)) throw badRequest(`${v.displayName} only allows whole units`);
    merged.set(l.variantId, roundQty((merged.get(l.variantId) ?? 0) + l.quantity));
  }
  if (!ctx.business.allowNegativeStock) {
    const have = await stockAt(ctx, [...merged.keys()], from.id);
    for (const [variantId, qty] of merged) {
      if (qty > (have.get(variantId) ?? 0) + 1e-9) {
        throw badRequest(`Not enough ${info.get(variantId)!.displayName} at ${from.name} (${have.get(variantId) ?? 0} available)`);
      }
    }
  }
  const { transfer } = await reserveNumbers(ctx, { transfer: 1 });
  const number = transfer[0]!;
  const id = newId();
  const tx = new Tx(ctx);
  const lines = [...merged.entries()];
  tx.add(
    ctx.db.insert(stockTransfers).values({
      id,
      businessId: ctx.businessId,
      number,
      fromLocationId: from.id,
      toLocationId: to.id,
      date,
      note: input.note ?? null,
      itemCount: lines.length,
      totalQuantity: roundQty(lines.reduce((s, [, q]) => s + q, 0)),
      createdBy: ctx.userId,
      createdAt: ctx.now,
    }) as unknown as Stmt,
  );
  tx.add(
    insertMany(
      ctx.db,
      stockTransferLines,
      lines.map(([variantId, quantity]) => ({ id: newId(), transferId: id, businessId: ctx.businessId, variantId, quantity })),
    ),
  );
  queueStockChanges(
    ctx,
    tx,
    lines.flatMap(([variantId, quantity]) => {
      const v = info.get(variantId)!;
      const base = {
        variantId,
        productId: v.productId,
        unitCost: v.costPrice,
        referenceType: "transfer",
        referenceId: id,
        referenceNumber: number,
        date,
      };
      return [
        { ...base, locationId: from.id, quantity: -quantity, type: "transfer_out" as const, note: `To ${to.name}` },
        { ...base, locationId: to.id, quantity, type: "transfer_in" as const, note: `From ${from.name}` },
      ];
    }),
  );
  tx.audit("inventory.transfer", `Stock transfer ${number}: ${from.name} → ${to.name}`, "transfer", id);
  await tx.commit();
  return id;
}

