"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  HandCoins,
  PackagePlus,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Vault,
  Wallet,
  WalletCards,
} from "lucide-react";
import type { DashboardData } from "@shopbooks/shared";
import { PageHeader, usePageTitle } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { DailyAlerts } from "@/components/daily-alerts";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/loading";
import { Money } from "@/components/money";
import { PaymentStatusBadge } from "@/components/status-badge";
import { LocationSelect } from "@/components/entity-selects";
import { TrendAreaChart } from "@/components/charts/area-chart";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { cn, formatDate, formatNumber, formatQty, formatTime, percentChange } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, can } = useSession();
  const money = useMoney();
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const allowed = can("dashboard.view");

  React.useEffect(() => {
    if (!allowed) router.replace(can("pos.sell") ? "/pos" : "/sales");
  }, [allowed, can, router]);

  usePageTitle("Dashboard");
  const { data, isLoading, error, refetch } = useApiQuery<DashboardData>(allowed ? "/reports/dashboard" : null, { locationId });

  if (!allowed) return null;

  const d = data;
  const firstName = user.name.split(" ")[0];
  const todayDelta = d ? percentChange(d.today.netSales, d.yesterday.netSales) : null;
  const monthDelta = d ? percentChange(d.month.netSales, d.lastMonth.netSales) : null;
  const trend = d?.salesTrend ?? [];
  const hasSales = trend.some((t) => t.netSales !== 0) || (d?.recentInvoices.length ?? 0) > 0;
  const salesDays = trend.filter((t) => t.netSales !== 0).length;

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        title={
          <>
            {greeting()}, <span className="text-muted-foreground/70">{firstName}</span>
          </>
        }
        description="Here is how the books stand today."
        actions={
          <>
            <LocationSelect value={locationId} onChange={setLocationId} allowAll className="w-48" />
            {can("pos.sell") && (
              <Button asChild>
                <Link href="/pos">
                  <ShoppingCart /> New sale
                </Link>
              </Button>
            )}
          </>
        }
      />

      {error && !d ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-6">
          <DailyAlerts />
          {d?.openShift && (
            <Link
              href={`/registers/view?id=${d.openShift.id}`}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-card px-5 py-3.5 text-sm shadow-card transition-shadow hover:shadow-raised dark:shadow-[inset_0_0_0_1px_var(--border)]"
            >
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
                <span className="relative inline-flex size-2.5 rounded-full bg-success" />
              </span>
              <span className="font-medium text-foreground">Register shift {d.openShift.number} is open</span>
              <span className="text-muted-foreground">
                since {formatTime(d.openShift.openedAt)} · expected cash <Money value={d.openShift.expectedCash} />
              </span>
              <ArrowRight className="ml-auto size-4 text-muted-foreground" />
            </Link>
          )}

          {/* today + this month */}
          <div className="grid gap-4 xl:grid-cols-3">
            <TodayPanel d={d} loading={isLoading} delta={todayDelta} trend={trend} />
            <MonthLedger d={d} loading={isLoading} delta={monthDelta} />
          </div>

          {/* financial position */}
          <PositionStrip d={d} loading={isLoading} />

          {/* charts row */}
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard
              className="xl:col-span-2"
              title="Sales & profit"
              description="Last 30 days, net of returns"
              action={
                <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-chart-1" /> Net sales
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-chart-2" /> Gross profit
                  </span>
                </div>
              }
            >
              {isLoading ? (
                <Skeleton className="h-[280px] w-full rounded-lg" />
              ) : hasSales && salesDays < 5 ? (
                <SimpleBarChart
                  data={trend}
                  xKey="date"
                  height={280}
                  series={[
                    { key: "netSales", name: "Net sales" },
                    { key: "grossProfit", name: "Gross profit", color: "var(--chart-2)" },
                  ]}
                  xFormatter={(v) => formatDate(v, { month: "short", day: "numeric" })}
                  yFormatter={(v) => money.formatCompact(v)}
                  valueFormatter={(v) => money.format(v)}
                />
              ) : hasSales ? (
                <TrendAreaChart
                  data={trend}
                  xKey="date"
                  height={280}
                  series={[
                    { key: "netSales", name: "Net sales" },
                    { key: "grossProfit", name: "Gross profit", color: "var(--chart-2)" },
                  ]}
                  xFormatter={(v) => formatDate(v, { month: "short", day: "numeric" })}
                  yFormatter={(v) => money.formatCompact(v)}
                  valueFormatter={(v) => money.format(v)}
                  tooltipLabelFormatter={(v) => formatDate(String(v), { weekday: "short", month: "short", day: "numeric" })}
                />
              ) : (
                <EmptyState
                  compact
                  icon={TrendingUp}
                  title="No sales yet"
                  description="Your sales trend appears here as soon as you ring up the first sale."
                  action={
                    can("pos.sell") ? (
                      <Button asChild size="sm">
                        <Link href="/pos">Open the POS</Link>
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </SectionCard>

            <SectionCard title="Payment mix" description="This month">
              {isLoading ? (
                <Skeleton className="mx-auto size-44 rounded-full" />
              ) : d && d.paymentMix.length > 0 ? (
                <DonutChart
                  data={d.paymentMix.map((p) => ({ name: p.name, value: p.amount }))}
                  valueFormatter={(v) => money.format(v)}
                  centerValue={money.formatCompact(d.paymentMix.reduce((s, p) => s + p.amount, 0))}
                  centerLabel="collected"
                  height={180}
                />
              ) : (
                <EmptyState compact icon={Wallet} title="No payments yet" description="Collected payments by method show up here." />
              )}
            </SectionCard>
          </div>

          {/* lists row */}
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard title="Top products" description="This month by net sales" flush>
              {isLoading ? (
                <ListSkeleton />
              ) : d && d.topProducts.length > 0 ? (
                <ul className="divide-y divide-border/70">
                  {d.topProducts.slice(0, 6).map((p, i) => {
                    const max = d.topProducts[0]!.netSales || 1;
                    return (
                      <li key={p.name + i} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="num w-5 shrink-0 font-mono text-[11px] text-muted-foreground">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="truncate font-medium">{p.name}</span>
                          </span>
                          <Money value={p.netSales} className="font-semibold" />
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.max(4, (p.netSales / max) * 100)}%` }} />
                          </div>
                          <span className="num w-16 text-right text-xs text-muted-foreground">{formatQty(p.quantity)} sold</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState compact title="No product sales yet" />
              )}
            </SectionCard>

            <SectionCard title="Sales by category" description="This month">
              {isLoading ? (
                <Skeleton className="h-[240px] w-full rounded-lg" />
              ) : d && d.categorySales.length > 0 ? (
                <SimpleBarChart
                  data={d.categorySales.slice(0, 7)}
                  xKey="name"
                  layout="vertical"
                  series={[{ key: "netSales", name: "Net sales" }]}
                  colorful
                  height={Math.max(160, Math.min(7, d.categorySales.length) * 38)}
                  yFormatter={(v) => money.formatCompact(v)}
                  valueFormatter={(v) => money.format(v)}
                  xFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                />
              ) : (
                <EmptyState compact title="No category data" description="Assign categories to products to see this breakdown." />
              )}
            </SectionCard>

            <SectionCard
              title="Low stock"
              description="Items at or below reorder level"
              flush
              action={
                <Button variant="ghost" size="xs" asChild>
                  <Link href="/inventory?stock=low">
                    View all <ArrowRight />
                  </Link>
                </Button>
              }
            >
              {isLoading ? (
                <ListSkeleton />
              ) : d && d.lowStock.length > 0 ? (
                <ul className="divide-y divide-border/70">
                  {d.lowStock.slice(0, 6).map((s) => (
                    <li key={s.variantId + (s.locationId ?? "")} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.productName}
                          {s.variantName && <span className="font-normal text-muted-foreground"> · {s.variantName}</span>}
                        </p>
                        <p className="truncate font-mono text-[11.5px] text-muted-foreground">{s.sku ?? "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("num text-sm font-semibold", s.quantity <= 0 ? "text-destructive" : "text-warning-soft-foreground")}>
                          {formatQty(s.quantity)}
                        </p>
                        <p className="num text-[11px] text-muted-foreground">reorder at {formatQty(s.reorderLevel ?? 0)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={Boxes} title="Stock looks healthy" description="Nothing is below its reorder level." />
              )}
            </SectionCard>
          </div>

          {/* recent invoices + quick actions */}
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard
              className="xl:col-span-2"
              title="Recent invoices"
              flush
              action={
                <Button variant="ghost" size="xs" asChild>
                  <Link href="/sales">
                    All invoices <ArrowRight />
                  </Link>
                </Button>
              }
            >
              {isLoading ? (
                <ListSkeleton rows={5} />
              ) : d && d.recentInvoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/35 hover:bg-muted/35">
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="hidden md:table-cell">Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead align="right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.recentInvoices.slice(0, 8).map((inv) => (
                      <TableRow key={inv.id} className="cursor-pointer" onClick={() => router.push(`/sales/view?id=${inv.id}`)}>
                        <TableCell className="font-mono text-[12.5px] font-medium">{inv.number}</TableCell>
                        <TableCell className="max-w-48 truncate">{inv.customerName ?? <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatDate(inv.date, { month: "short", day: "numeric" })} · {formatTime(inv.createdAt)}
                        </TableCell>
                        <TableCell>
                          {inv.status === "void" ? (
                            <span className="text-xs text-muted-foreground">Void</span>
                          ) : (
                            <PaymentStatusBadge status={inv.paymentStatus} />
                          )}
                        </TableCell>
                        <TableCell numeric className="font-semibold">
                          <Money value={inv.total} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState compact icon={Receipt} title="No invoices yet" description="Completed sales will appear here." />
              )}
            </SectionCard>

            <SectionCard title="Quick actions">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "New sale", href: "/pos", icon: ShoppingCart, perm: "pos.sell" as const },
                  { label: "Receive payment", href: "/customers?balance=due", icon: HandCoins, perm: "customers.payments" as const },
                  { label: "New purchase", href: "/purchases/new", icon: ShoppingBag, perm: "purchases.manage" as const },
                  { label: "Add product", href: "/products/new", icon: PackagePlus, perm: "products.manage" as const },
                  { label: "Add expense", href: "/expenses?new=1", icon: Wallet, perm: "expenses.manage" as const },
                  { label: "Cash register", href: "/registers", icon: Vault, perm: "registers.use" as const },
                ]
                  .filter((a) => can(a.perm))
                  .map((a) => (
                    <Link
                      key={a.label}
                      href={a.href}
                      className="group flex flex-col gap-3 rounded-xl bg-muted/60 p-3.5 transition-colors hover:bg-muted"
                    >
                      <span className="flex items-center justify-between">
                        <span className="flex size-8 items-center justify-center rounded-full bg-card text-foreground shadow-xs transition-colors group-hover:bg-ink group-hover:text-ink-foreground">
                          <a.icon className="size-[15px]" strokeWidth={1.9} />
                        </span>
                        <ArrowRight className="size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                      </span>
                      <span className="text-[13px] font-medium">{a.label}</span>
                    </Link>
                  ))}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </>
  );
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border/70">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- headline pieces

function DeltaChip({ value, label, onDark }: { value: number | null; label: string; onDark?: boolean }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
        onDark
          ? up
            ? "bg-[oklch(0.82_0.09_84/0.16)] text-[oklch(0.88_0.08_86)]"
            : "bg-[oklch(0.66_0.18_25/0.2)] text-[oklch(0.82_0.1_25)]"
          : up
            ? "bg-success-soft text-success-soft-foreground"
            : "bg-destructive-soft text-destructive-soft-foreground",
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(value).toFixed(1)}%
      <span className={cn("font-normal", onDark ? "text-white/45" : "text-muted-foreground")}>{label}</span>
    </span>
  );
}

/** The headline: today's takings on the black card, with the last 14 days as bars. */
function TodayPanel({
  d,
  loading,
  delta,
  trend,
}: {
  d: DashboardData | undefined;
  loading: boolean;
  delta: number | null;
  trend: DashboardData["salesTrend"];
}) {
  const money = useMoney();
  const days = trend.slice(-14);
  const max = Math.max(1, ...days.map((t) => t.netSales));
  const margin = d && d.today.netSales ? Math.round((d.today.grossProfit / d.today.netSales) * 100) : 0;
  const stats = d
    ? [
        { label: "Invoices", value: formatNumber(d.today.invoices) },
        { label: "Avg basket", value: money.format(d.today.avgBasket) },
        { label: "Gross profit", value: money.format(d.today.grossProfit), sub: d.today.netSales ? `${margin}%` : undefined },
        { label: "Collected", value: money.format(d.today.collected) },
      ]
    : [];

  return (
    <Link href="/sales" className="metal group relative block overflow-hidden rounded-[22px] p-6 sm:p-7 xl:col-span-2">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_90%_0%,oklch(0.82_0.09_84/0.12),transparent)]" />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10.5px] font-semibold tracking-[0.18em] text-white/45 uppercase [font-stretch:115%]">Today&apos;s sales</p>
            <ArrowUpRight className="size-4 text-white/30 transition-colors group-hover:text-[oklch(0.86_0.08_86)]" />
          </div>
          {loading || !d ? (
            <Skeleton className="mt-4 h-12 w-56 bg-white/10" />
          ) : (
            <p className="figure text-gold mt-3 text-[44px] leading-none sm:text-[52px]">{money.format(d.today.netSales)}</p>
          )}
          <div className="mt-3 flex min-h-6 flex-wrap items-center gap-2">
            {d && <DeltaChip value={delta} label="vs yesterday" onDark />}
            {d && delta === null && <span className="text-[12px] text-white/45">Yesterday {money.format(d.yesterday.netSales)}</span>}
          </div>
          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-5 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
            {loading || !d
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 bg-white/10" />)
              : stats.map((s) => (
                  <div key={s.label} className="min-w-0">
                    <dt className="text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">{s.label}</dt>
                    <dd className="num mt-1 truncate text-[15px] font-semibold text-white/90">
                      {s.value}
                      {s.sub && <span className="ml-1.5 text-[11.5px] font-medium text-[oklch(0.84_0.09_84)]">{s.sub}</span>}
                    </dd>
                  </div>
                ))}
          </dl>
        </div>

        {/* last 14 days */}
        <div aria-hidden="true">
          <div className="flex h-36 items-end gap-1.5 sm:h-44">
            {(days.length ? days : Array.from({ length: 14 }, () => null)).map((t, i, arr) => {
              const last = i === arr.length - 1;
              const h = t ? Math.max(t.netSales > 0 ? 6 : 2, (t.netSales / max) * 100) : 2;
              return (
                <div key={t?.date ?? i} className="group/bar relative flex h-full flex-1 flex-col justify-end">
                  {t && t.netSales > 0 && (
                    <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full rounded-md bg-black/80 px-2 py-1 text-[10.5px] whitespace-nowrap text-white group-hover/bar:block">
                      {formatDate(t.date, { month: "short", day: "numeric" })} · {money.format(t.netSales)}
                    </span>
                  )}
                  <span
                    className={cn(
                      "w-full rounded-t-[5px] transition-colors",
                      last
                        ? "bg-gradient-to-t from-[oklch(0.82_0.09_84/0.35)] to-[oklch(0.88_0.08_86)]"
                        : t && t.netSales > 0
                          ? "bg-white/[0.16] group-hover/bar:bg-white/30"
                          : "bg-white/[0.06]",
                    )}
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] tracking-[0.12em] text-white/35 uppercase">
            <span>{days[0] ? formatDate(days[0].date, { month: "short", day: "numeric" }) : "14 days ago"}</span>
            <span className="text-[oklch(0.84_0.09_84)]">Today</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** This month as a tiny P&L: sales → cost of goods → gross profit → expenses → net profit. */
function MonthLedger({ d, loading, delta }: { d: DashboardData | undefined; loading: boolean; delta: number | null }) {
  const money = useMoney();
  const m = d?.month;
  const base = Math.max(1, m?.netSales ?? 0);
  const cogs = m ? m.netSales - m.grossProfit : 0;
  const rows = m
    ? [
        { label: "Net sales", value: m.netSales, bar: m.netSales, tone: "bg-foreground/25" },
        { label: "Cost of goods", value: -cogs, bar: cogs, tone: "bg-foreground/12" },
        { label: "Gross profit", value: m.grossProfit, bar: m.grossProfit, tone: "bg-primary/60", strong: true },
        { label: "Expenses", value: -m.expenses, bar: m.expenses, tone: "bg-foreground/12" },
      ]
    : [];

  return (
    <Link
      href="/reports/profit-loss"
      className="group flex flex-col rounded-[22px] bg-card p-6 shadow-[var(--shadow-card)] ring-1 ring-border transition-shadow hover:shadow-[var(--shadow-raised)] sm:p-7"
    >
      <div className="flex items-center justify-between">
        <p className="eyebrow">This month</p>
        <ArrowUpRight className="size-4 text-muted-foreground/50 transition-colors group-hover:text-primary" />
      </div>
      {loading || !m ? (
        <Skeleton className="mt-3 h-9 w-40" />
      ) : (
        <p className="figure mt-2 text-[32px] leading-none">{money.format(m.netSales)}</p>
      )}
      <div className="mt-2.5 min-h-6">{d && (delta === null ? <span className="text-[12px] text-muted-foreground">net sales so far</span> : <DeltaChip value={delta} label="vs last month" />)}</div>

      <dl className="mt-5 grid gap-3">
        {loading || !m
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7" />)
          : rows.map((r) => (
              <div key={r.label}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <dt className={cn(r.strong ? "font-medium" : "text-muted-foreground")}>{r.label}</dt>
                  <dd className={cn("num", r.strong && "font-semibold")}>{money.format(r.value)}</dd>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", r.tone)} style={{ width: `${Math.min(100, Math.max(0, (r.bar / base) * 100))}%` }} />
                </div>
              </div>
            ))}
      </dl>

      <div className="mt-auto flex items-end justify-between border-t-[3px] border-double border-border-strong pt-4">
        <span className="text-[12px] font-semibold tracking-[0.14em] text-muted-foreground uppercase [font-stretch:115%]">Net profit</span>
        {loading || !m ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <span className={cn("figure text-[26px] leading-none", m.netProfit < 0 ? "text-destructive" : "text-success-soft-foreground")}>
            {money.format(m.netProfit)}
          </span>
        )}
      </div>
    </Link>
  );
}

/** Where the money sits right now: one strip, five figures. */
function PositionStrip({ d, loading }: { d: DashboardData | undefined; loading: boolean }) {
  const money = useMoney();
  const items = [
    { label: "Cash on hand", value: d ? money.format(d.cashBalance) : null, href: "/accounting", icon: Banknote },
    { label: "Receivables", value: d ? money.format(d.receivables) : null, href: "/reports/receivables", icon: HandCoins, sub: "owed to you" },
    { label: "Payables", value: d ? money.format(d.payables) : null, href: "/reports/payables", icon: WalletCards, sub: "you owe" },
    { label: "Inventory", value: d ? money.format(d.inventoryValue) : null, href: "/reports/inventory", icon: Boxes, sub: "at cost" },
  ];
  const low = d?.lowStockCount ?? 0;
  const out = d?.outOfStockCount ?? 0;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[22px] bg-border shadow-[var(--shadow-card)] ring-1 ring-border md:grid-cols-5">
      {items.map((it) => (
        <Link key={it.label} href={it.href} className="group bg-card p-5 transition-colors hover:bg-accent/50">
          <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <it.icon className="size-[15px]" strokeWidth={1.8} />
            {it.label}
            <ArrowUpRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
          {loading || it.value == null ? (
            <Skeleton className="mt-2.5 h-6 w-24" />
          ) : (
            <p className="figure mt-2 text-[21px] leading-none">{it.value}</p>
          )}
          {it.sub && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{it.sub}</p>}
        </Link>
      ))}
      <Link
        href="/inventory?stock=low"
        className={cn("group col-span-2 p-5 transition-colors md:col-span-1", low > 0 ? "bg-warning-soft hover:bg-warning-soft/80" : "bg-card hover:bg-accent/50")}
      >
        <span className={cn("flex items-center gap-2 text-[12.5px]", low > 0 ? "text-warning-soft-foreground" : "text-muted-foreground")}>
          <AlertTriangle className="size-[15px]" strokeWidth={1.8} />
          Low stock
          <ArrowUpRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        {loading || !d ? (
          <Skeleton className="mt-2.5 h-6 w-12" />
        ) : (
          <p className={cn("figure mt-2 text-[21px] leading-none", low > 0 && "text-warning-soft-foreground")}>{formatNumber(low)}</p>
        )}
        <p className={cn("mt-1.5 text-[11.5px]", low > 0 ? "text-warning-soft-foreground/80" : "text-muted-foreground")}>
          {d ? (low === 0 ? "all healthy" : out > 0 ? `${formatNumber(out)} out of stock` : "items to reorder") : " "}
        </p>
      </Link>
    </div>
  );
}
