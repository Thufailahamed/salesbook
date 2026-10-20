"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Download } from "lucide-react";
import type { LedgerResponse } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { AccountPicker } from "@/components/account-picker";
import { DateRangePicker, useBusinessToday, type DateRange } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { docHref } from "@/lib/links";
import { downloadFile, formatDate, toCSV } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <LedgerPage />
    </React.Suspense>
  );
}

function LedgerPage() {
  const router = useRouter();
  const params = useSearchParams();
  const today = useBusinessToday();
  const money = useMoney();
  const accountId = params.get("accountId");
  const [range, setRange] = React.useState<DateRange>({ from: `${today.slice(0, 4)}-01-01`, to: today });
  const { data, isLoading } = useApiQuery<LedgerResponse>(accountId ? `/accounting/ledger/${accountId}` : null, { from: range.from, to: range.to });

  const exportCsv = () =>
    data &&
    downloadFile(
      `ledger-${data.account.code}.csv`,
      toCSV([
        ["Date", "Entry", "Memo", "Debit", "Credit", "Balance"],
        ...data.entries.map((e) => [e.date, e.entryNumber, e.memo, money.toMajor(e.debit), money.toMajor(e.credit), money.toMajor(e.balance)]),
      ]),
    );

  return (
    <>
      <PageHeader
        backHref="/accounting"
        breadcrumbs={[{ label: "Chart of accounts", href: "/accounting" }, { label: "General ledger" }]}
        title={data ? `${data.account.code} · ${data.account.name}` : "General ledger"}
        description="Every posting to the account, with a running balance."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} allowAll={false} align="end" />
            {data && <Button variant="outline" onClick={exportCsv}><Download /> Export</Button>}
          </>
        }
      />
      <div className="mb-6 max-w-md">
        <AccountPicker value={accountId} onChange={(id) => id && router.replace(`/accounting/ledger?accountId=${id}`)} placeholder="Choose an account…" />
      </div>
      {!accountId ? (
        <EmptyState icon={BookOpen} title="Choose an account" description="Pick an account to see its ledger." />
      ) : isLoading || !data ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <SectionCard flush>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Date</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead className="hidden md:table-cell">Memo</TableHead>
                <TableHead align="right">Debit</TableHead>
                <TableHead align="right">Credit</TableHead>
                <TableHead align="right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell className="text-muted-foreground">{formatDate(data.from)}</TableCell>
                <TableCell colSpan={4} className="font-medium">Opening balance</TableCell>
                <TableCell numeric className="font-medium"><Money value={data.openingBalance} /></TableCell>
              </TableRow>
              {data.entries.map((e) => {
                const href = docHref(e.sourceType, e.sourceId) ?? `/accounting/journals/view?id=${e.entryId}`;
                return (
                  <TableRow key={e.lineId}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(e.date)}</TableCell>
                    <TableCell>
                      <Link href={`/accounting/journals/view?id=${e.entryId}`} className="font-mono text-[12.5px] text-primary hover:underline">{e.entryNumber}</Link>
                    </TableCell>
                    <TableCell className="hidden max-w-80 truncate md:table-cell">
                      <Link href={href} className="hover:underline">{e.memo}</Link>
                    </TableCell>
                    <TableCell numeric><Money value={e.debit} dashZero /></TableCell>
                    <TableCell numeric><Money value={e.credit} dashZero /></TableCell>
                    <TableCell numeric className="font-medium"><Money value={e.balance} tone="auto" /></TableCell>
                  </TableRow>
                );
              })}
              {data.entries.length === 0 && (
                <TableRow className="hover:bg-transparent"><TableCell colSpan={6}><EmptyState compact title="No postings in this period" /></TableCell></TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3}>Totals · closing balance</TableCell>
                <TableCell numeric><Money value={data.totalDebit} /></TableCell>
                <TableCell numeric><Money value={data.totalCredit} /></TableCell>
                <TableCell numeric><Money value={data.closingBalance} tone="auto" /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </SectionCard>
      )}
    </>
  );
}
