"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Banknote, Landmark } from "lucide-react";
import type { CashFlowLine, CashFlowReport, CashFlowSection } from "@shopbooks/shared";
import { ReportPage, ReportSection } from "@/components/report-shell";
import { CashForecastCard } from "@/components/cash-forecast-card";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";

const ACTIVITY_LABELS = {
  operating: "Operating activities",
  investing: "Investing activities",
  financing: "Financing activities",
} as const;

export default function CashFlowPage() {
  const money = useMoney();
  return (
    <ReportPage<CashFlowReport>
      path="/reports/cash-flow"
      title="Cash flow"
      description="Where cash came from and where it went, grouped by activity."
      controls={{ range: true }}
      csv={(r) => [
        ["Activity", "Account", "Amount"],
        ...(Object.keys(ACTIVITY_LABELS) as (keyof typeof ACTIVITY_LABELS)[]).flatMap((k) => [
          ...r.activities[k].items.map((i) => [ACTIVITY_LABELS[k], `${i.code} ${i.name}`, money.toMajor(i.amount)]),
          [ACTIVITY_LABELS[k], "Net", money.toMajor(r.activities[k].total)],
        ]),
        ["", "Net change in cash", money.toMajor(r.netChange)],
        ["", "Opening cash", money.toMajor(r.totalOpening)],
        ["", "Closing cash", money.toMajor(r.totalClosing)],
      ]}
    >
      {(r) => (
        <div className="grid gap-6">
          <CashForecastCard />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Opening cash" value={money.format(r.totalOpening)} icon={Landmark} tone="neutral" />
            <StatCard label="Cash in" value={money.format(r.totalInflow)} icon={ArrowDownLeft} tone="success" />
            <StatCard label="Cash out" value={money.format(r.totalOutflow)} icon={ArrowUpRight} tone="danger" />
            <StatCard
              variant="feature"
              label="Closing cash"
              value={money.format(r.totalClosing)}
              icon={Banknote}
              sublabel={`net ${money.format(r.netChange, { signed: true })}`}
            />
          </div>

          <ReportSection title="By activity" flush>
            <Table>
              <TableBody>
                {(Object.keys(ACTIVITY_LABELS) as (keyof typeof ACTIVITY_LABELS)[]).map((key) => (
                  <ActivityRows key={key} title={ACTIVITY_LABELS[key]} section={r.activities[key]} />
                ))}
                <TableRow className="rule-double-top bg-muted/40 hover:bg-muted/40">
                  <TableCell className="font-semibold">Net change in cash</TableCell>
                  <TableCell numeric className="font-display text-lg font-semibold">
                    <Money value={r.netChange} tone="signed" />
                  </TableCell>
                </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell>Opening cash</TableCell>
                  <TableCell numeric><Money value={r.totalOpening} /></TableCell>
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="font-semibold">Closing cash</TableCell>
                  <TableCell numeric className="font-semibold"><Money value={r.totalClosing} /></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </ReportSection>

          <ReportSection title="By cash account" flush>
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
            </Table>
          </ReportSection>
        </div>
      )}
    </ReportPage>
  );
}

function ActivityRows({ title, section }: { title: string; section: CashFlowSection }) {
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={2} className="label-caps pt-5 pb-1 h-auto">{title}</TableCell>
      </TableRow>
      {section.items.length === 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={2} className="pl-10 text-muted-foreground">No movements</TableCell>
        </TableRow>
      )}
      {section.items.map((i: CashFlowLine) => (
        <TableRow key={i.accountId} className="hover:bg-transparent">
          <TableCell className="pl-10">
            <span className="mr-2 font-mono text-[12px] text-muted-foreground">{i.code}</span>
            {i.name}
          </TableCell>
          <TableCell numeric><Money value={i.amount} tone="signed" /></TableCell>
        </TableRow>
      ))}
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell className="font-semibold">Net {title.toLowerCase().replace(" activities", "")} cash</TableCell>
        <TableCell numeric className="font-semibold"><Money value={section.total} tone="signed" /></TableCell>
      </TableRow>
    </>
  );
}
