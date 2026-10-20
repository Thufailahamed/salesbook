"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Banknote, Landmark } from "lucide-react";
import type { CashFlowReport } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";

export default function CashFlowPage() {
  const money = useMoney();
  return (
    <ReportPage<CashFlowReport>
      path="/reports/cash-flow"
      title="Cash flow"
      description="Movement through your cash, bank and wallet accounts."
      controls={{ range: true }}
      csv={(r) => [
        ["Account", "Opening", "Inflow", "Outflow", "Closing"],
        ...r.accounts.map((a) => [`${a.code} ${a.name}`, money.toMajor(a.opening), money.toMajor(a.inflow), money.toMajor(a.outflow), money.toMajor(a.closing)]),
        ["Total", money.toMajor(r.totalOpening), money.toMajor(r.totalInflow), money.toMajor(r.totalOutflow), money.toMajor(r.totalClosing)],
      ]}
    >
      {(r) => (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Opening" value={money.format(r.totalOpening)} icon={Landmark} tone="neutral" />
            <StatCard label="Money in" value={money.format(r.totalInflow)} icon={ArrowDownLeft} tone="success" />
            <StatCard label="Money out" value={money.format(r.totalOutflow)} icon={ArrowUpRight} tone="danger" />
            <StatCard variant="feature" label="Closing" value={money.format(r.totalClosing)} icon={Banknote} sublabel={`net ${money.format(r.totalInflow - r.totalOutflow, { signed: true })}`} />
          </div>
          <SectionCard flush>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Account</TableHead>
                  <TableHead align="right">Opening</TableHead>
                  <TableHead align="right">In</TableHead>
                  <TableHead align="right">Out</TableHead>
                  <TableHead align="right">Closing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.accounts.map((a) => (
                  <TableRow key={a.accountId} className="hover:bg-transparent">
                    <TableCell>
                      <Link href={`/accounting/ledger?accountId=${a.accountId}`} className="hover:underline">
                        <span className="mr-2 font-mono text-[12px] text-muted-foreground">{a.code}</span>{a.name}
                      </Link>
                    </TableCell>
                    <TableCell numeric className="text-muted-foreground"><Money value={a.opening} /></TableCell>
                    <TableCell numeric><Money value={a.inflow} tone="positive" dashZero /></TableCell>
                    <TableCell numeric><Money value={a.outflow} dashZero /></TableCell>
                    <TableCell numeric className="font-medium"><Money value={a.closing} tone="auto" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell>Total</TableCell>
                  <TableCell numeric><Money value={r.totalOpening} /></TableCell>
                  <TableCell numeric><Money value={r.totalInflow} /></TableCell>
                  <TableCell numeric><Money value={r.totalOutflow} /></TableCell>
                  <TableCell numeric><Money value={r.totalClosing} /></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </SectionCard>
        </div>
      )}
    </ReportPage>
  );
}
