"use client";

import Link from "next/link";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { TrialBalanceReport } from "@shopbooks/shared";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from "@shopbooks/shared";
import { ReportPage, ReportSection } from "@/components/report-shell";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";

export default function TrialBalancePage() {
  const money = useMoney();
  return (
    <ReportPage<TrialBalanceReport>
      path="/reports/trial-balance"
      title="Trial balance"
      description="Every account's closing balance — debits must equal credits."
      controls={{ asOf: true }}
      csv={(r) => [
        ["Code", "Account", "Type", "Debit", "Credit"],
        ...r.rows.map((a) => [a.code, a.name, a.type, money.toMajor(a.debit), money.toMajor(a.credit)]),
        ["", "Total", "", money.toMajor(r.totalDebit), money.toMajor(r.totalCredit)],
      ]}
    >
      {(r) => {
        const ok = r.totalDebit === r.totalCredit;
        return (
          <div className="grid gap-6">
            <ReportSection flush>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead align="right">Debit</TableHead>
                    <TableHead align="right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ACCOUNT_TYPES.flatMap((type) => {
                    const rows = r.rows.filter((a) => a.type === type);
                    if (!rows.length) return [];
                    return [
                      <TableRow key={`h-${type}`} className="hover:bg-transparent">
                        <TableCell colSpan={4} className="label-caps h-auto pt-4 pb-1">{ACCOUNT_TYPE_LABELS[type]}</TableCell>
                      </TableRow>,
                      ...rows.map((a) => (
                        <TableRow key={a.accountId} className="hover:bg-transparent">
                          <TableCell className="font-mono text-[12.5px] text-muted-foreground">{a.code}</TableCell>
                          <TableCell><Link href={`/accounting/ledger?accountId=${a.accountId}`} className="hover:underline">{a.name}</Link></TableCell>
                          <TableCell numeric><Money value={a.debit} dashZero /></TableCell>
                          <TableCell numeric><Money value={a.credit} dashZero /></TableCell>
                        </TableRow>
                      )),
                    ];
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell numeric><Money value={r.totalDebit} /></TableCell>
                    <TableCell numeric><Money value={r.totalCredit} /></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </ReportSection>
            <div className={`flex items-center gap-3 rounded-2xl px-5 py-4 text-sm ${ok ? "bg-success-soft text-success-soft-foreground" : "bg-destructive-soft text-destructive-soft-foreground"}`}>
              {ok ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}
              {ok ? "The books are in balance." : <>Out of balance by <Money value={Math.abs(r.totalDebit - r.totalCredit)} /></>}
            </div>
          </div>
        );
      }}
    </ReportPage>
  );
}
