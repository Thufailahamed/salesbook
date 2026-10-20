import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { CashMovement, CashMovementType, Shift, ShiftReport, ShiftStatus } from "@shopbooks/shared";
import {
  accounts,
  cashMovements,
  expenses,
  invoices,
  locations,
  paymentMethods,
  payments,
  saleReturns,
  shifts,
  users,
} from "../db/schema";
import type { Ctx } from "../lib/context";
import { notFound } from "../lib/errors";
import { num } from "./reports-utils";

export type ShiftRow = typeof shifts.$inferSelect;

export function shiftSelect(ctx: Ctx) {
  return ctx.db
    .select({ s: shifts, locationName: locations.name, userName: users.name })
    .from(shifts)
    .leftJoin(locations, eq(locations.id, shifts.locationId))
    .leftJoin(users, eq(users.id, shifts.userId));
}

export type ShiftSelectRow = { s: ShiftRow; locationName: string | null; userName: string | null };

interface CashFigures {
  cashIn: number;
  cashOut: number;
  payIns: number;
  payOuts: number;
}

/** Cash in/out per shift (cash-type payment methods only), drawer movements and cash expenses. */
async function cashFigures(ctx: Ctx, shiftIds: string[]): Promise<Map<string, CashFigures>> {
  const map = new Map<string, CashFigures>();
  const get = (id: string) => {
    let f = map.get(id);
    if (!f) {
      f = { cashIn: 0, cashOut: 0, payIns: 0, payOuts: 0 };
      map.set(id, f);
    }
    return f;
  };
  for (let i = 0; i < shiftIds.length; i += 90) {
    const chunk = shiftIds.slice(i, i + 90);
    const [pays, moves, exps] = await Promise.all([
      ctx.db
        .select({
          shiftId: payments.shiftId,
          direction: payments.direction,
          amount: sql<number>`coalesce(sum(${payments.amount}), 0)`,
        })
        .from(payments)
        .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
        .where(
          and(
            inArray(payments.shiftId, chunk),
            eq(payments.status, "completed"),
            eq(payments.tender, "method"),
            eq(paymentMethods.type, "cash"),
          ),
        )
        .groupBy(payments.shiftId, payments.direction),
      ctx.db
        .select({
          shiftId: cashMovements.shiftId,
          type: cashMovements.type,
          amount: sql<number>`coalesce(sum(${cashMovements.amount}), 0)`,
        })
        .from(cashMovements)
        .where(inArray(cashMovements.shiftId, chunk))
        .groupBy(cashMovements.shiftId, cashMovements.type),
      ctx.db
        .select({ shiftId: expenses.shiftId, amount: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
        .from(expenses)
        .innerJoin(paymentMethods, eq(paymentMethods.id, expenses.methodId))
        .where(and(inArray(expenses.shiftId, chunk), eq(expenses.status, "posted"), eq(paymentMethods.type, "cash")))
        .groupBy(expenses.shiftId),
    ]);
    for (const p of pays) {
      if (!p.shiftId) continue;
      const f = get(p.shiftId);
      if (p.direction === "in") f.cashIn += num(p.amount);
      else f.cashOut += num(p.amount);
    }
    for (const m of moves) {
      const f = get(m.shiftId);
      if (m.type === "pay_in") f.payIns += num(m.amount);
      else f.payOuts += num(m.amount);
    }
    for (const e of exps) {
      if (!e.shiftId) continue;
      get(e.shiftId).payOuts += num(e.amount);
    }
  }
  return map;
}

function mapShift(r: ShiftSelectRow, f: CashFigures | undefined): Shift {
  const s = r.s;
  const fig = f ?? { cashIn: 0, cashOut: 0, payIns: 0, payOuts: 0 };
  const computed = s.openingFloat + fig.cashIn - fig.cashOut + fig.payIns - fig.payOuts;
  const expectedCash = s.status === "closed" && s.expectedCash != null ? s.expectedCash : computed;
  return {
    id: s.id,
    number: s.number,
    locationId: s.locationId,
    locationName: r.locationName ?? null,
    userId: s.userId,
    userName: r.userName ?? null,
    status: s.status as ShiftStatus,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    openingFloat: s.openingFloat,
    cashSales: fig.cashIn,
    cashRefunds: fig.cashOut,
    payIns: fig.payIns,
    payOuts: fig.payOuts,
    expectedCash,
    countedCash: s.countedCash,
    difference: s.difference,
    note: s.note,
    closingNote: s.closingNote,
  };
}

export async function computeShifts(ctx: Ctx, rows: ShiftSelectRow[]): Promise<Shift[]> {
  const figures = await cashFigures(
    ctx,
    rows.map((r) => r.s.id),
  );
  return rows.map((r) => mapShift(r, figures.get(r.s.id)));
}

/** Accepts a bare shift row or a joined select row. */
export async function computeShift(ctx: Ctx, row: ShiftRow | ShiftSelectRow): Promise<Shift> {
  let joined: ShiftSelectRow;
  if ("s" in row) joined = row;
  else {
    const [r] = await shiftSelect(ctx).where(eq(shifts.id, row.id));
    joined = r ?? { s: row, locationName: null, userName: null };
  }
  return (await computeShifts(ctx, [joined]))[0]!;
}

export async function getShiftRow(ctx: Ctx, id: string): Promise<ShiftSelectRow> {
  const [row] = await shiftSelect(ctx).where(and(eq(shifts.id, id), eq(shifts.businessId, ctx.businessId)));
  if (!row) throw notFound("Shift");
  return row;
}

export async function getShiftReport(ctx: Ctx, id: string): Promise<ShiftReport> {
  const row = await getShiftRow(ctx, id);
  const shift = await computeShift(ctx, row);
  const [inv, rets, byMethod, moves] = await Promise.all([
    ctx.db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${invoices.total}), 0)`,
        discount: sql<number>`coalesce(sum(${invoices.discountTotal}), 0)`,
        tax: sql<number>`coalesce(sum(${invoices.taxTotal}), 0)`,
      })
      .from(invoices)
      .where(and(eq(invoices.shiftId, id), eq(invoices.status, "completed"), eq(invoices.kind, "sale"))),
    ctx.db
      .select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${saleReturns.total}), 0)` })
      .from(saleReturns)
      .where(eq(saleReturns.shiftId, id)),
    ctx.db
      .select({
        methodId: payments.methodId,
        name: paymentMethods.name,
        type: paymentMethods.type,
        collected: sql<number>`coalesce(sum(case when ${payments.direction} = 'in' then ${payments.amount} else 0 end), 0)`,
        refunded: sql<number>`coalesce(sum(case when ${payments.direction} = 'out' then ${payments.amount} else 0 end), 0)`,
      })
      .from(payments)
      .leftJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
      .where(and(eq(payments.shiftId, id), eq(payments.status, "completed")))
      .groupBy(payments.methodId, paymentMethods.name, paymentMethods.type)
      .orderBy(asc(paymentMethods.sortOrder)),
    ctx.db
      .select({ m: cashMovements, accountName: accounts.name, userName: users.name })
      .from(cashMovements)
      .leftJoin(accounts, eq(accounts.id, cashMovements.accountId))
      .leftJoin(users, eq(users.id, cashMovements.userId))
      .where(eq(cashMovements.shiftId, id))
      .orderBy(asc(cashMovements.createdAt)),
  ]);
  const i = inv[0];
  const r = rets[0];
  return {
    ...shift,
    invoiceCount: num(i?.count),
    salesTotal: num(i?.total),
    returnsCount: num(r?.count),
    returnsTotal: num(r?.total),
    discountTotal: num(i?.discount),
    taxTotal: num(i?.tax),
    byMethod: byMethod.map((m) => ({
      methodId: m.methodId,
      name: m.name ?? "Other",
      type: m.type ?? "other",
      collected: num(m.collected),
      refunded: num(m.refunded),
    })),
    movements: moves.map(mapCashMovement),
    denominations: row.s.denominations ?? null,
  };
}

export function mapCashMovement(r: {
  m: typeof cashMovements.$inferSelect;
  accountName: string | null;
  userName: string | null;
}): CashMovement {
  return {
    id: r.m.id,
    type: r.m.type as CashMovementType,
    amount: r.m.amount,
    accountId: r.m.accountId,
    accountName: r.accountName ?? null,
    reason: r.m.reason,
    createdAt: r.m.createdAt,
    userName: r.userName ?? null,
  };
}
