import { and, eq, gt, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import {
  addDays,
  daysBetween,
  type AccountAmount,
  type AgingReport,
  type AgingRow,
  type BalanceSheetReport,
  type CashFlowReport,
  type ExpenseReport,
  type ProfitLossReport,
  type ProfitLossSummary,
  type TaxReport,
  type TrialBalanceReport,
  type AccountType,
  type CashFlowLine,
  type CashFlowSection,
} from "@shopbooks/shared";
import {
  accounts,
  customers,
  expenses,
  invoiceLines,
  invoices,
  journalLines,
  purchaseLines,
  purchaseReturns,
  purchases,
  saleReturnLines,
  saleReturns,
  suppliers,
} from "../db/schema";
import type { Ctx } from "../lib/context";
import { accountSums, enumeratePeriods, loadAccounts, num, pct, periodSql, type AccountRow, type GroupBy } from "./reports-utils";

function amountRow(a: AccountRow, amount: number): AccountAmount {
  return { accountId: a.id, code: a.code, name: a.name, subtype: a.subtype, amount };
}

const sum = (rows: AccountAmount[]) => rows.reduce((s, r) => s + r.amount, 0);

// ---------------------------------------------------------------- profit & loss

export async function profitLoss(ctx: Ctx, f: { from: string; to: string; locationId?: string }): Promise<ProfitLossReport> {
  const current = await profitLossPeriod(ctx, f);
  const days = daysBetween(f.from, f.to) + 1;
  const prevTo = addDays(f.from, -1);
  const prev = await profitLossPeriod(ctx, { from: addDays(prevTo, 1 - days), to: prevTo, locationId: f.locationId });
  const previous: ProfitLossSummary = {
    from: prev.from,
    to: prev.to,
    netRevenue: prev.netRevenue,
    totalCostOfSales: prev.totalCostOfSales,
    grossProfit: prev.grossProfit,
    totalExpenses: prev.totalExpenses,
    netProfit: prev.netProfit,
  };
  return { ...current, previous };
}

async function profitLossPeriod(ctx: Ctx, f: { from: string; to: string; locationId?: string }): Promise<Omit<ProfitLossReport, "previous">> {
  const [accs, sums] = await Promise.all([
    loadAccounts(ctx),
    accountSums(ctx, { from: f.from, to: f.to, locationId: f.locationId }),
  ]);
  const income: AccountAmount[] = [];
  const costOfSales: AccountAmount[] = [];
  const expensesRows: AccountAmount[] = [];
  const otherIncome: AccountAmount[] = [];
  for (const a of accs) {
    const s = sums.get(a.id);
    if (!s) continue;
    const creditSide = s.credit - s.debit;
    const debitSide = s.debit - s.credit;
    if (a.type === "income") {
      if (a.subtype === "other_income") {
        if (creditSide !== 0) otherIncome.push(amountRow(a, creditSide));
      } else if (creditSide !== 0) income.push(amountRow(a, creditSide));
    } else if (a.type === "expense") {
      if (debitSide === 0) continue;
      if (a.subtype === "cogs") costOfSales.push(amountRow(a, debitSide));
      else expensesRows.push(amountRow(a, debitSide));
    }
  }
  const netRevenue = sum(income);
  const totalCostOfSales = sum(costOfSales);
  const grossProfit = netRevenue - totalCostOfSales;
  const totalExpenses = sum(expensesRows);
  const totalOtherIncome = sum(otherIncome);
  const netProfit = grossProfit - totalExpenses + totalOtherIncome;
  return {
    from: f.from,
    to: f.to,
    income,
    netRevenue,
    costOfSales,
    totalCostOfSales,
    grossProfit,
    grossMargin: pct(grossProfit, netRevenue),
    expenses: expensesRows,
    totalExpenses,
    otherIncome,
    totalOtherIncome,
    netProfit,
    netMargin: pct(netProfit, netRevenue),
  };
}

// ---------------------------------------------------------------- balance sheet & trial balance

export async function balanceSheet(ctx: Ctx, asOf: string): Promise<BalanceSheetReport> {
  const [accs, sums] = await Promise.all([loadAccounts(ctx), accountSums(ctx, { to: asOf })]);
  const assets: AccountAmount[] = [];
  const liabilities: AccountAmount[] = [];
  const equity: AccountAmount[] = [];
  let currentEarnings = 0;
  for (const a of accs) {
    const s = sums.get(a.id);
    if (!s) continue;
    const debitSide = s.debit - s.credit;
    const creditSide = -debitSide;
    switch (a.type as AccountType) {
      case "asset":
        if (debitSide !== 0) assets.push(amountRow(a, debitSide));
        break;
      case "liability":
        if (creditSide !== 0) liabilities.push(amountRow(a, creditSide));
        break;
      case "equity":
        if (creditSide !== 0) equity.push(amountRow(a, creditSide));
        break;
      case "income":
        currentEarnings += creditSide;
        break;
      case "expense":
        currentEarnings -= debitSide;
        break;
    }
  }
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity) + currentEarnings;
  return {
    asOf,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    equity,
    currentEarnings,
    totalEquity,
    totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
  };
}

