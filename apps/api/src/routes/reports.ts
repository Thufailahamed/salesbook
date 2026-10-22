import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  addDays,
  addMonths,
  endOfMonth,
  reportQuerySchema,
  startOfMonth,
  type DashboardData,
} from "@shopbooks/shared";
import { customers, suppliers } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vQuery } from "../lib/validate";
import { getOpenShift } from "../services/payments";
import {
  balanceSheet,
  cashFlow,
  expenseReport,
  payablesAging,
  profitLoss,
  receivablesAging,
  taxReport,
  trialBalance,
} from "../services/reports-finance";
import { inventoryValuation, stockHealth, stockRows } from "../services/reports-inventory";
import { cashForecast } from "../services/cash-forecast";
import { salesReview } from "../services/sales-review";
import { deadStockReport, expiryReport } from "../services/reports-stock";
import {
  categorySales,
  collections,
  paymentMix,
  productSales,
  salesSeries,
  salesSummary,
  salesTotals,
} from "../services/reports-sales";
import { accountSums, loadAccounts, num, reportRange, type GroupBy } from "../services/reports-utils";
import { listInvoices } from "../services/sales-read";
import { computeShift } from "../services/shifts";

const app = new Hono<AppEnv>();
const view = requirePerm("reports.view");

const productQuery = reportQuerySchema.extend({ categoryId: z.string().optional() });

// ---------------------------------------------------------------- dashboard

app.get("/dashboard", requirePerm("dashboard.view"), vQuery(z.object({ locationId: z.string().optional() })), async (c) => {
  const ctx = c.get("ctx");
  const locationId = c.req.valid("query").locationId || undefined;
  const today = ctx.today;
  const yesterday = addDays(today, -1);
  const monthStart = startOfMonth(today);
  const lastMonthStart = addMonths(monthStart, -1);
  const lastMonthEnd = endOfMonth(lastMonthStart);
  const trendFrom = addDays(today, -29);

  const [
    todayT,
    yesterdayT,
    monthT,
    lastMonthT,
    collectedToday,
    monthSums,
    allSums,
    accs,
    [recv],
    [pay],
    health,
    trend,
    top,
    cats,
    mix,
    recent,
    lowStock,
    shiftRow,
  ] = await Promise.all([
    salesTotals(ctx, { from: today, to: today, locationId }),
    salesTotals(ctx, { from: yesterday, to: yesterday, locationId }),
    salesTotals(ctx, { from: monthStart, to: today, locationId }),
    salesTotals(ctx, { from: lastMonthStart, to: lastMonthEnd, locationId }),
    collections(ctx, { from: today, to: today, locationId }),
    accountSums(ctx, { from: monthStart, to: today, locationId }),
    accountSums(ctx, { to: today }),
    loadAccounts(ctx),
    ctx.db
      .select({ v: sql<number>`coalesce(sum(${customers.dueBalance}), 0)` })
      .from(customers)
      .where(eq(customers.businessId, ctx.businessId)),
    ctx.db
      .select({ v: sql<number>`coalesce(sum(${suppliers.dueBalance}), 0)` })
      .from(suppliers)
      .where(eq(suppliers.businessId, ctx.businessId)),
    stockHealth(ctx, locationId),
    salesSeries(ctx, { from: trendFrom, to: today, locationId }, "day"),
    productSales(ctx, { from: trendFrom, to: today, locationId, limit: 6 }),
    categorySales(ctx, { from: trendFrom, to: today, locationId }),
    paymentMix(ctx, { from: monthStart, to: today, locationId }),
    listInvoices(ctx, { page: 1, pageSize: 8, kind: "sale", locationId }),
    stockRows(ctx, { locationId, mode: "low", limit: 8 }),
    getOpenShift(ctx),
  ]);

  let monthExpenses = 0;
  let cashBalance = 0;
  for (const a of accs) {
    if (a.type === "expense" && a.subtype === "expense") {
      const s = monthSums.get(a.id);
      if (s) monthExpenses += s.debit - s.credit;
    }
    if (a.type === "asset" && (a.subtype === "cash" || a.subtype === "bank")) {
      const s = allSums.get(a.id);
      if (s) cashBalance += s.debit - s.credit;
    }
  }

  const mixMap = new Map<string, number>();
  for (const m of mix) mixMap.set(m.name, (mixMap.get(m.name) ?? 0) + m.amount);

  const data: DashboardData = {
    today: {
      netSales: todayT.netSales,
      invoices: todayT.invoices,
      grossProfit: todayT.grossProfit,
      avgBasket: todayT.invoices ? Math.round(todayT.total / todayT.invoices) : 0,
      collected: collectedToday,
    },
    yesterday: { netSales: yesterdayT.netSales, invoices: yesterdayT.invoices },
    month: {
      netSales: monthT.netSales,
      grossProfit: monthT.grossProfit,
      expenses: monthExpenses,
      returns: monthT.returnsNet,
      netProfit: monthT.grossProfit - monthExpenses,
    },
    lastMonth: { netSales: lastMonthT.netSales, grossProfit: lastMonthT.grossProfit },
    receivables: num(recv?.v),
    payables: num(pay?.v),
    cashBalance,
    inventoryValue: health.inventoryValue,
    lowStockCount: health.lowStockCount,
    outOfStockCount: health.outOfStockCount,
    salesTrend: trend.map((t) => ({ date: t.period, netSales: t.netSales, grossProfit: t.grossProfit, invoices: t.invoices })),
    topProducts: top.map((p) => ({
      name: p.name,
      quantity: Math.round((p.quantity - p.returnedQuantity) * 1000) / 1000,
      netSales: p.netSales,
    })),
    categorySales: cats.slice(0, 6).map((c) => ({ name: c.name, netSales: c.netSales })),
    paymentMix: [...mixMap.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
    recentInvoices: recent.data,
    lowStock,
    openShift: shiftRow ? await computeShift(ctx, shiftRow) : null,
  };
  return c.json(data);
});

// ---------------------------------------------------------------- sales

app.get("/sales-summary", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const range = reportRange(ctx, q);
  return c.json(await salesSummary(ctx, { ...range, locationId: q.locationId || undefined }, (q.groupBy ?? "day") as GroupBy));
});

