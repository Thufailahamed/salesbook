"use client";

import Link from "next/link";
import type { AgingReport } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";

const BUCKETS = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1–30" },
  { key: "d31_60", label: "31–60" },
  { key: "d61_90", label: "61–90" },
  { key: "d90plus", label: "90+" },
] as const;

/** Shared by the receivables (customers) and payables (suppliers) aging reports. */
export function AgingReportView({ kind }: { kind: "receivables" | "payables" }) {
  const money = useMoney();
  const recv = kind === "receivables";
  const base = recv ? "/customers" : "/suppliers";
  return (
    <ReportPage<AgingReport>
      path={`/reports/${recv ? "receivables" : "payables"}-aging`}
      title={recv ? "Receivables aging" : "Payables aging"}
      description={recv ? "Who owes you, bucketed by days overdue." : "What you owe suppliers, bucketed by days overdue."}
      controls={{ asOf: true }}
      csv={(r) => [
        [recv ? "Customer" : "Supplier", "Phone", ...BUCKETS.map((b) => b.label), "Total"],
        ...r.rows.map((x) => [x.name, x.phone, ...BUCKETS.map((b) => money.toMajor(x[b.key])), money.toMajor(x.total)]),
        ["Total", "", ...BUCKETS.map((b) => money.toMajor(r.totals[b.key])), money.toMajor(r.totals.total)],
      ]}
    >
      {(r) => {
        const overdue = r.totals.total - r.totals.current;
        return (
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard variant="feature" label={recv ? "Total receivable" : "Total payable"} value={money.format(r.totals.total)} sublabel={`${r.rows.length} ${recv ? "customers" : "suppliers"}`} />
              <StatCard label="Not yet due" value={money.format(r.totals.current)} tone="success" />
              <StatCard label="Overdue" value={money.format(overdue)} tone={overdue > 0 ? "danger" : "neutral"} sublabel={r.totals.total ? `${Math.round((overdue / r.totals.total) * 100)}% of total` : undefined} />
            </div>
            {r.rows.length === 0 ? (
              <SectionCard><EmptyState compact title={recv ? "Nobody owes you anything" : "You don't owe any supplier"} /></SectionCard>
            ) : (
              <>
                <SectionCard title="Aging buckets">
                  <SimpleBarChart
                    data={BUCKETS.map((b) => ({ name: b.label, amount: r.totals[b.key] }))}
                    xKey="name"
                    series={[{ key: "amount", name: "Amount" }]}
                    colorful
                    height={200}
                    yFormatter={(v) => money.formatCompact(v)}
                    valueFormatter={(v) => money.format(v)}
                  />
                </SectionCard>
                <SectionCard flush>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>{recv ? "Customer" : "Supplier"}</TableHead>
                        {BUCKETS.map((b) => (
                          <TableHead key={b.key} align="right" className={b.key === "d31_60" || b.key === "d61_90" ? "hidden md:table-cell" : undefined}>{b.label}</TableHead>
                        ))}
                        <TableHead align="right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.rows.map((x) => (
                        <TableRow key={x.partyId} className="hover:bg-transparent">
                          <TableCell>
                            <Link href={`${base}/view?id=${x.partyId}`} className="font-medium hover:underline">{x.name}</Link>
                            {x.phone && <p className="text-xs text-muted-foreground">{x.phone}</p>}
                          </TableCell>
                          {BUCKETS.map((b) => (
                            <TableCell key={b.key} numeric className={b.key === "d31_60" || b.key === "d61_90" ? "hidden md:table-cell" : undefined}>
                              <Money value={x[b.key]} dashZero className={b.key === "d90plus" && x[b.key] > 0 ? "text-destructive" : undefined} />
                            </TableCell>
                          ))}
                          <TableCell numeric className="font-semibold"><Money value={x.total} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="hover:bg-transparent">
                        <TableCell>Total</TableCell>
                        {BUCKETS.map((b) => (
                          <TableCell key={b.key} numeric className={b.key === "d31_60" || b.key === "d61_90" ? "hidden md:table-cell" : undefined}><Money value={r.totals[b.key]} /></TableCell>
                        ))}
                        <TableCell numeric><Money value={r.totals.total} /></TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </SectionCard>
              </>
            )}
          </div>
        );
      }}
    </ReportPage>
  );
}
