"use client";

import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { AccountAmount, BalanceSheetReport } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { SectionCard } from "@/components/section-card";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";

function Block({ title, rows, total, totalLabel, extra }: { title: string; rows: AccountAmount[]; total: number; totalLabel: string; extra?: { label: string; value: number } }) {
  return (
    <SectionCard title={title} flush>
      <Table>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.accountId} className="hover:bg-transparent">
              <TableCell>
                <Link href={`/accounting/ledger?accountId=${a.accountId}`} className="hover:underline">
                  <span className="mr-2 font-mono text-[12px] text-muted-foreground">{a.code}</span>
                  {a.name}
                </Link>
              </TableCell>
              <TableCell numeric><Money value={a.amount} tone="auto" /></TableCell>
            </TableRow>
          ))}
          {extra && (
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-muted-foreground italic">{extra.label}</TableCell>
              <TableCell numeric><Money value={extra.value} tone="auto" /></TableCell>
            </TableRow>
          )}
          <TableRow className="rule-double-top bg-muted/40 hover:bg-muted/40">
            <TableCell className="font-semibold">{totalLabel}</TableCell>
            <TableCell numeric className="font-display text-lg font-semibold"><Money value={total} /></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </SectionCard>
  );
}

export default function BalanceSheetPage() {
  const money = useMoney();
  return (
    <ReportPage<BalanceSheetReport>
      path="/reports/balance-sheet"
      title="Balance sheet"
      description="What you own, what you owe, and what's left for the owner."
      controls={{ asOf: true }}
      csv={(r) => [
        ["Section", "Account", "Amount"],
        ...r.assets.map((a) => ["Assets", `${a.code} ${a.name}`, money.toMajor(a.amount)]),
        ["", "Total assets", money.toMajor(r.totalAssets)],
        ...r.liabilities.map((a) => ["Liabilities", `${a.code} ${a.name}`, money.toMajor(a.amount)]),
        ["", "Total liabilities", money.toMajor(r.totalLiabilities)],
        ...r.equity.map((a) => ["Equity", `${a.code} ${a.name}`, money.toMajor(a.amount)]),
        ["Equity", "Current earnings", money.toMajor(r.currentEarnings)],
        ["", "Total equity", money.toMajor(r.totalEquity)],
      ]}
    >
      {(r) => {
        const balanced = r.totalAssets === r.totalLiabilitiesAndEquity;
        return (
          <div className="grid gap-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Block title="Assets" rows={r.assets} total={r.totalAssets} totalLabel="Total assets" />
              <div className="grid content-start gap-6">
                <Block title="Liabilities" rows={r.liabilities} total={r.totalLiabilities} totalLabel="Total liabilities" />
                <Block title="Equity" rows={r.equity} total={r.totalEquity} totalLabel="Total equity" extra={{ label: "Current earnings (unclosed profit)", value: r.currentEarnings }} />
              </div>
            </div>
            <div className={`flex items-center gap-3 rounded-2xl px-5 py-4 text-sm ${balanced ? "bg-success-soft text-success-soft-foreground" : "bg-destructive-soft text-destructive-soft-foreground"}`}>
              {balanced ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}
              <span>
                Assets <Money value={r.totalAssets} /> {balanced ? "=" : "≠"} Liabilities + Equity <Money value={r.totalLiabilitiesAndEquity} />
              </span>
            </div>
          </div>
        );
      }}
    </ReportPage>
  );
}