app.get("/products", view, vQuery(productQuery), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const range = reportRange(ctx, q);
  return c.json(
    await productSales(ctx, {
      ...range,
      locationId: q.locationId || undefined,
      categoryId: q.categoryId || undefined,
      limit: q.limit ?? 100,
    }),
  );
});

app.get("/categories", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  return c.json(await categorySales(ctx, { ...reportRange(ctx, q), locationId: q.locationId || undefined }));
});

// ---------------------------------------------------------------- financial statements

app.get("/profit-loss", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  return c.json(await profitLoss(ctx, { ...reportRange(ctx, q), locationId: q.locationId || undefined }));
});

app.get("/balance-sheet", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  return c.json(await balanceSheet(ctx, q.asOf ?? q.to ?? ctx.today));
});

app.get("/trial-balance", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  return c.json(await trialBalance(ctx, q.asOf ?? q.to ?? ctx.today));
});

app.get("/cash-flow", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  return c.json(await cashFlow(ctx, reportRange(ctx, c.req.valid("query"))));
});

app.get("/cash-forecast", view, async (c) => c.json(await cashForecast(c.get("ctx"), c.env)));

app.get("/sales-review", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  return c.json(await salesReview(ctx, c.env, reportRange(ctx, c.req.valid("query"))));
});

app.get("/tax", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  return c.json(await taxReport(ctx, { ...reportRange(ctx, q), locationId: q.locationId || undefined }));
});

// ---------------------------------------------------------------- inventory, aging, expenses

app.get("/inventory-valuation", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  return c.json(await inventoryValuation(ctx, c.req.valid("query").locationId || undefined));
});

const stockHealthQuery = z.object({
  locationId: z.string().optional(),
  days: z.coerce.number().int().min(1).max(730).default(30),
});

app.get("/expiry", view, vQuery(stockHealthQuery), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  return c.json(await expiryReport(ctx, { locationId: q.locationId || undefined, days: q.days }));
});

app.get("/dead-stock", view, vQuery(stockHealthQuery), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  return c.json(await deadStockReport(ctx, { locationId: q.locationId || undefined, days: q.days }));
});

app.get("/receivables-aging", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  return c.json(await receivablesAging(ctx, q.asOf ?? q.to ?? ctx.today));
});

app.get("/payables-aging", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  return c.json(await payablesAging(ctx, q.asOf ?? q.to ?? ctx.today));
});

app.get("/expenses", view, vQuery(reportQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const range = reportRange(ctx, q);
  return c.json(await expenseReport(ctx, { ...range, locationId: q.locationId || undefined }, (q.groupBy ?? "day") as GroupBy));
});

export default app;
