"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { History, X } from "lucide-react";
import type { Paginated, Product, StockMovement } from "@shopbooks/shared";
import { STOCK_MOVEMENT_LABELS, STOCK_MOVEMENT_TYPES, type StockMovementType } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, type DateRange } from "@/components/filters";
import { LocationSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { movementHref } from "@/lib/links";
import { cn, formatDate, formatQty, formatTime } from "@/lib/utils";

const TYPE_VARIANT: Record<StockMovementType, BadgeVariant> = {
  opening: "neutral",
  purchase: "success",
  purchase_return: "warning",
  sale: "primary",
  sale_return: "info",
  adjustment: "warning",
  transfer_in: "info",
  transfer_out: "info",
  void: "danger",
};

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <MovementsPage />
    </React.Suspense>
  );
}

function MovementsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const productId = params.get("productId") ?? undefined;
  const variantId = params.get("variantId") ?? undefined;
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [type, setType] = React.useState<string | undefined>(undefined);
  const product = useApiQuery<Product>(productId ? `/products/${productId}` : null, undefined, { staleTime: 60_000 });

  const { data, isLoading, isFetching } = useApiQuery<Paginated<StockMovement>>("/inventory/movements", {
    page,
    pageSize: 50,
    q,
    ...range,
    locationId,
    type,
    productId,
    variantId,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<StockMovement>[] = [
    {
      key: "date",
      header: "Date",
      cell: (m) => (
        <div className="whitespace-nowrap">
          <p>{formatDate(m.date)}</p>
          <p className="text-xs text-muted-foreground">{formatTime(m.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "item",
      header: "Item",
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {m.productName}
            {m.variantName && <span className="font-normal text-muted-foreground"> · {m.variantName}</span>}
          </p>
          <p className="truncate font-mono text-[11.5px] text-muted-foreground">{m.sku ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (m) => <Badge variant={TYPE_VARIANT[m.type] ?? "neutral"}>{STOCK_MOVEMENT_LABELS[m.type] ?? m.type}</Badge>,
    },
    {
      key: "ref",
      header: "Reference",
      hideBelow: "md",
      cell: (m) => {
        const href = movementHref(m);
        const label = m.referenceNumber ?? m.note ?? "—";
        return href ? (
          <Link href={href} onClick={(e) => e.stopPropagation()} className="font-mono text-[12.5px] text-primary hover:underline">
            {label}
          </Link>
        ) : (
          <span className="text-[13px] text-muted-foreground">{label}</span>
        );
      },
    },
    { key: "loc", header: "Location", hideBelow: "lg", cell: (m) => <span className="text-[13px] text-muted-foreground">{m.locationName}</span> },
    { key: "user", header: "By", hideBelow: "lg", cell: (m) => <span className="text-[13px] text-muted-foreground">{m.userName ?? "—"}</span> },
    {
      key: "qty",
      header: "Qty",
      numeric: true,
      cell: (m) => (
        <span className={cn("font-semibold", m.quantity < 0 ? "text-destructive" : "text-success-soft-foreground")}>
          {m.quantity > 0 ? "+" : ""}
          {formatQty(m.quantity)}
        </span>
      ),
    },
    { key: "cost", header: "Unit cost", numeric: true, hideBelow: "md", cell: (m) => <Money value={m.unitCost} tone="muted" /> },
  ];

  return (
    <>
      <PageHeader
        title="Stock movements"
        description="Every unit in and out — sales, purchases, returns, adjustments and transfers."
      >
        {productId && (
          <div className="flex">
            <Badge variant="outline" className="gap-2 py-1 pr-1 pl-3 text-[13px]">
              Product: {product.data?.name ?? "…"}
              <Button variant="ghost" size="icon-xs" className="size-5" onClick={() => router.replace("/inventory/movements")} aria-label="Clear product filter">
                <X />
              </Button>
            </Badge>
          </div>
        )}
      </PageHeader>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(m) => router.push(`/products/view?id=${m.productId}`)}
        toolbar={
          <>
            {!productId && <SearchInput value={q} onChange={reset(setQ)} placeholder="Search item, SKU or reference…" />}
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <LocationSelect value={locationId} onChange={reset(setLocationId)} allowAll className="sm:w-44" />
            <FilterSelect
              value={type}
              onChange={reset(setType)}
              allLabel="All movement types"
              options={STOCK_MOVEMENT_TYPES.map((t) => ({ value: t, label: STOCK_MOVEMENT_LABELS[t] }))}
            />
          </>
        }
        pagination={{ page, pageSize: 50, total: data?.total ?? 0, onPageChange: setPage }}
        empty={<EmptyState icon={History} title="No stock movements" description="Movements are recorded automatically as you buy, sell and adjust stock." />}
      />
    </>
  );
}
