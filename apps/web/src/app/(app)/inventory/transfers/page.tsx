"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowRight, Plus } from "lucide-react";
import type { Paginated, StockTransfer } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, SearchInput, type DateRange } from "@/components/filters";
import { LocationSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { formatDate, formatNumber, formatQty } from "@/lib/utils";

export default function TransfersPage() {
  const router = useRouter();
  const { can, activeLocations } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<StockTransfer>>("/inventory/transfers", { page, pageSize: 25, q, ...range, locationId });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const single = activeLocations.length < 2;

  const columns: Column<StockTransfer>[] = [
    { key: "number", header: "Transfer", cell: (t) => <span className="font-mono text-[12.5px] font-medium">{t.number}</span> },
    { key: "date", header: "Date", cell: (t) => <span className="text-muted-foreground">{formatDate(t.date)}</span> },
    {
      key: "route",
      header: "Route",
      cell: (t) => (
        <span className="flex items-center gap-2 text-[13px]">
          {t.fromLocationName}
          <ArrowRight className="size-3.5 text-muted-foreground" />
          {t.toLocationName}
        </span>
      ),
    },
    { key: "note", header: "Note", hideBelow: "lg", cell: (t) => <span className="line-clamp-1 text-[13px] text-muted-foreground">{t.note ?? "—"}</span> },
    { key: "items", header: "Items", numeric: true, hideBelow: "sm", cell: (t) => formatNumber(t.itemCount) },
    { key: "qty", header: "Units", numeric: true, cell: (t) => formatQty(t.totalQuantity) },
  ];

  return (
    <>
      <PageHeader
        title="Stock transfers"
        description="Move stock between branches and warehouses. Value moves at average cost."
        actions={
          can("inventory.manage") && !single && (
            <Button asChild>
              <Link href="/inventory/transfers/new">
                <Plus /> New transfer
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
        onRowClick={(r) => router.push(`/inventory/transfers/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number or note…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <LocationSelect value={locationId} onChange={reset(setLocationId)} allowAll className="sm:w-44" />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        empty={
          <EmptyState
            icon={ArrowLeftRight}
            title="No transfers"
            description={single ? "Add a second location in Settings to move stock between branches." : "Transfers between your locations will show up here."}
            action={
              single && can("settings.manage") ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href="/settings?tab=locations">Add a location</Link>
                </Button>
              ) : undefined
            }
          />
        }
      />
    </>
  );
}
