import { and, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Expense, ExpenseInput } from "@shopbooks/shared";
import { accounts, expenses, journalEntries, locations, paymentMethods, suppliers, users } from "../db/schema";
import { docDate, type Ctx } from "../lib/context";
import { badRequest, notFound } from "../lib/errors";
import { likeQ, pageParams, paged } from "../lib/http";
import { newId } from "../lib/ids";
import { getOpenShift, getSupplier, requireMethod } from "./payments";
import { getLocation } from "./sales";
import { reserveNumbers } from "./sequences";
import { Tx, queueReversals } from "./tx";

const creator = alias(users, "creator");

function expenseSelect(ctx: Ctx) {
  return ctx.db
    .select({
      e: expenses,
      accountName: accounts.name,
      accountCode: accounts.code,
      methodName: paymentMethods.name,
      supplierName: suppliers.name,
      locationName: locations.name,
      createdByName: creator.name,
    })
    .from(expenses)
    .leftJoin(accounts, eq(accounts.id, expenses.accountId))
    .leftJoin(paymentMethods, eq(paymentMethods.id, expenses.methodId))
    .leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
    .leftJoin(locations, eq(locations.id, expenses.locationId))
    .leftJoin(creator, eq(creator.id, expenses.createdBy));
}

type ExpenseSelectRow = Awaited<ReturnType<ReturnType<typeof expenseSelect>["where"]>>[number];

function mapExpense(r: ExpenseSelectRow): Expense {
  const e = r.e;
  return {
    id: e.id,
    number: e.number,
    date: e.date,
    accountId: e.accountId,
    accountName: r.accountName ?? null,
    accountCode: r.accountCode ?? null,
    amount: e.amount,
    taxAmount: e.taxAmount,
    methodId: e.methodId,
    methodName: r.methodName ?? null,
    supplierId: e.supplierId,
    supplierName: r.supplierName ?? null,
    payee: e.payee,
    reference: e.reference,
    note: e.note,
    locationId: e.locationId,
    locationName: r.locationName ?? null,
    status: e.status as "posted" | "void",
    createdByName: r.createdByName ?? null,
    createdAt: e.createdAt,
  };
}

export async function getExpenseDto(ctx: Ctx, id: string): Promise<Expense> {
  const [row] = await expenseSelect(ctx).where(and(eq(expenses.id, id), eq(expenses.businessId, ctx.businessId)));
  if (!row) throw notFound("Expense");
  return mapExpense(row);
}

export async function listExpenses(
  ctx: Ctx,
  q: {
    page: number;
    pageSize: number;
    q?: string;
    from?: string;
    to?: string;
    accountId?: string;
    locationId?: string;
    status?: "posted" | "void";
  },
) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(expenses.businessId, ctx.businessId)];
  if (q.from) conds.push(gte(expenses.date, q.from));
  if (q.to) conds.push(lte(expenses.date, q.to));
  if (q.accountId) conds.push(eq(expenses.accountId, q.accountId));
  if (q.locationId) conds.push(eq(expenses.locationId, q.locationId));
  if (q.status) conds.push(eq(expenses.status, q.status));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(
      or(
        like(expenses.number, term),
        like(expenses.payee, term),
        like(expenses.reference, term),
        like(expenses.note, term),
        like(suppliers.name, term),
      )!,
    );
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    expenseSelect(ctx).where(where).orderBy(desc(expenses.date), desc(expenses.createdAt)).limit(limit).offset(offset),
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        amount: sql<number>`coalesce(sum(case when ${expenses.status} = 'posted' then ${expenses.amount} else 0 end), 0)`,
      })
      .from(expenses)
      .leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
      .where(where),
  ]);
  return { ...paged(rows.map(mapExpense), count?.n ?? 0, q), totals: { amount: Number(count?.amount ?? 0) } };
}

export async function createExpense(ctx: Ctx, input: ExpenseInput): Promise<Expense> {
  ctx.require("expenses.manage");
  if (input.taxAmount > input.amount) throw badRequest("Tax can't be more than the total amount");
  const [account] = await ctx.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.businessId, ctx.businessId)));
  if (!account || account.type !== "expense" || !account.isActive) {
    throw badRequest("Choose an active expense category");
  }
  const method = await requireMethod(ctx, input.methodId);
  const supplier = input.supplierId ? await getSupplier(ctx, input.supplierId) : null;
  const date = docDate(ctx, input.date);
  const shift = method.type === "cash" ? await getOpenShift(ctx) : null;
  const locationId = input.locationId ? (await getLocation(ctx, input.locationId)).id : (shift?.locationId ?? null);
  const sys = await ctx.accounts();
  const { expense } = await reserveNumbers(ctx, { expense: 1 });
  const number = expense[0]!;
  const id = newId();
  const net = input.amount - input.taxAmount;

  const tx = new Tx(ctx);
  tx.add(
    ctx.db.insert(expenses).values({
      id,
      businessId: ctx.businessId,
      number,
      date,
      accountId: account.id,
      amount: input.amount,
      taxAmount: input.taxAmount,
      methodId: method.id,
      paymentAccountId: method.accountId,
      supplierId: supplier?.id ?? null,
      payee: input.payee?.trim() || supplier?.name || null,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      locationId,
      shiftId: shift?.id ?? null,
      status: "posted",
      createdBy: ctx.userId,
      createdAt: ctx.now,
    }),
  );
  tx.journal({
    date,
    memo: `Expense ${number} — ${account.name}${input.payee ? ` (${input.payee})` : supplier ? ` (${supplier.name})` : ""}`,
    sourceType: "expense",
    sourceId: id,
    sourceNumber: number,
    locationId,
    lines: [
      { accountId: account.id, debit: net, memo: input.note ?? null },
      { accountId: sys.input_tax, debit: input.taxAmount },
      { accountId: method.accountId, credit: input.amount, memo: method.name },
    ],
  });
  tx.audit("expense.create", `Recorded expense ${number} (${account.name})`, "expense", id, { amount: input.amount });
  await tx.commit();
  return getExpenseDto(ctx, id);
}

export async function voidExpense(ctx: Ctx, id: string, reason: string): Promise<Expense> {
  ctx.require("expenses.manage");
  const [row] = await ctx.db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.businessId, ctx.businessId)));
  if (!row) throw notFound("Expense");
  if (row.status === "void") throw badRequest("This expense is already void");
  const entries = await ctx.db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.businessId, ctx.businessId),
        eq(journalEntries.sourceType, "expense"),
        eq(journalEntries.sourceId, row.id),
      ),
    );
  const tx = new Tx(ctx);
  await queueReversals(
    ctx,
    tx,
    entries.map((e) => e.id),
    { date: ctx.today, memo: `Void expense ${row.number}`, sourceType: "expense_void", sourceId: row.id, sourceNumber: row.number },
  );
  tx.add(
    ctx.db
      .update(expenses)
      .set({ status: "void", note: [row.note, `Voided: ${reason}`].filter(Boolean).join(" — ") })
      .where(eq(expenses.id, row.id)),
  );
  tx.audit("expense.void", `Voided expense ${row.number}: ${reason}`, "expense", row.id);
  await tx.commit();
  return getExpenseDto(ctx, row.id);
}
