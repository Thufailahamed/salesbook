"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Undo2 } from "lucide-react";
import type { Paginated, SaleReturn } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, SearchInput, type DateRange } from "@/components/filters";
import { LocationSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { formatDate } from "@/lib/utils";

type ReturnList = Paginated<SaleReturn> & { totals: { total: number } };

/** "Refunded Rs 500 · Store credit Rs 200" */
function settlementSummary(r: SaleReturn) {
  const parts: [string, number][] = [
    ["Refunded", r.refunded],
    ["Store credit", r.toStoreCredit],
    ["Exchange", r.appliedToExchange],
    ["Reduced balance", r.appliedToInvoice],
  ];
  return parts.filter(([, v]) => v > 0);
}

export default function ReturnsPage() {
  const router = useRouter();
  const { can } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const { data, isLoading, isFetching } = useApiQuery<ReturnList>("/returns", { page, pageSize: 25, q, ...range, locationId });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<SaleReturn>[] = [
    { key: "number", header: "Credit note", cell: (r) => <span className="font-mono text-[12.5px] font-medium">{r.number}</span> },
    { key: "date", header: "Date", hideBelow: "sm", cell: (r) => <span className="text-muted-foreground">{formatDate(r.date)}</span> },
    { key: "invoice", header: "Invoice", cell: (r) => <span className="font-mono text-[12.5px] text-muted-foreground">{r.invoiceNumber}</span> },
    { key: "customer", header: "Customer", hideBelow: "md", cell: (r) => r.customerName ?? <span className="text-muted-foreground">Walk-in</span> },
    {
      key: "settled",
      header: "Settled as",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-[13px] text-muted-foreground">
          {settlementSummary(r)
            .map(([l]) => l)
            .join(" · ") || "—"}
        </span>
      ),
    },
    { key: "reason", header: "Reason", hideBelow: "lg", cell: (r) => <span className="line-clamp-1 text-[13px] text-muted-foreground">{r.reason ?? "—"}</span> },
    { key: "total", header: "Total", numeric: true, cell: (r) => <Money value={r.total} className="font-medium" /> },
  ];

  return (
    <>
      <PageHeader
        title="Returns"
        description="Credit notes for goods brought back — refunds, store credit and exchanges."
        actions={
          can("sales.return") && (
            <Button asChild>
              <Link href="/sales/returns/new">
                <Plus /> New return
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
        onRowClick={(r) => router.push(`/sales/returns/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number, invoice or customer…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <LocationSelect value={locationId} onChange={reset(setLocationId)} allowAll className="sm:w-44" />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        footer={
          data &&
          data.total > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="text-right">
                <span className="mr-4 font-normal text-muted-foreground">{data.total} returns</span>
                <Money value={data.totals.total} />
              </TableCell>
            </TableRow>
          )
        }
        empty={
          <EmptyState
            icon={Undo2}
            title="No returns"
            description="Process returns here or from the POS (F6) — exchanges are handled in one step."
          />
        }
      />
    </>
  );
}
