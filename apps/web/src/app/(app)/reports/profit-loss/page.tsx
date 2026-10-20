"use client";

import Link from "next/link";
import type { AccountAmount, ProfitLossReport } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";
import { formatPercent } from "@/lib/utils";

function Lines({ rows }: { rows: AccountAmount[] }) {
  return (
    <>
      {rows.map((a) => (
        <TableRow key={a.accountId} className="hover:bg-transparent">
          <TableCell className="pl-10">
            <Link href={`/accounting/ledger?accountId=${a.accountId}`} className="hover:underline">
              <span className="mr-2 font-mono text-[12px] text-muted-foreground">{a.code}</span>
              {a.name}
            </Link>
          </TableCell>
          <TableCell numeric><Money value={a.amount} tone="auto" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function Subtotal({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <TableRow className={strong ? "rule-double-top bg-muted/40 hover:bg-muted/40" : "bg-muted/30 hover:bg-muted/30"}>
      <TableCell className="font-semibold">{label}</TableCell>
      <TableCell numeric className={strong ? "font-display text-lg font-semibold" : "font-semibold"}><Money value={value} tone="auto" /></TableCell>
    </TableRow>
  );
}

export default function ProfitLossPage() {
  const money = useMoney();
  return (
    <ReportPage<ProfitLossReport>
      path="/reports/profit-loss"
      title="Profit & loss"
      description="Income less cost of sales and expenses."
      controls={{ range: true, location: false }}
      csv={(r) => [
        ["Section", "Account", "Amount"],
        ...r.income.map((a) => ["Income", `${a.code} ${a.name}`, money.toMajor(a.amount)]),
        ["", "Net revenue", money.toMajor(r.netRevenue)],
        ...r.costOfSales.map((a) => ["Cost of sales", `${a.code} ${a.name}`, money.toMajor(a.amount)]),
        ["", "Gross profit", money.toMajor(r.grossProfit)],
        ...r.expenses.map((a) => ["Expenses", `${a.code} ${a.name}`, money.toMajor(a.amount)]),
        ...r.otherIncome.map((a) => ["Other income", `${a.code} ${a.name}`, money.toMajor(a.amount)]),
        ["", "Net profit", money.toMajor(r.netProfit)],
      ]}
    >
      {(r) => (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Net revenue" value={money.format(r.netRevenue)} tone="primary" />
            <StatCard label="Gross profit" value={money.format(r.grossProfit)} tone="success" sublabel={`${formatPercent(r.grossMargin)} margin`} />
            <StatCard label="Expenses" value={money.format(r.totalExpenses)} tone="warning" />
            <StatCard
              variant="feature"
              label="Net profit"
              value={money.format(r.netProfit)}
              sublabel={`${formatPercent(r.netMargin)} margin`}
            />
          </div>
          <SectionCard flush>
            <Table>
              <TableBody>
                <Section title="Income" />
                <Lines rows={r.income} />
                <Subtotal label="Net revenue" value={r.netRevenue} />
                <Section title="Cost of sales" />
                <Lines rows={r.costOfSales} />
                <Subtotal label="Total cost of sales" value={r.totalCostOfSales} />
                <Subtotal label="Gross profit" value={r.grossProfit} />
                <Section title="Operating expenses" />
                <Lines rows={r.expenses} />
                <Subtotal label="Total expenses" value={r.totalExpenses} />
                {r.otherIncome.length > 0 && (
                  <>
                    <Section title="Other income" />
                    <Lines rows={r.otherIncome} />
                    <Subtotal label="Total other income" value={r.totalOtherIncome} />
                  </>
                )}
                <Subtotal label="Net profit" value={r.netProfit} strong />
              </TableBody>
            </Table>
          </SectionCard>
        </div>
      )}
    </ReportPage>
  );
}

function Section({ title }: { title: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={2} className="label-caps pt-5 pb-1 h-auto">{title}</TableCell>
    </TableRow>
  );
}
