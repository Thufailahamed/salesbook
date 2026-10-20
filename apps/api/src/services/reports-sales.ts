import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import {
  TENDER_LABELS,
  type CategorySalesRow,
  type ProductSalesRow,
  type SalesSummaryReport,
  type Tender,
} from "@shopbooks/shared";
import {
  categories,
  invoiceLines,
  invoices,
  locations,
  paymentMethods,
  payments,
  saleReturnLines,
  saleReturns,
  users,
} from "../db/schema";
import type { Ctx } from "../lib/context";
import { enumeratePeriods, hourInTz, num, pct, periodSql, type GroupBy } from "./reports-utils";

export interface SalesFilter {
  from: string;
  to: string;
  locationId?: string;
}

const SALE_SOURCES = ["sale", "invoice_payment", "customer_payment"];

export function invoiceConds(ctx: Ctx, f: SalesFilter): SQL[] {
  const conds: SQL[] = [
    eq(invoices.businessId, ctx.businessId),
    eq(invoices.kind, "sale"),
    eq(invoices.status, "completed"),
    gte(invoices.date, f.from),
    lte(invoices.date, f.to),
  ];
  if (f.locationId) conds.push(eq(invoices.locationId, f.locationId));
  return conds;
}

export function returnConds(ctx: Ctx, f: SalesFilter): SQL[] {
  const conds: SQL[] = [eq(saleReturns.businessId, ctx.businessId), gte(saleReturns.date, f.from), lte(saleReturns.date, f.to)];
  if (f.locationId) conds.push(eq(saleReturns.locationId, f.locationId));
  return conds;
}

export interface SalesTotals {
  invoices: number;
  items: number;
  net: number;
  total: number;
  tax: number;
  discount: number;
  cost: number;
  returnsNet: number;
  returnsTax: number;
  returnsTotal: number;
  returnsCost: number;
  returnsCount: number;
  /** net − returnsNet */
  netSales: number;
  /** netSales − (cost − returnsCost) */
  grossProfit: number;
}

export async function salesTotals(ctx: Ctx, f: SalesFilter): Promise<SalesTotals> {
  const [[inv], [ret]] = await Promise.all([
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        items: sql<number>`coalesce(sum(${invoices.itemCount}), 0)`,
        net: sql<number>`coalesce(sum(${invoices.netTotal}), 0)`,
        total: sql<number>`coalesce(sum(${invoices.total}), 0)`,
        tax: sql<number>`coalesce(sum(${invoices.taxTotal}), 0)`,
        discount: sql<number>`coalesce(sum(${invoices.discountTotal}), 0)`,
        cost: sql<number>`coalesce(sum(${invoices.costTotal}), 0)`,
      })
      .from(invoices)
      .where(and(...invoiceConds(ctx, f))),
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        net: sql<number>`coalesce(sum(${saleReturns.netTotal}), 0)`,
        tax: sql<number>`coalesce(sum(${saleReturns.taxTotal}), 0)`,
        total: sql<number>`coalesce(sum(${saleReturns.total}), 0)`,
        cost: sql<number>`coalesce(sum(${saleReturns.costTotal}), 0)`,
      })
      .from(saleReturns)
      .where(and(...returnConds(ctx, f))),
  ]);
  const t = {
    invoices: num(inv?.n),
    items: num(inv?.items),
    net: num(inv?.net),
    total: num(inv?.total),
    tax: num(inv?.tax),
    discount: num(inv?.discount),
    cost: num(inv?.cost),
    returnsNet: num(ret?.net),
    returnsTax: num(ret?.tax),
    returnsTotal: num(ret?.total),
    returnsCost: num(ret?.cost),
    returnsCount: num(ret?.n),
  };
  const netSales = t.net - t.returnsNet;
  return { ...t, netSales, grossProfit: netSales - (t.cost - t.returnsCost) };
}

/** Money collected for sales (method tenders) minus money refunded, optional location. */
export async function collections(ctx: Ctx, f: SalesFilter) {
  const conds: SQL[] = [
    eq(payments.businessId, ctx.businessId),
    eq(payments.status, "completed"),
    eq(payments.tender, "method"),
    gte(payments.date, f.from),
    lte(payments.date, f.to),
  ];
  if (f.locationId) conds.push(eq(payments.locationId, f.locationId));
  const [row] = await ctx.db
    .select({
      inflow: sql<number>`coalesce(sum(case when ${payments.direction} = 'in' and ${payments.source} in ('sale','invoice_payment','customer_payment') then ${payments.amount} else 0 end), 0)`,
      outflow: sql<number>`coalesce(sum(case when ${payments.direction} = 'out' and ${payments.source} in ('sale_refund','store_credit_refund') then ${payments.amount} else 0 end), 0)`,
    })
    .from(payments)
    .where(and(...conds));
  return num(row?.inflow) - num(row?.outflow);
}

