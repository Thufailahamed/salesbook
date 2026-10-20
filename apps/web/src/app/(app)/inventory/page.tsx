"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Boxes, Download, PackageSearch, SlidersHorizontal, Tag, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { Category, Paginated, StockLevelRow } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { FilterSelect, SearchInput } from "@/components/filters";
import { LocationSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { StockBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { cn, downloadFile, formatQty, toCSV } from "@/lib/utils";

type StockList = Paginated<StockLevelRow> & { totals: { quantity: number; value: number; retailValue: number } };

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <StockPage />
    </React.Suspense>
  );
}

function StockPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const money = useMoney();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = React.useState<string | undefined>(undefined);
  const [stock, setStock] = React.useState<string | undefined>(params.get("stock") ?? undefined);
  const [exporting, setExporting] = React.useState(false);
  const categories = useApiQuery<Category[]>("/categories", undefined, { staleTime: 60_000 });

  const filters = { q, locationId, categoryId, stock };
  const { data, isLoading, isFetching } = useApiQuery<StockList>("/inventory/stock", { page, pageSize: 50, ...filters });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await api.get<StockList>("/inventory/stock", { ...filters, page: 1, pageSize: 500 });
      downloadFile(
        "stock.csv",
        toCSV([
          ["Product", "Variant", "SKU", "Barcode", "Category", "Quantity", "Reorder level", "Unit cost", "Value", "Price", "Retail value"],
          ...all.data.map((r) => [
            r.productName,
            r.variantName,
            r.sku,
            r.barcode,
            r.categoryName,
            r.quantity,
            r.reorderLevel,
            money.toMajor(r.costPrice),
            money.toMajor(r.value),
            money.toMajor(r.price),
            money.toMajor(r.retailValue),
          ]),
        ]),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<StockLevelRow>[] = [
    {
      key: "product",
      header: "Item",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {r.productName}
            {r.variantName && <span className="font-normal text-muted-foreground"> · {r.variantName}</span>}
          </p>
          <p className="truncate font-mono text-[11.5px] text-muted-foreground">{r.sku ?? "—"}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", hideBelow: "lg", cell: (r) => <span className="text-[13px] text-muted-foreground">{r.categoryName ?? "—"}</span> },
    {
      key: "qty",
      header: "On hand",
      numeric: true,
      cell: (r) => (
        <span
          className={cn(
            "font-semibold",
            r.quantity <= 0 ? "text-destructive" : r.reorderLevel !== null && r.quantity <= r.reorderLevel ? "text-warning-soft-foreground" : undefined,
          )}
        >
          {formatQty(r.quantity)}
        </span>
      ),
    },
    { key: "reorder", header: "Reorder at", numeric: true, hideBelow: "md", cell: (r) => <span className="text-muted-foreground">{r.reorderLevel ?? "—"}</span> },
    { key: "cost", header: "Avg cost", numeric: true, hideBelow: "lg", cell: (r) => <Money value={r.costPrice} tone="muted" /> },
    { key: "value", header: "Value", numeric: true, cell: (r) => <Money value={r.value} /> },
    { key: "retail", header: "Retail value", numeric: true, hideBelow: "md", cell: (r) => <Money value={r.retailValue} tone="muted" /> },
    { key: "status", header: "", width: 120, hideBelow: "sm", cell: (r) => <StockBadge quantity={r.quantity} reorderLevel={r.reorderLevel} /> },
  ];

  const t = data?.totals;
  return (
    <>
      <PageHeader
        title="Stock"
        description="What's on the shelves, what it cost and what it will sell for."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} loading={exporting}>
              <Download /> Export
            </Button>
            {can("inventory.manage") && (
              <>
                <Button variant="outline" asChild className="hidden sm:inline-flex">
                  <Link href="/inventory/transfers/new">
                    <ArrowLeftRight /> Transfer
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/inventory/adjustments/new">
                    <SlidersHorizontal /> Adjust stock
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard size="sm" label="Units on hand" value={formatQty(t?.quantity ?? 0)} icon={Boxes} tone="info" loading={isLoading} />
        <StatCard size="sm" label="Stock value (cost)" value={money.format(t?.value)} icon={Wallet} tone="primary" loading={isLoading} href="/reports/inventory" />
        <StatCard
          size="sm"
          label="Retail value"
          value={money.format(t?.retailValue)}
          icon={Tag}
          tone="success"
          loading={isLoading}
          sublabel={t && t.retailValue > 0 ? `${money.formatCompact(t.retailValue - t.value)} potential margin` : undefined}
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.variantId + (r.locationId ?? "")}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/products/view?id=${r.productId}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search products or SKU…" />
            <LocationSelect value={locationId} onChange={reset(setLocationId)} allowAll className="sm:w-48" />
            <FilterSelect
              value={categoryId}
              onChange={reset(setCategoryId)}
              allLabel="All categories"
              options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterSelect
              value={stock}
              onChange={reset(setStock)}
              allLabel="Any stock level"
              options={[
                { value: "in", label: "In stock" },
                { value: "low", label: "Low stock" },
                { value: "out", label: "Out of stock" },
                { value: "negative", label: "Negative stock" },
              ]}
            />
          </>
        }
        pagination={{ page, pageSize: 50, total: data?.total ?? 0, onPageChange: setPage }}
        footer={
          t && (
            <TableRow className="hover:bg-transparent">
              <TableCell>Total</TableCell>
              <TableCell className="hidden lg:table-cell" />
              <TableCell numeric>{formatQty(t.quantity)}</TableCell>
              <TableCell className="hidden md:table-cell" />
              <TableCell className="hidden lg:table-cell" />
              <TableCell numeric>
                <Money value={t.value} />
              </TableCell>
              <TableCell numeric className="hidden md:table-cell">
                <Money value={t.retailValue} />
              </TableCell>
              <TableCell className="hidden sm:table-cell" />
            </TableRow>
          )
        }
        empty={
          <EmptyState
            icon={PackageSearch}
            title={q || stock || categoryId ? "No matching stock" : "No stocked items yet"}
            description={q || stock || categoryId ? "Try different filters." : "Products that track inventory appear here once they're created."}
          />
        }
      />
    </>
  );
}