export async function trialBalance(ctx: Ctx, asOf: string): Promise<TrialBalanceReport> {
  const [accs, sums] = await Promise.all([loadAccounts(ctx), accountSums(ctx, { to: asOf })]);
  const rows = accs
    .map((a) => {
      const s = sums.get(a.id);
      const net = s ? s.debit - s.credit : 0;
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        type: a.type as AccountType,
        debit: net > 0 ? net : 0,
        credit: net < 0 ? -net : 0,
      };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);
  return {
    asOf,
    rows,
    totalDebit: rows.reduce((s, r) => s + r.debit, 0),
    totalCredit: rows.reduce((s, r) => s + r.credit, 0),
  };
}

export async function cashFlow(ctx: Ctx, f: { from: string; to: string }): Promise<CashFlowReport> {
  const [accs, opening, period, activities] = await Promise.all([
    loadAccounts(ctx),
    accountSums(ctx, { before: f.from }),
    accountSums(ctx, { from: f.from, to: f.to }),
    cashActivities(ctx, f),
  ]);
  const rows = accs
    .filter((a) => a.type === "asset" && (a.subtype === "cash" || a.subtype === "bank"))
    .map((a) => {
      const o = opening.get(a.id);
      const p = period.get(a.id);
      const open = o ? o.debit - o.credit : 0;
      const inflow = p?.debit ?? 0;
      const outflow = p?.credit ?? 0;
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        opening: open,
        inflow,
        outflow,
        closing: open + inflow - outflow,
        active: a.isActive,
      };
    })
    .filter((r) => r.active || r.opening !== 0 || r.inflow !== 0 || r.outflow !== 0)
    .map(({ active: _a, ...r }) => r);
  const totalOpening = rows.reduce((s, r) => s + r.opening, 0);
  const totalClosing = rows.reduce((s, r) => s + r.closing, 0);
  return {
    from: f.from,
    to: f.to,
    accounts: rows,
    totalOpening,
    totalInflow: rows.reduce((s, r) => s + r.inflow, 0),
    totalOutflow: rows.reduce((s, r) => s + r.outflow, 0),
    totalClosing,
    activities,
    netChange: activities.operating.total + activities.investing.total + activities.financing.total,
  };
}

/**
 * Direct-method activity split. Each journal entry that moves cash is classified by the non-cash account it was
 * paid against: fixed assets are investing, equity and long-term loans are financing, everything else is operating.
 * Cash-to-cash moves (transfers between cash, bank and wallet accounts) net to zero and are left out.
 */
