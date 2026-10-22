"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Barcode,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  List,
  MoreHorizontal,
  Package,
  PackageX,
  ScanBarcode,
  Plus,
  SlidersHorizontal,
  Tags,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { Brand, Category, Paginated, ProductListItem } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { FilterSelect, SearchInput } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApiQuery } from "@/hooks/use-api";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api, assetUrl } from "@/lib/api";
import { cn, downloadFile, formatNumber, formatQty, toCSV } from "@/lib/utils";

const PAGE_SIZE = 24;

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
  const [view, setView] = useLocalStorage<"list" | "grid">("sb.products.view", "list");
  const [exporting, setExporting] = React.useState(false);

  const categories = useApiQuery<Category[]>("/categories", undefined, { staleTime: 60_000 });
  const brands = useApiQuery<Brand[]>("/brands", undefined, { staleTime: 60_000 });
  const filters = { q, categoryId, brandId, stock, status, type };
  const { data, isLoading, isFetching } = useApiQuery<Paginated<ProductListItem>>("/products", { page, pageSize: PAGE_SIZE, ...filters });

  // catalog-wide counts for the summary strip and stock tabs (pageSize 1: only `total` is used)
  const countOf = (s?: string) => ({ page: 1, pageSize: 1, stock: s, status });
  const allCount = useApiQuery<Paginated<ProductListItem>>("/products", countOf(), { staleTime: 30_000 });
  const inCount = useApiQuery<Paginated<ProductListItem>>("/products", countOf("in"), { staleTime: 30_000 });
  const lowCount = useApiQuery<Paginated<ProductListItem>>("/products", countOf("low"), { staleTime: 30_000 });
  const outCount = useApiQuery<Paginated<ProductListItem>>("/products", countOf("out"), { staleTime: 30_000 });
  const valuation = useApiQuery<{ totals: { quantity: number; value: number; retailValue: number } }>(
    can("inventory.view") ? "/inventory/stock" : null,
    { page: 1, pageSize: 1 },
    { staleTime: 30_000 },
  );

  const colorOf = React.useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.color])), [categories.data]);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const moreFilters = [brandId, type, status].filter(Boolean).length;
  const filtered = !!(q || categoryId || brandId || stock || status || type);
  const clearAll = () => {
    setQ("");
    setCategoryId(undefined);
    setBrandId(undefined);
    setStock(undefined);
    setStatus(undefined);
    setType(undefined);
    setPage(1);
  };

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

  const open = (p: ProductListItem) => router.push(`/products/view?id=${p.id}`);
  const totals = valuation.data?.totals;
  const marginPct = totals && totals.retailValue > 0 ? ((totals.retailValue - totals.value) / totals.retailValue) * 100 : null;

  const columns: Column<ProductListItem>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <ProductArt name={p.name} url={p.imageUrl} color={p.categoryId ? colorOf.get(p.categoryId) : null} className="size-11 rounded-xl" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-medium">
              <span className="truncate">{p.name}</span>
              {!p.isActive && <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">Archived</span>}
            </p>
            <p className="truncate font-mono text-[11.5px] text-muted-foreground">
              {p.hasVariants ? `${p.variantCount} variants` : p.sku ?? "No SKU"}
              {p.type === "service" && " · service"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      hideBelow: "md",
      cell: (p) =>
        p.categoryName ? (
          <div className="min-w-0">
            <CategoryPill name={p.categoryName} color={p.categoryId ? colorOf.get(p.categoryId) : null} />
            {p.brandName && <p className="mt-1 truncate pl-1 text-xs text-muted-foreground">{p.brandName}</p>}
          </div>
        ) : (
          <span className="text-[13px] text-muted-foreground">{p.brandName ?? "—"}</span>
        ),
    },
    {
      key: "price",
      header: "Price",
      numeric: true,
      cell: (p) => (
        <div>
          {p.priceMin === p.priceMax ? (
            <Money value={p.priceMin} className="font-semibold" />
          ) : (
            <span className="num font-semibold">
              {money.format(p.priceMin)} – {money.format(p.priceMax)}
            </span>
          )}
          <Margin price={p.priceMin} cost={p.costMin} className="mt-0.5 block text-[11.5px]" />
        </div>
      ),
    },
    { key: "cost", header: "Cost", numeric: true, hideBelow: "lg", cell: (p) => <Money value={p.costMin} tone="muted" /> },
    { key: "stock", header: "Stock", align: "right", width: 150, cell: (p) => <StockState p={p} /> },
    {
      key: "go",
      header: "",
      width: 36,
      hideBelow: "sm",
      cell: () => <ChevronRight className="size-4 text-muted-foreground/40 transition-transform group-hover/row:translate-x-0.5" />,
    },
  ];

  const stockTabs = [
    { value: "all", label: "All", count: allCount.data?.total },
    { value: "in", label: "In stock", count: inCount.data?.total },
    { value: "low", label: "Running low", count: lowCount.data?.total },
    { value: "out", label: "Out of stock", count: outCount.data?.total },
  ];

  const toolbar = (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1">
          {stockTabs.map((t) => {
            const on = (stock ?? "all") === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => reset(setStock)(t.value === "all" ? undefined : t.value)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-all",
                  on ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.value === "low" && <span className="size-1.5 rounded-full bg-warning" />}
                {t.value === "out" && <span className="size-1.5 rounded-full bg-destructive" />}
                {t.label}
                <span className={cn("num text-[11.5px]", on ? "text-ink-foreground/60" : "text-muted-foreground/70")}>
                  {t.count == null ? "·" : formatNumber(t.count)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "list" | "grid")} aria-label="View" className="hidden sm:inline-flex">
          <ToggleGroupItem value="list" aria-label="List view">
            <List />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={reset(setQ)} placeholder="Search name, SKU or barcode…" className="sm:max-w-sm sm:flex-1" />
        <FilterSelect
          value={categoryId}
          onChange={reset(setCategoryId)}
          allLabel="All categories"
          options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={moreFilters ? "soft" : "outline"} className="justify-start sm:justify-center">
              <SlidersHorizontal /> Filters
              {moreFilters > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{moreFilters}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="grid w-64 gap-3">
            <FilterLabel label="Brand">
              <FilterSelect
                value={brandId}
                onChange={reset(setBrandId)}
                allLabel="All brands"
                options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                className="sm:w-full"
              />
            </FilterLabel>
            <FilterLabel label="Type">
              <FilterSelect
                value={type}
                onChange={reset(setType)}
                allLabel="Goods & services"
                options={[
                  { value: "standard", label: "Goods" },
                  { value: "service", label: "Services" },
                ]}
                className="sm:w-full"
              />
            </FilterLabel>
            <FilterLabel label="Status">
              <FilterSelect
                value={status}
                onChange={reset(setStatus)}
                allLabel="Active"
                options={[
                  { value: "archived", label: "Archived" },
                  { value: "all", label: "Active & archived" },
                ]}
                className="sm:w-full"
              />
            </FilterLabel>
          </PopoverContent>
        </Popover>
        {filtered && (
          <Button variant="ghost" className="text-muted-foreground" onClick={clearAll}>
            <X /> Clear
          </Button>
        )}
      </div>
    </div>
  );

  const empty = (
    <EmptyState
      icon={Package}
      title={filtered ? "No matching products" : "Your catalog is empty"}
      description={filtered ? "Try a different search or filter." : "Add your first product — simple items or ones with sizes and colours."}
      action={
        filtered ? (
          <Button size="sm" variant="outline" onClick={clearAll}>
            Clear filters
          </Button>
        ) : can("products.manage") ? (
          <>
            <Button size="sm" asChild>
              <Link href="/products/new">
                <Plus /> Add product
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/products/quick-add">
                <Zap /> Quick add
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
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything you sell, with prices, variants and stock on hand."
        actions={
          <>
            {can("products.manage") && (
              <Button variant="outline" asChild className="hidden sm:inline-flex">
                <Link href="/products/scan">
                  <ScanBarcode /> Scan to add
                </Link>
              </Button>
            )}
            {can("products.manage") && (
              <Button variant="outline" asChild className="hidden sm:inline-flex">
                <Link href="/products/quick-add">
                  <Zap /> Quick add
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {can("products.manage") && (
                  <DropdownMenuItem asChild>
                    <Link href="/products/scan" className="sm:hidden">
                      <ScanBarcode /> Scan to add
                    </Link>
                  </DropdownMenuItem>
                )}
                {can("products.manage") && (
                  <DropdownMenuItem asChild>
                    <Link href="/products/quick-add" className="sm:hidden">
                      <Zap /> Quick add
                    </Link>
                  </DropdownMenuItem>
                )}
                {can("products.manage") && (
                  <DropdownMenuItem asChild>
                    <Link href="/products/import">
                      <Upload /> Import from CSV
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={exportCsv} disabled={exporting}>
                  <Download /> {exporting ? "Exporting…" : "Export to CSV"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/products/labels">
                    <Barcode /> Print barcode labels
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/products/categories">
                    <Tags /> Categories &amp; brands
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      {/* summary strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can("inventory.view") && (
          <div className="metal col-span-2 rounded-[18px] p-5 lg:col-span-1">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-white/45 uppercase [font-stretch:115%]">Stock at cost</p>
            {totals ? (
              <p className="figure text-gold mt-2.5 text-[28px] leading-none">{money.format(totals.value)}</p>
            ) : (
              <Skeleton className="mt-2.5 h-7 w-32 bg-white/10" />
            )}
            <p className="mt-2 text-[12px] text-white/50">
              {totals ? (
                <>
                  Sells for <span className="num text-white/80">{money.format(totals.retailValue)}</span>
                  {marginPct != null && <> · {Math.round(marginPct)}% margin</>}
                </>
              ) : (
                " "
              )}
            </p>
          </div>
        )}
        <SummaryTile
          label="Products"
          value={allCount.data?.total}
          sub={totals ? `${formatQty(totals.quantity)} units on hand` : "in your catalog"}
          icon={Package}
          className="col-span-2 lg:col-span-1"
          on={!stock}
          onClick={() => reset(setStock)(undefined)}
        />
        <SummaryTile
          label="Running low"
          value={lowCount.data?.total}
          sub="at or below reorder level"
          icon={AlertTriangle}
          tone="warning"
          on={stock === "low"}
          onClick={() => reset(setStock)("low")}
        />
        <SummaryTile
          label="Out of stock"
          value={outCount.data?.total}
          sub="can't be sold right now"
          icon={PackageX}
          tone="danger"
          on={stock === "out"}
          onClick={() => reset(setStock)("out")}
        />
      </div>

      {view === "list" ? (
        <DataTable
          columns={columns}
          rows={data?.data}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          onRowClick={open}
          rowClassName={() => "group/row"}
          toolbar={toolbar}
          pagination={{ page, pageSize: PAGE_SIZE, total: data?.total ?? 0, onPageChange: setPage }}
          empty={empty}
        />
      ) : (
        <div className="overflow-hidden rounded-[18px] bg-card shadow-[var(--shadow-card)] ring-1 ring-border">
          <div className="border-b border-border px-4 py-3">{toolbar}</div>
          <div className={cn("p-4", isFetching && data && "opacity-60 transition-opacity")}>
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 rounded-[18px]" />
                ))}
              </div>
            ) : data && data.data.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                {data.data.map((p) => (
                  <ProductCard key={p.id} p={p} color={p.categoryId ? colorOf.get(p.categoryId) : null} onClick={() => open(p)} />
                ))}
              </div>
            ) : (
              empty
            )}
          </div>
          {data && data.total > PAGE_SIZE && <Pager page={page} total={data.total} onPage={setPage} />}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- pieces

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
}

/** Product image, or initials on a soft wash of the category colour. */
function ProductArt({
  name,
  url,
  color,
  className,
  textClassName = "text-[12px]",
}: {
  name: string;
  url: string | null;
  color?: string | null;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden bg-muted ring-1 ring-border", className)}
      style={!url && color ? { background: `color-mix(in oklch, ${color} 14%, var(--muted))` } : undefined}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(url)!} alt="" className="size-full object-cover" />
      ) : (
        <span
          className={cn("font-semibold tracking-[-0.03em] [font-stretch:125%]", !color && "text-muted-foreground", textClassName)}
          style={color ? { color: `color-mix(in oklch, ${color} 70%, var(--foreground))` } : undefined}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}

function CategoryPill({ name, color }: { name: string; color?: string | null }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium">
      <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" style={color ? { background: color } : undefined} />
      <span className="truncate">{name}</span>
    </span>
  );
}

function Margin({ price, cost, className }: { price: number; cost: number; className?: string }) {
  if (price <= 0 || cost <= 0) return <span className={cn("text-muted-foreground/60", className)}>No cost set</span>;
  const pct = ((price - cost) / price) * 100;
  return (
    <span className={cn("num", pct < 0 ? "text-destructive-soft-foreground" : pct < 15 ? "text-warning-soft-foreground" : "text-muted-foreground", className)}>
      {Math.round(pct)}% margin
    </span>
  );
}

function StockState({ p }: { p: ProductListItem }) {
  if (!p.trackInventory) return <span className="text-xs text-muted-foreground">{p.type === "service" ? "Service" : "Not tracked"}</span>;
  const out = p.totalStock <= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        out ? "bg-destructive-soft text-destructive-soft-foreground" : p.lowStock ? "bg-warning-soft text-warning-soft-foreground" : "bg-success-soft text-success-soft-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", out ? "bg-destructive" : p.lowStock ? "bg-warning" : "bg-success")} />
      {out ? "Out of stock" : <span className="num">{formatQty(p.totalStock)} {p.lowStock ? "· low" : "in stock"}</span>}
    </span>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  on,
  onClick,
  className,
}: {
  label: string;
  value: number | undefined;
  sub: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: "warning" | "danger";
  on: boolean;
  onClick: () => void;
  className?: string;
}) {
  const hot = (value ?? 0) > 0 && tone;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col rounded-[18px] bg-card p-5 text-left shadow-[var(--shadow-card)] ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]",
        on && "ring-2 ring-primary",
        className,
      )}
    >
      <span className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            hot === "warning" ? "bg-warning-soft text-warning-soft-foreground" : hot === "danger" ? "bg-destructive-soft text-destructive-soft-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-[15px]" strokeWidth={1.8} />
        </span>
      </span>
      {value == null ? <Skeleton className="mt-2.5 h-7 w-14" /> : <span className="figure mt-2 text-[28px] leading-none">{formatNumber(value)}</span>}
      <span className="mt-2 text-[12px] text-muted-foreground">{sub}</span>
    </button>
  );
}

function ProductCard({ p, color, onClick }: { p: ProductListItem; color?: string | null; onClick: () => void }) {
  const money = useMoney();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col rounded-[18px] bg-background p-1.5 text-left ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] hover:ring-border-strong",
        !p.isActive && "opacity-60",
      )}
    >
      <ProductArt name={p.name} url={p.imageUrl} color={color} className="aspect-[4/3] w-full rounded-[13px]" textClassName="text-[32px] opacity-70" />
      <div className="flex flex-1 flex-col px-2 pt-3 pb-2">
        {p.categoryName && (
          <span className="mb-1.5">
            <CategoryPill name={p.categoryName} color={color} />
          </span>
        )}
        <p className="line-clamp-2 text-[13.5px] leading-snug font-medium">{p.name}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{p.hasVariants ? `${p.variantCount} variants` : p.sku ?? "No SKU"}</p>
        <div className="mt-auto pt-3">
          <p className="figure text-[16px] leading-none">
            {money.format(p.priceMin)}
            {p.priceMax !== p.priceMin && <span className="text-muted-foreground"> +</span>}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Margin price={p.priceMin} cost={p.costMin} className="text-[11px]" />
            {p.trackInventory && (
              <span
                className={cn(
                  "num flex items-center gap-1 text-[11px]",
                  p.totalStock <= 0 ? "text-destructive" : p.lowStock ? "text-warning-soft-foreground" : "text-muted-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", p.totalStock <= 0 ? "bg-destructive" : p.lowStock ? "bg-warning" : "bg-success")} />
                {p.totalStock <= 0 ? "Out" : formatQty(p.totalStock)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function FilterLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
      <span>
        Showing <span className="num font-medium text-foreground">{from}–{to}</span> of <span className="num font-medium text-foreground">{formatNumber(total)}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="num px-2">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
