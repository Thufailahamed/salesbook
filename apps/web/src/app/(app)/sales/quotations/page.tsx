"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import type { Paginated, Quotation } from "@shopbooks/shared";
import { QUOTATION_STATUSES } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, type DateRange } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { QuotationStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  converted: "Converted",
  expired: "Expired",
};

export default function QuotationsPage() {
  const router = useRouter();
  const { can } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [status, setStatus] = React.useState<string | undefined>(undefined);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<Quotation>>("/quotations", {
    page,
    pageSize: 25,
    q,
    ...range,
    status,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<Quotation>[] = [
    { key: "number", header: "Quotation", cell: (r) => <span className="font-mono text-[12.5px] font-medium">{r.number}</span> },
    { key: "date", header: "Date", hideBelow: "sm", cell: (r) => <span className="text-muted-foreground">{formatDate(r.date)}</span> },
    { key: "customer", header: "Customer", cell: (r) => r.customerName ?? <span className="text-muted-foreground">—</span> },
    {
      key: "valid",
      header: "Valid until",
      hideBelow: "md",
      cell: (r) => <span className="text-muted-foreground">{r.validUntil ? formatDate(r.validUntil) : "—"}</span>,
    },
    { key: "status", header: "Status", cell: (r) => <QuotationStatusBadge status={r.status} /> },
    { key: "total", header: "Total", numeric: true, cell: (r) => <Money value={r.total} className="font-medium" /> },
  ];

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Estimates for customers. Convert an accepted quote into a sale at the POS in one click."
        actions={
          can("quotations.manage") && (
            <Button asChild>
              <Link href="/sales/quotations/new">
                <Plus /> New quotation
              </Link>
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/sales/quotations/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number or customer…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <FilterSelect
              value={status}
              onChange={reset(setStatus)}
              allLabel="All statuses"
              options={QUOTATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))}
            />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        empty={
          <EmptyState
            icon={FileText}
            title="No quotations"
            description="Send customers a priced estimate before they buy."
            action={
              can("quotations.manage") ? (
                <Button size="sm" asChild>
                  <Link href="/sales/quotations/new">
                    <Plus /> New quotation
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
      />
    </>
  );
}