async function cashActivities(ctx: Ctx, f: { from: string; to: string }): Promise<CashFlowReport["activities"]> {
  const [accs, cashIds] = await Promise.all([loadAccounts(ctx), cashAccountIds(ctx)]);
  const byId = new Map(accs.map((a) => [a.id, a]));
  const empty = (): CashFlowSection => ({ items: [], total: 0 });
  const result = { operating: empty(), investing: empty(), financing: empty() };
  if (cashIds.size === 0) return result;

  const cashList = sql.join([...cashIds].map((id) => sql`${id}`), sql`, `);
  const rows = await ctx.db
    .select({
      entryId: journalLines.entryId,
      accountId: journalLines.accountId,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .where(
      and(
        eq(journalLines.businessId, ctx.businessId),
        sql`${journalLines.entryId} in (
          select c.entry_id from ${journalLines} c
          where c.business_id = ${ctx.businessId} and c.date >= ${f.from} and c.date <= ${f.to}
            and c.account_id in (${cashList}))`,
      ),
    );

  const byEntry = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byEntry.get(r.entryId);
    if (list) list.push(r);
    else byEntry.set(r.entryId, [r]);
  }

  const items = { operating: new Map<string, CashFlowLine>(), investing: new Map<string, CashFlowLine>(), financing: new Map<string, CashFlowLine>() };
  for (const lines of byEntry.values()) {
    let cashDelta = 0;
    let counter: { accountId: string; amount: number } | null = null;
    for (const l of lines) {
      const net = num(l.debit) - num(l.credit);
      if (cashIds.has(l.accountId)) {
        cashDelta += net;
        continue;
      }
      if (!counter || Math.abs(net) > Math.abs(counter.amount)) counter = { accountId: l.accountId, amount: net };
    }
    if (cashDelta === 0 || !counter) continue;
    const acc = byId.get(counter.accountId);
    if (!acc) continue;
    const bucket: keyof typeof items =
      acc.subtype === "fixed_asset"
        ? "investing"
        : acc.type === "equity" || acc.subtype === "long_term_liability"
          ? "financing"
          : "operating";
    const line = items[bucket].get(acc.id) ?? { accountId: acc.id, code: acc.code, name: acc.name, amount: 0 };
    line.amount += cashDelta;
    items[bucket].set(acc.id, line);
  }
  for (const key of ["operating", "investing", "financing"] as const) {
    const list = [...items[key].values()].filter((l) => l.amount !== 0).sort((a, b) => a.code.localeCompare(b.code));
    result[key] = { items: list, total: list.reduce((s, l) => s + l.amount, 0) };
  }
  return result;
}

async function cashAccountIds(ctx: Ctx) {
  const rows = await ctx.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.businessId, ctx.businessId), eq(accounts.type, "asset"), inArray(accounts.subtype, ["cash", "bank"])));
  return new Set(rows.map((r) => r.id));
}

// ---------------------------------------------------------------- tax

