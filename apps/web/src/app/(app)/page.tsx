"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CircleDollarSign,
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
import { StatCard } from "@/components/stat-card";
import { SectionCard } from "@/components/section-card";
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

          {/* primary KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              variant="feature"
              label="Today's sales"
              value={money.format(d?.today.netSales)}
              icon={CircleDollarSign}
              delta={todayDelta}
              deltaLabel="vs yesterday"
              sublabel={d && todayDelta === null ? `${formatNumber(d.today.invoices)} invoices` : undefined}
              sparkline={trend.slice(-14).map((t) => t.netSales)}
              loading={isLoading}
              href="/sales"
            />
            <StatCard
              label="Gross profit today"
              value={money.format(d?.today.grossProfit)}
              icon={TrendingUp}
              tone="success"
              sublabel={
                d
                  ? `${d.today.netSales ? Math.round((d.today.grossProfit / d.today.netSales) * 100) : 0}% margin · ${formatNumber(
                      d.today.invoices,
                    )} sales`
                  : undefined
              }
              sparkline={trend.slice(-14).map((t) => t.grossProfit)}
              sparklineColor="var(--chart-2)"
              loading={isLoading}
            />
            <StatCard
              label="This month"
              value={money.format(d?.month.netSales)}
              icon={Receipt}
              tone="info"
              delta={monthDelta}
              deltaLabel="vs last month"
              sublabel={d && monthDelta === null ? "net sales" : undefined}
              loading={isLoading}
              href="/reports/sales"
            />
            <StatCard
              label="Net profit this month"
              value={<span className={cn(d && d.month.netProfit < 0 && "text-destructive")}>{money.format(d?.month.netProfit)}</span>}
              icon={Wallet}
              tone={d && d.month.netProfit < 0 ? "danger" : "primary"}
              sublabel={d ? `after ${money.format(d.month.expenses)} expenses` : undefined}
              loading={isLoading}
              href="/reports/profit-loss"
            />
          </div>

          {/* secondary KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatCard size="sm" label="Receivables" value={money.format(d?.receivables)} icon={HandCoins} tone="warning" loading={isLoading} href="/reports/receivables" />
            <StatCard size="sm" label="Payables" value={money.format(d?.payables)} icon={WalletCards} tone="neutral" loading={isLoading} href="/reports/payables" />
            <StatCard size="sm" label="Cash on hand" value={money.format(d?.cashBalance)} icon={Banknote} tone="success" loading={isLoading} href="/accounting" />
            <StatCard size="sm" label="Inventory value" value={money.format(d?.inventoryValue)} icon={Boxes} tone="info" loading={isLoading} href="/reports/inventory" />
            <StatCard
              size="sm"
              label="Low stock items"
              value={formatNumber(d?.lowStockCount ?? 0)}
              icon={AlertTriangle}
              tone={d && d.lowStockCount > 0 ? "warning" : "neutral"}
              sublabel={d && d.outOfStockCount > 0 ? `${formatNumber(d.outOfStockCount)} out of stock` : undefined}
              loading={isLoading}
              href="/inventory?stock=low"
              className="col-span-2 md:col-span-1"
            />
          </div>

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