export async function paymentMix(ctx: Ctx, f: SalesFilter) {
  const conds: SQL[] = [
    eq(payments.businessId, ctx.businessId),
    eq(payments.status, "completed"),
    eq(payments.direction, "in"),
    inArray(payments.source, SALE_SOURCES),
    gte(payments.date, f.from),
    lte(payments.date, f.to),
  ];
  if (f.locationId) conds.push(eq(payments.locationId, f.locationId));
  const rows = await ctx.db
    .select({
      tender: payments.tender,
      methodName: paymentMethods.name,
      amount: sql<number>`coalesce(sum(${payments.amount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(payments)
    .leftJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
    .where(and(...conds))
    .groupBy(payments.tender, paymentMethods.name)
    .orderBy(desc(sql`sum(${payments.amount})`));
  return rows.map((r) => ({
    name: r.tender === "method" ? (r.methodName ?? "Other") : (TENDER_LABELS[r.tender as Tender] ?? r.tender),
    tender: r.tender,
    amount: num(r.amount),
    count: num(r.count),
  }));
}

export async function salesSeries(ctx: Ctx, f: SalesFilter, groupBy: GroupBy) {
  const invPeriod = periodSql(invoices.date, groupBy);
  const retPeriod = periodSql(saleReturns.date, groupBy);
  const [inv, ret] = await Promise.all([
    ctx.db
      .select({
        period: invPeriod,
        n: sql<number>`count(*)`,
        net: sql<number>`coalesce(sum(${invoices.netTotal}), 0)`,
        cost: sql<number>`coalesce(sum(${invoices.costTotal}), 0)`,
        tax: sql<number>`coalesce(sum(${invoices.taxTotal}), 0)`,
      })
      .from(invoices)
      .where(and(...invoiceConds(ctx, f)))
      .groupBy(invPeriod),
    ctx.db
      .select({
        period: retPeriod,
        net: sql<number>`coalesce(sum(${saleReturns.netTotal}), 0)`,
        cost: sql<number>`coalesce(sum(${saleReturns.costTotal}), 0)`,
        tax: sql<number>`coalesce(sum(${saleReturns.taxTotal}), 0)`,
      })
      .from(saleReturns)
      .where(and(...returnConds(ctx, f)))
      .groupBy(retPeriod),
  ]);
  const invMap = new Map(inv.map((r) => [r.period, r]));
  const retMap = new Map(ret.map((r) => [r.period, r]));
  const periods = new Set(enumeratePeriods(f.from, f.to, groupBy));
  for (const k of invMap.keys()) periods.add(k);
  for (const k of retMap.keys()) periods.add(k);
  return [...periods].sort().map((period) => {
    const i = invMap.get(period);
    const r = retMap.get(period);
    const netSales = num(i?.net) - num(r?.net);
    return {
      period,
      invoices: num(i?.n),
      netSales,
      returns: num(r?.net),
      grossProfit: netSales - (num(i?.cost) - num(r?.cost)),
      tax: num(i?.tax) - num(r?.tax),
    };
  });
}

export async function salesSummary(ctx: Ctx, f: SalesFilter, groupBy: GroupBy): Promise<SalesSummaryReport> {
  const [t, collected, series, mix, staff, staffReturns, locs, locReturns, hourly] = await Promise.all([
    salesTotals(ctx, f),
    collections(ctx, f),
    salesSeries(ctx, f, groupBy),
    paymentMix(ctx, f),
    ctx.db
      .select({
        userId: invoices.salespersonId,
        name: users.name,
        n: sql<number>`count(*)`,
        net: sql<number>`coalesce(sum(${invoices.netTotal}), 0)`,
      })
      .from(invoices)
      .leftJoin(users, eq(users.id, invoices.salespersonId))
      .where(and(...invoiceConds(ctx, f)))
      .groupBy(invoices.salespersonId, users.name),
    ctx.db
      .select({ userId: invoices.salespersonId, net: sql<number>`coalesce(sum(${saleReturns.netTotal}), 0)` })
      .from(saleReturns)
      .innerJoin(invoices, eq(invoices.id, saleReturns.invoiceId))
      .where(and(...returnConds(ctx, f)))
      .groupBy(invoices.salespersonId),
    ctx.db
      .select({
        locationId: invoices.locationId,
        name: locations.name,
        n: sql<number>`count(*)`,
        net: sql<number>`coalesce(sum(${invoices.netTotal}), 0)`,
      })
      .from(invoices)
      .leftJoin(locations, eq(locations.id, invoices.locationId))
      .where(and(...invoiceConds(ctx, f)))
      .groupBy(invoices.locationId, locations.name),
    ctx.db
      .select({ locationId: saleReturns.locationId, net: sql<number>`coalesce(sum(${saleReturns.netTotal}), 0)` })
      .from(saleReturns)
      .where(and(...returnConds(ctx, f)))
      .groupBy(saleReturns.locationId),
    ctx.db
      .select({ createdAt: invoices.createdAt, net: invoices.netTotal })
      .from(invoices)
      .where(and(...invoiceConds(ctx, f)))
      .limit(50_000),
  ]);

  const staffRet = new Map(staffReturns.map((r) => [r.userId ?? "", num(r.net)]));
  const locRet = new Map(locReturns.map((r) => [r.locationId, num(r.net)]));
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, invoices: 0, netSales: 0 }));
  for (const r of hourly) {
    const h = byHour[hourInTz(r.createdAt, ctx.business.timezone)]!;
    h.invoices += 1;
    h.netSales += r.net;
  }

  return {
    from: f.from,
    to: f.to,
    totals: {
      invoices: t.invoices,
      itemsSold: t.items,
      grossSales: t.net + t.discount,
      discounts: t.discount,
      returns: t.returnsNet,
      netSales: t.netSales,
      tax: t.tax - t.returnsTax,
      collected,
      cost: t.cost - t.returnsCost,
      grossProfit: t.grossProfit,
      margin: pct(t.grossProfit, t.netSales),
      avgBasket: t.invoices ? Math.round(t.total / t.invoices) : 0,
    },
    series,
    byPaymentMethod: mix,
    byStaff: staff
      .map((s) => ({
        userId: s.userId,
        name: s.name ?? "Unassigned",
        invoices: num(s.n),
        netSales: num(s.net) - (staffRet.get(s.userId ?? "") ?? 0),
      }))
      .sort((a, b) => b.netSales - a.netSales),
    byLocation: locs
      .map((l) => ({
        locationId: l.locationId,
        name: l.name ?? "Unknown",
        invoices: num(l.n),
        netSales: num(l.net) - (locRet.get(l.locationId) ?? 0),
      }))
      .sort((a, b) => b.netSales - a.netSales),
    byHour,
  };
}

// ---------------------------------------------------------------- product & category sales

export async function productSales(
  ctx: Ctx,
  f: SalesFilter & { categoryId?: string; limit?: number },
): Promise<ProductSalesRow[]> {
  const lineConds: SQL[] = [...invoiceConds(ctx, f)];
  const retConds: SQL[] = [...returnConds(ctx, f)];
  if (f.categoryId) {
    lineConds.push(eq(invoiceLines.categoryId, f.categoryId));
    retConds.push(eq(saleReturnLines.categoryId, f.categoryId));
  }
  const key = sql<string>`coalesce(${invoiceLines.variantId}, 'custom:' || ${invoiceLines.name})`;
  const retKey = sql<string>`coalesce(${saleReturnLines.variantId}, 'custom:' || ${saleReturnLines.name})`;
  const [sold, returned] = await Promise.all([
    ctx.db
      .select({
        key,
        variantId: invoiceLines.variantId,
        productId: sql<string | null>`max(${invoiceLines.productId})`,
        name: sql<string>`max(${invoiceLines.name})`,
        sku: sql<string | null>`max(${invoiceLines.sku})`,
        categoryName: sql<string | null>`max(${categories.name})`,
        qty: sql<number>`coalesce(sum(${invoiceLines.quantity}), 0)`,
        net: sql<number>`coalesce(sum(${invoiceLines.net}), 0)`,
        cost: sql<number>`coalesce(sum(${invoiceLines.costAmount}), 0)`,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .leftJoin(categories, eq(categories.id, invoiceLines.categoryId))
      .where(and(...lineConds))
      .groupBy(key, invoiceLines.variantId),
    ctx.db
      .select({
        key: retKey,
        variantId: saleReturnLines.variantId,
        productId: sql<string | null>`max(${saleReturnLines.productId})`,
        name: sql<string>`max(${saleReturnLines.name})`,
        sku: sql<string | null>`max(${saleReturnLines.sku})`,
        categoryName: sql<string | null>`max(${categories.name})`,
        qty: sql<number>`coalesce(sum(${saleReturnLines.quantity}), 0)`,
        net: sql<number>`coalesce(sum(${saleReturnLines.net}), 0)`,
        cost: sql<number>`coalesce(sum(${saleReturnLines.costAmount}), 0)`,
      })
      .from(saleReturnLines)
      .innerJoin(saleReturns, eq(saleReturns.id, saleReturnLines.returnId))
      .leftJoin(categories, eq(categories.id, saleReturnLines.categoryId))
      .where(and(...retConds))
      .groupBy(retKey, saleReturnLines.variantId),
  ]);

  const map = new Map<string, ProductSalesRow & { grossCost: number }>();
  for (const s of sold) {
    map.set(s.key, {
      variantId: s.variantId,
      productId: s.productId,
      name: s.name,
      sku: s.sku,
      categoryName: s.categoryName,
      quantity: num(s.qty),
      returnedQuantity: 0,
      netSales: num(s.net),
      cost: num(s.cost),
      grossCost: num(s.cost),
      profit: 0,
      margin: 0,
    });
  }
  for (const r of returned) {
    let row = map.get(r.key);
    if (!row) {
      row = {
        variantId: r.variantId,
        productId: r.productId,
        name: r.name,
        sku: r.sku,
        categoryName: r.categoryName,
        quantity: 0,
        returnedQuantity: 0,
        netSales: 0,
        cost: 0,
        grossCost: 0,
        profit: 0,
        margin: 0,
      };
      map.set(r.key, row);
    }
    row.returnedQuantity += num(r.qty);
    row.netSales -= num(r.net);
    row.cost -= num(r.cost);
  }
  const rows = [...map.values()].map(({ grossCost: _g, ...r }) => {
    const profit = r.netSales - r.cost;
    return { ...r, quantity: Math.round(r.quantity * 1000) / 1000, profit, margin: pct(profit, r.netSales) };
  });
  rows.sort((a, b) => b.netSales - a.netSales);
  return rows.slice(0, f.limit ?? 100);
}

export async function categorySales(ctx: Ctx, f: SalesFilter): Promise<CategorySalesRow[]> {
  const [sold, returned] = await Promise.all([
    ctx.db
      .select({
        categoryId: invoiceLines.categoryId,
        name: categories.name,
        qty: sql<number>`coalesce(sum(${invoiceLines.quantity}), 0)`,
        net: sql<number>`coalesce(sum(${invoiceLines.net}), 0)`,
        cost: sql<number>`coalesce(sum(${invoiceLines.costAmount}), 0)`,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .leftJoin(categories, eq(categories.id, invoiceLines.categoryId))
      .where(and(...invoiceConds(ctx, f)))
      .groupBy(invoiceLines.categoryId, categories.name),
    ctx.db
      .select({
        categoryId: saleReturnLines.categoryId,
        name: categories.name,
        qty: sql<number>`coalesce(sum(${saleReturnLines.quantity}), 0)`,
        net: sql<number>`coalesce(sum(${saleReturnLines.net}), 0)`,
        cost: sql<number>`coalesce(sum(${saleReturnLines.costAmount}), 0)`,
      })
      .from(saleReturnLines)
      .innerJoin(saleReturns, eq(saleReturns.id, saleReturnLines.returnId))
      .leftJoin(categories, eq(categories.id, saleReturnLines.categoryId))
      .where(and(...returnConds(ctx, f)))
      .groupBy(saleReturnLines.categoryId, categories.name),
  ]);
  const map = new Map<string, CategorySalesRow & { cost: number }>();
  const keyOf = (id: string | null) => id ?? "__none__";
  for (const s of sold) {
    map.set(keyOf(s.categoryId), {
      categoryId: s.categoryId,
      name: s.name ?? "Uncategorized",
      quantity: num(s.qty),
      netSales: num(s.net),
      profit: 0,
      cost: num(s.cost),
    });
  }
  for (const r of returned) {
    const k = keyOf(r.categoryId);
    const row = map.get(k) ?? { categoryId: r.categoryId, name: r.name ?? "Uncategorized", quantity: 0, netSales: 0, profit: 0, cost: 0 };
    row.quantity -= num(r.qty);
    row.netSales -= num(r.net);
    row.cost -= num(r.cost);
    map.set(k, row);
  }
  return [...map.values()]
    .map(({ cost, ...r }) => ({ ...r, quantity: Math.round(r.quantity * 1000) / 1000, profit: r.netSales - cost }))
    .sort((a, b) => b.netSales - a.netSales);
}