export async function taxReport(ctx: Ctx, f: { from: string; to: string; locationId?: string }): Promise<TaxReport> {
  const b = ctx.businessId;
  const invConds: SQL[] = [
    eq(invoices.businessId, b),
    eq(invoices.kind, "sale"),
    eq(invoices.status, "completed"),
    gte(invoices.date, f.from),
    lte(invoices.date, f.to),
  ];
  const retConds: SQL[] = [eq(saleReturns.businessId, b), gte(saleReturns.date, f.from), lte(saleReturns.date, f.to)];
  const purConds: SQL[] = [
    eq(purchases.businessId, b),
    eq(purchases.status, "received"),
    eq(purchases.kind, "purchase"),
    gte(purchases.receivedDate, f.from),
    lte(purchases.receivedDate, f.to),
  ];
  const pretConds: SQL[] = [eq(purchaseReturns.businessId, b), gte(purchaseReturns.date, f.from), lte(purchaseReturns.date, f.to)];
  const expConds: SQL[] = [eq(expenses.businessId, b), eq(expenses.status, "posted"), gte(expenses.date, f.from), lte(expenses.date, f.to)];
  if (f.locationId) {
    invConds.push(eq(invoices.locationId, f.locationId));
    retConds.push(eq(saleReturns.locationId, f.locationId));
    purConds.push(eq(purchases.locationId, f.locationId));
    pretConds.push(eq(purchaseReturns.locationId, f.locationId));
    expConds.push(eq(expenses.locationId, f.locationId));
  }
  const [[s], [sr], [p], [pr], [e], salesByRate, returnsByRate, purchasesByRate] = await Promise.all([
    ctx.db.select({ v: sql<number>`coalesce(sum(${invoices.taxTotal}), 0)` }).from(invoices).where(and(...invConds)),
    ctx.db.select({ v: sql<number>`coalesce(sum(${saleReturns.taxTotal}), 0)` }).from(saleReturns).where(and(...retConds)),
    ctx.db.select({ v: sql<number>`coalesce(sum(${purchases.taxTotal}), 0)` }).from(purchases).where(and(...purConds)),
    ctx.db
      .select({ v: sql<number>`coalesce(sum(${purchaseReturns.taxTotal}), 0)` })
      .from(purchaseReturns)
      .where(and(...pretConds)),
    ctx.db.select({ v: sql<number>`coalesce(sum(${expenses.taxAmount}), 0)` }).from(expenses).where(and(...expConds)),
    ctx.db
      .select({
        rate: invoiceLines.taxRate,
        net: sql<number>`coalesce(sum(${invoiceLines.net}), 0)`,
        tax: sql<number>`coalesce(sum(${invoiceLines.tax}), 0)`,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .where(and(...invConds))
      .groupBy(invoiceLines.taxRate),
    ctx.db
      .select({
        rate: invoiceLines.taxRate,
        net: sql<number>`coalesce(sum(${saleReturnLines.net}), 0)`,
        tax: sql<number>`coalesce(sum(${saleReturnLines.tax}), 0)`,
      })
      .from(saleReturnLines)
      .innerJoin(saleReturns, eq(saleReturns.id, saleReturnLines.returnId))
      .innerJoin(invoiceLines, eq(invoiceLines.id, saleReturnLines.invoiceLineId))
      .where(and(...retConds))
      .groupBy(invoiceLines.taxRate),
    ctx.db
      .select({
        rate: purchaseLines.taxRate,
        net: sql<number>`coalesce(sum(${purchaseLines.net}), 0)`,
        tax: sql<number>`coalesce(sum(${purchaseLines.tax}), 0)`,
      })
      .from(purchaseLines)
      .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
      .where(and(...purConds))
      .groupBy(purchaseLines.taxRate),
  ]);

  const byRate = new Map<number, TaxReport["byRate"][number]>();
  const rateRow = (rate: number) => {
    let r = byRate.get(rate);
    if (!r) {
      r = { rate, taxableSales: 0, salesTax: 0, taxablePurchases: 0, purchaseTax: 0 };
      byRate.set(rate, r);
    }
    return r;
  };
  for (const r of salesByRate) {
    const row = rateRow(num(r.rate));
    row.taxableSales += num(r.net);
    row.salesTax += num(r.tax);
  }
  for (const r of returnsByRate) {
    const row = rateRow(num(r.rate));
    row.taxableSales -= num(r.net);
    row.salesTax -= num(r.tax);
  }
  for (const r of purchasesByRate) {
    const row = rateRow(num(r.rate));
    row.taxablePurchases += num(r.net);
    row.purchaseTax += num(r.tax);
  }

  const salesTax = num(s?.v);
  const salesReturnsTax = num(sr?.v);
  const purchaseTax = num(p?.v);
  const purchaseReturnsTax = num(pr?.v);
  const expenseTax = num(e?.v);
  const outputTax = salesTax - salesReturnsTax;
  const inputTax = purchaseTax - purchaseReturnsTax + expenseTax;
  return {
    from: f.from,
    to: f.to,
    salesTax,
    salesReturnsTax,
    purchaseTax,
    purchaseReturnsTax,
    expenseTax,
    outputTax,
    inputTax,
    netPayable: outputTax - inputTax,
    byRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
  };
}

// ---------------------------------------------------------------- aging

function bucket(row: AgingRow, amount: number, overdueDays: number) {
  if (overdueDays <= 0) row.current += amount;
  else if (overdueDays <= 30) row.d1_30 += amount;
  else if (overdueDays <= 60) row.d31_60 += amount;
  else if (overdueDays <= 90) row.d61_90 += amount;
  else row.d90plus += amount;
  row.total += amount;
}

function finishAging(asOf: string, rows: Map<string, AgingRow>): AgingReport {
  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  const totals = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
  for (const r of list) {
    totals.current += r.current;
    totals.d1_30 += r.d1_30;
    totals.d31_60 += r.d31_60;
    totals.d61_90 += r.d61_90;
    totals.d90plus += r.d90plus;
    totals.total += r.total;
  }
  return { asOf, rows: list, totals };
}

function emptyAgingRow(partyId: string, name: string, phone: string | null): AgingRow {
  return { partyId, name, phone, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
}

export async function receivablesAging(ctx: Ctx, asOf: string): Promise<AgingReport> {
  const docs = await ctx.db
    .select({
      customerId: invoices.customerId,
      name: customers.name,
      phone: customers.phone,
      date: invoices.date,
      dueDate: invoices.dueDate,
      due: invoices.amountDue,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        eq(invoices.businessId, ctx.businessId),
        eq(invoices.status, "completed"),
        gt(invoices.amountDue, 0),
        lte(invoices.date, asOf),
      ),
    );
  const rows = new Map<string, AgingRow>();
  for (const d of docs) {
    if (!d.customerId) continue;
    let row = rows.get(d.customerId);
    if (!row) {
      row = emptyAgingRow(d.customerId, d.name, d.phone);
      rows.set(d.customerId, row);
    }
    bucket(row, d.due, daysBetween(d.dueDate ?? d.date, asOf));
  }
  return finishAging(asOf, rows);
}

export async function payablesAging(ctx: Ctx, asOf: string): Promise<AgingReport> {
  const docDateSql = sql<string>`coalesce(${purchases.receivedDate}, ${purchases.orderDate})`;
  const docs = await ctx.db
    .select({
      supplierId: purchases.supplierId,
      name: suppliers.name,
      phone: suppliers.phone,
      date: docDateSql,
      dueDate: purchases.dueDate,
      due: purchases.amountDue,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(
      and(
        eq(purchases.businessId, ctx.businessId),
        eq(purchases.status, "received"),
        gt(purchases.amountDue, 0),
        sql`${docDateSql} <= ${asOf}`,
      ),
    );
  const rows = new Map<string, AgingRow>();
  for (const d of docs) {
    let row = rows.get(d.supplierId);
    if (!row) {
      row = emptyAgingRow(d.supplierId, d.name, d.phone);
      rows.set(d.supplierId, row);
    }
    bucket(row, d.due, daysBetween(d.dueDate ?? d.date, asOf));
  }
  return finishAging(asOf, rows);
}

// ---------------------------------------------------------------- expenses

export async function expenseReport(
  ctx: Ctx,
  f: { from: string; to: string; locationId?: string },
  groupBy: GroupBy,
): Promise<ExpenseReport> {
  const conds: SQL[] = [
    eq(expenses.businessId, ctx.businessId),
    eq(expenses.status, "posted"),
    gte(expenses.date, f.from),
    lte(expenses.date, f.to),
  ];
  if (f.locationId) conds.push(eq(expenses.locationId, f.locationId));
  const period = periodSql(expenses.date, groupBy);
  const [byAccount, series] = await Promise.all([
    ctx.db
      .select({
        accountId: expenses.accountId,
        code: accounts.code,
        name: accounts.name,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(expenses)
      .leftJoin(accounts, eq(accounts.id, expenses.accountId))
      .where(and(...conds))
      .groupBy(expenses.accountId, accounts.code, accounts.name),
    ctx.db
      .select({ period, amount: sql<number>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(...conds))
      .groupBy(period),
  ]);
  const seriesMap = new Map(series.map((s) => [s.period, num(s.amount)]));
  const periods = new Set(enumeratePeriods(f.from, f.to, groupBy));
  for (const k of seriesMap.keys()) periods.add(k);
  const rows = byAccount
    .map((r) => ({
      accountId: r.accountId,
      code: r.code ?? "",
      name: r.name ?? "Unknown",
      amount: num(r.amount),
      count: num(r.count),
    }))
    .sort((a, b) => b.amount - a.amount);
  return {
    from: f.from,
    to: f.to,
    total: rows.reduce((s, r) => s + r.amount, 0),
    byAccount: rows,
    series: [...periods].sort().map((p) => ({ period: p, amount: seriesMap.get(p) ?? 0 })),
  };
}
