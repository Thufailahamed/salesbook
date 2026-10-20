"use client";

import { Banknote, Percent, Receipt, ShoppingBasket, TrendingUp, Undo2 } from "lucide-react";
import type { SalesSummaryReport } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { StatCard } from "@/components/stat-card";
import { SectionCard } from "@/components/section-card";
import { TrendAreaChart } from "@/components/charts/area-chart";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";
import { formatDate, formatNumber, formatPercent } from "@/lib/utils";

export default function SalesReportPage() {
  const money = useMoney();
  return (
    <ReportPage<SalesSummaryReport>
      path="/reports/sales-summary"
      title="Sales summary"
      description="Revenue, profit and how customers pay."
      controls={{ range: true, location: true }}
      csv={(r) => [
        ["Period", "Invoices", "Net sales", "Returns", "Gross profit", "Tax"],
        ...r.series.map((s) => [s.period, s.invoices, money.toMajor(s.netSales), money.toMajor(s.returns), money.toMajor(s.grossProfit), money.toMajor(s.tax)]),
      ]}
    >
      {(r) => {
        const t = r.totals;
        return (
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard variant="feature" label="Net sales" value={money.format(t.netSales)} icon={Banknote} sublabel={`${formatNumber(t.invoices)} invoices`} />
              <StatCard label="Gross profit" value={money.format(t.grossProfit)} icon={TrendingUp} tone="success" sublabel={`${formatPercent(t.margin)} margin`} />
              <StatCard label="Average basket" value={money.format(t.avgBasket)} icon={ShoppingBasket} tone="info" sublabel={`${formatNumber(t.itemsSold, 1)} items sold`} />
              <StatCard label="Collected" value={money.format(t.collected)} icon={Receipt} tone="primary" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard size="sm" label="Gross sales" value={money.format(t.grossSales)} tone="neutral" />
              <StatCard size="sm" label="Discounts" value={money.format(t.discounts)} icon={Percent} tone="warning" />
              <StatCard size="sm" label="Returns" value={money.format(t.returns)} icon={Undo2} tone="danger" />
              <StatCard size="sm" label="Tax" value={money.format(t.tax)} tone="neutral" />
            </div>
            <SectionCard title="Sales & profit over time">
              {r.series.length === 0 ? (
                <EmptyState compact title="No sales in this period" />
              ) : (
                <TrendAreaChart
                  data={r.series}
                  xKey="period"
                  height={280}
                  series={[
                    { key: "netSales", name: "Net sales" },
                    { key: "grossProfit", name: "Gross profit", color: "var(--chart-2)" },
                  ]}
                  xFormatter={(v) => formatDate(v, { month: "short", day: "numeric" })}
                  yFormatter={(v) => money.formatCompact(v)}
                  valueFormatter={(v) => money.format(v)}
                />
              )}
            </SectionCard>
            <div className="grid gap-6 xl:grid-cols-3">
              <SectionCard title="Payment methods">
                {r.byPaymentMethod.length === 0 ? (
                  <EmptyState compact title="No payments" />
                ) : (
                  <DonutChart data={r.byPaymentMethod.map((m) => ({ name: m.name, value: m.amount }))} valueFormatter={(v) => money.format(v)} height={180} />
                )}
              </SectionCard>
              <SectionCard title="Busiest hours">
                {r.byHour.every((h) => !h.invoices) ? (
                  <EmptyState compact title="No data" />
                ) : (
                  <SimpleBarChart
                    data={r.byHour.map((h) => ({ ...h, label: `${h.hour}:00` }))}
                    xKey="label"
                    series={[{ key: "invoices", name: "Invoices" }]}
                    height={200}
                    valueFormatter={(v) => formatNumber(v)}
                  />
                )}
              </SectionCard>
              <SectionCard title="By staff" flush>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>Name</TableHead><TableHead align="right">Invoices</TableHead><TableHead align="right">Sales</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.byStaff.map((s) => (
                      <TableRow key={s.userId ?? s.name} className="hover:bg-transparent">
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell numeric>{formatNumber(s.invoices)}</TableCell>
                        <TableCell numeric><Money value={s.netSales} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            </div>
            {r.byLocation.length > 1 && (
              <SectionCard title="By location" flush>
                <Table>
                  <TableBody>
                    {r.byLocation.map((l) => (
                      <TableRow key={l.locationId} className="hover:bg-transparent">
                        <TableCell className="font-medium">{l.name}</TableCell>
                        <TableCell numeric>{formatNumber(l.invoices)} invoices</TableCell>
                        <TableCell numeric><Money value={l.netSales} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            )}
          </div>
        );
      }}
    </ReportPage>
  );
}
