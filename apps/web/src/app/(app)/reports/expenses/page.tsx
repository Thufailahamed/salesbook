"use client";

import Link from "next/link";
import type { ExpenseReport } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";
import { formatDate, formatNumber } from "@/lib/utils";

export default function ExpenseReportPage() {
  const money = useMoney();
  return (
    <ReportPage<ExpenseReport>
      path="/reports/expenses"
      title="Expense report"
      description="Where the money goes."
      controls={{ range: true }}
      csv={(r) => [
        ["Code", "Category", "Count", "Amount"],
        ...r.byAccount.map((a) => [a.code, a.name, a.count, money.toMajor(a.amount)]),
        ["", "Total", "", money.toMajor(r.total)],
      ]}
    >
      {(r) => (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard variant="feature" label="Total expenses" value={money.format(r.total)} />
            <StatCard label="Categories" value={formatNumber(r.byAccount.length)} tone="neutral" />
            <StatCard label="Largest category" value={r.byAccount[0]?.name ?? "—"} tone="warning" sublabel={r.byAccount[0] ? money.format(r.byAccount[0].amount) : undefined} />
          </div>
          {r.byAccount.length === 0 ? (
            <SectionCard><EmptyState compact title="No expenses in this period" /></SectionCard>
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-3">
                <SectionCard title="Over time" className="xl:col-span-2">
                  <SimpleBarChart
                    data={r.series}
                    xKey="period"
                    series={[{ key: "amount", name: "Expenses" }]}
                    height={240}
                    xFormatter={(v) => formatDate(v, { month: "short", day: "numeric" })}
                    yFormatter={(v) => money.formatCompact(v)}
                    valueFormatter={(v) => money.format(v)}
                  />
                </SectionCard>
                <SectionCard title="Mix">
                  <DonutChart data={r.byAccount.slice(0, 8).map((a) => ({ name: a.name, value: a.amount }))} valueFormatter={(v) => money.format(v)} height={190} />
                </SectionCard>
              </div>
              <SectionCard title="By category" flush>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Category</TableHead><TableHead align="right">Entries</TableHead><TableHead align="right">Amount</TableHead><TableHead align="right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.byAccount.map((a) => (
                      <TableRow key={a.accountId} className="hover:bg-transparent">
                        <TableCell>
                          <Link href={`/accounting/ledger?accountId=${a.accountId}`} className="hover:underline">
                            <span className="mr-2 font-mono text-[12px] text-muted-foreground">{a.code}</span>{a.name}
                          </Link>
                        </TableCell>
                        <TableCell numeric>{formatNumber(a.count)}</TableCell>
                        <TableCell numeric className="font-medium"><Money value={a.amount} /></TableCell>
                        <TableCell numeric className="text-muted-foreground">{r.total ? Math.round((a.amount / r.total) * 100) : 0}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell>Total</TableCell><TableCell /><TableCell numeric><Money value={r.total} /></TableCell><TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </SectionCard>
            </>
          )}
        </div>
      )}
    </ReportPage>
  );
}
