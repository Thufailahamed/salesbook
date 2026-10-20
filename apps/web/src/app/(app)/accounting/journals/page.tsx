"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus } from "lucide-react";
import type { JournalEntry, Paginated } from "@shopbooks/shared";
import { JOURNAL_SOURCE_TYPES } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, type DateRange } from "@/components/filters";
import { AccountPicker } from "@/components/account-picker";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { formatDate } from "@/lib/utils";

const sourceLabel = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function JournalsPage() {
  const router = useRouter();
  const { can } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [sourceType, setSourceType] = React.useState<string | undefined>(undefined);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<JournalEntry>>("/accounting/journals", {
    page, pageSize: 25, q, ...range, sourceType, accountId: accountId ?? undefined,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<JournalEntry>[] = [
    { key: "number", header: "Entry", cell: (j) => <span className="font-mono text-[12.5px] font-medium">{j.number}</span> },
    { key: "date", header: "Date", hideBelow: "sm", cell: (j) => <span className="text-muted-foreground">{formatDate(j.date)}</span> },
    { key: "memo", header: "Memo", cell: (j) => <span className="line-clamp-1">{j.memo}</span> },
    {
      key: "source",
      header: "Source",
      hideBelow: "md",
      cell: (j) => (
        <Badge variant={j.sourceType === "manual" ? "primary" : "outline"}>
          {sourceLabel(j.sourceType)}
        </Badge>
      ),
    },
    { key: "amount", header: "Amount", numeric: true, cell: (j) => <Money value={j.totalDebit} className="font-medium" /> },
  ];

  return (
    <>
      <PageHeader
        title="Journal entries"
        description="Every posting in the books — automatic from transactions, or entered by hand."
        actions={
          can("accounting.manage") && (
            <Button asChild>
              <Link href="/accounting/journals/new"><Plus /> Manual journal</Link>
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/accounting/journals/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number or memo…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <FilterSelect
              value={sourceType}
              onChange={reset(setSourceType)}
              allLabel="All sources"
              options={JOURNAL_SOURCE_TYPES.map((s) => ({ value: s, label: sourceLabel(s) }))}
            />
            <AccountPicker
              value={accountId}
              onChange={(id) => { setAccountId(id); setPage(1); }}
              clearable
              placeholder="Any account"
              className="sm:w-56"
            />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        empty={<EmptyState icon={NotebookPen} title="No journal entries" description="Entries appear as transactions are recorded." />}
      />
    </>
  );
}
