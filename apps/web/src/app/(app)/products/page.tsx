"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Barcode, Download, Package, Plus, Tags, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Brand, Category, Paginated, ProductListItem } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { FilterSelect, SearchInput } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { StatusBadge } from "@/components/status-badge";
import { ProductThumb } from "@/components/product-thumb";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { cn, downloadFile, formatQty, toCSV } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <ProductsPage />
    </React.Suspense>
  );
}

function ProductsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const money = useMoney();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string | undefined>(params.get("categoryId") ?? undefined);
  const [brandId, setBrandId] = React.useState<string | undefined>(undefined);
  const [stock, setStock] = React.useState<string | undefined>(params.get("stock") ?? undefined);
  const [status, setStatus] = React.useState<string | undefined>(undefined);
  const [type, setType] = React.useState<string | undefined>(undefined);
  const [exporting, setExporting] = React.useState(false);

  const categories = useApiQuery<Category[]>("/categories", undefined, { staleTime: 60_000 });
  const brands = useApiQuery<Brand[]>("/brands", undefined, { staleTime: 60_000 });
  const filters = { q, categoryId, brandId, stock, status, type };
  const { data, isLoading, isFetching } = useApiQuery<Paginated<ProductListItem>>("/products", { page, pageSize: 25, ...filters });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const filtered = !!(q || categoryId || brandId || stock || status || type);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await api.get<Paginated<ProductListItem>>("/products", { ...filters, page: 1, pageSize: 500 });
      downloadFile(
        "products.csv",
        toCSV([
          ["Name", "SKU", "Category", "Brand", "Type", "Variants", "Min price", "Max price", "Cost", "Stock", "Active"],
          ...all.data.map((p) => [
            p.name,
            p.sku,
            p.categoryName,
            p.brandName,
            p.type,
            p.variantCount,
            money.toMajor(p.priceMin),
            money.toMajor(p.priceMax),
            money.toMajor(p.costMin),
            p.trackInventory ? p.totalStock : "",
            p.isActive ? "yes" : "no",
          ]),
        ]),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<ProductListItem>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <ProductThumb url={p.imageUrl} />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {p.name}
              {!p.isActive && <span className="ml-2 text-xs font-normal text-muted-foreground">archived</span>}
            </p>
            <p className="truncate font-mono text-[11.5px] text-muted-foreground">
              {p.hasVariants ? `${p.variantCount} variants` : p.sku ?? "No SKU"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      hideBelow: "md",
      cell: (p) => (
        <div className="min-w-0 text-[13px]">
          <p className="truncate">{p.categoryName ?? <span className="text-muted-foreground">—</span>}</p>
          {p.brandName && <p className="truncate text-xs text-muted-foreground">{p.brandName}</p>}
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      numeric: true,
      cell: (p) =>
        p.priceMin === p.priceMax ? (
          <Money value={p.priceMin} />
        ) : (
          <span className="num">
            {money.format(p.priceMin)} – {money.format(p.priceMax)}
          </span>
        ),
    },
    { key: "cost", header: "Cost", numeric: true, hideBelow: "lg", cell: (p) => <Money value={p.costMin} tone="muted" /> },
    {
      key: "stock",
      header: "Stock",
      numeric: true,
      cell: (p) =>
        !p.trackInventory ? (
          <span className="text-xs text-muted-foreground">{p.type === "service" ? "Service" : "Not tracked"}</span>
        ) : (
          <span
            className={cn(
              "num font-medium",
              p.totalStock <= 0 ? "text-destructive" : p.lowStock ? "text-warning-soft-foreground" : "text-foreground",
            )}
          >
            {formatQty(p.totalStock)}
          </span>
        ),
    },
    {
      key: "status",
      header: "",
      hideBelow: "sm",
      width: 110,
      cell: (p) =>
        !p.trackInventory ? null : p.totalStock <= 0 ? (
          <StatusBadge variant="danger">Out</StatusBadge>
        ) : p.lowStock ? (
          <StatusBadge variant="warning">Low</StatusBadge>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything you sell, with prices, variants and stock on hand."
        actions={
          <>
            {can("products.manage") && (
              <Button variant="outline" asChild>
                <Link href="/products/quick-add"><Zap /> Quick add</Link>
              </Button>
            )}
            {can("products.manage") && (
              <Button variant="outline" asChild className="hidden sm:inline-flex">
                <Link href="/products/import"><Upload /> Import</Link>
              </Button>
            )}
            <Button variant="outline" onClick={exportCsv} loading={exporting}>
              <Download /> Export
            </Button>
            <Button variant="outline" asChild className="hidden sm:inline-flex">
              <Link href="/products/labels">
                <Barcode /> Labels
              </Link>
            </Button>
            {can("products.manage") && (
              <Button asChild>
                <Link href="/products/new">
                  <Plus /> New product
                </Link>
              </Button>
            )}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/products/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search name, SKU or barcode…" />
            <FilterSelect
              value={categoryId}
              onChange={reset(setCategoryId)}
              allLabel="All categories"
              options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterSelect
              value={brandId}
              onChange={reset(setBrandId)}
              allLabel="All brands"
              options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
              className="sm:w-36"
            />
            <FilterSelect
              value={stock}
              onChange={reset(setStock)}
              allLabel="Any stock"
              options={[
                { value: "in", label: "In stock" },
                { value: "low", label: "Low stock" },
                { value: "out", label: "Out of stock" },
              ]}
              className="sm:w-36"
            />
            <FilterSelect
              value={type}
              onChange={reset(setType)}
              allLabel="All types"
              options={[
                { value: "standard", label: "Goods" },
                { value: "service", label: "Services" },
              ]}
              className="sm:w-32"
            />
            <FilterSelect
              value={status}
              onChange={reset(setStatus)}
              allLabel="Active"
              options={[
                { value: "archived", label: "Archived" },
                { value: "all", label: "All" },
              ]}
              className="sm:w-32"
            />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        empty={
          <EmptyState
            icon={Package}
            title={filtered ? "No matching products" : "Your catalog is empty"}
            description={filtered ? "Try a different search or filter." : "Add your first product — simple items or ones with sizes and colours."}
            action={
              !filtered && can("products.manage") ? (
                <>
                  <Button size="sm" asChild>
                    <Link href="/products/new">
                      <Plus /> Add product
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/products/categories">
                      <Tags /> Set up categories
                    </Link>
                  </Button>
                </>
              ) : undefined
            }
          />
        }
      />
    </>
  );
}
