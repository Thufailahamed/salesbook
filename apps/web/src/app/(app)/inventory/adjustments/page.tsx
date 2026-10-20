"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, SlidersHorizontal } from "lucide-react";
import type { Paginated, StockAdjustment } from "@shopbooks/shared";
import { ADJUSTMENT_REASONS, ADJUSTMENT_REASON_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, type DateRange } from "@/components/filters";
import { LocationSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { formatDate, formatNumber } from "@/lib/utils";

export default function AdjustmentsPage() {
  const router = useRouter();
  const { can } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [reason, setReason] = React.useState<string | undefined>(undefined);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<StockAdjustment>>("/inventory/adjustments", {
    page,
    pageSize: 25,
    q,
    ...range,
    locationId,
    reason,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<StockAdjustment>[] = [
    { key: "number", header: "Adjustment", cell: (a) => <span className="font-mono text-[12.5px] font-medium">{a.number}</span> },
    { key: "date", header: "Date", cell: (a) => <span className="text-muted-foreground">{formatDate(a.date)}</span> },
    { key: "reason", header: "Reason", cell: (a) => <Badge variant="outline">{ADJUSTMENT_REASON_LABELS[a.reason]}</Badge> },
    { key: "loc", header: "Location", hideBelow: "md", cell: (a) => <span className="text-[13px] text-muted-foreground">{a.locationName}</span> },
    { key: "note", header: "Note", hideBelow: "lg", cell: (a) => <span className="line-clamp-1 text-[13px] text-muted-foreground">{a.note ?? "—"}</span> },
    { key: "lines", header: "Items", numeric: true, hideBelow: "sm", cell: (a) => formatNumber(a.lineCount) },
    { key: "value", header: "Value", numeric: true, cell: (a) => <Money value={a.totalValue} tone="signed" /> },
  ];

  return (
    <>
      <PageHeader
        title="Stock adjustments"
        description="Counts, damage, theft and other corrections — each one posts to the books."
        actions={
          can("inventory.manage") && (
            <Button asChild>
              <Link href="/inventory/adjustments/new">
                <Plus /> New adjustment
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
        onRowClick={(r) => router.push(`/inventory/adjustments/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number or note…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <LocationSelect value={locationId} onChange={reset(setLocationId)} allowAll className="sm:w-44" />
            <FilterSelect
              value={reason}
              onChange={reset(setReason)}
              allLabel="All reasons"
              options={ADJUSTMENT_REASONS.map((r) => ({ value: r, label: ADJUSTMENT_REASON_LABELS[r] }))}
            />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        empty={
          <EmptyState
            icon={SlidersHorizontal}
            title="No adjustments"
            description="Record stock counts, damaged goods or corrections here."
            action={
              can("inventory.manage") ? (
                <Button size="sm" asChild>
                  <Link href="/inventory/adjustments/new">
                    <Plus /> New adjustment
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
