"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Barcode, Boxes, History, MoreHorizontal, Pencil, SlidersHorizontal, Tag, TrendingUp, Wallet } from "lucide-react";
import type { Paginated, Product, StockMovement } from "@shopbooks/shared";
import { STOCK_MOVEMENT_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { StatCard } from "@/components/stat-card";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { ActiveBadge, StockBadge } from "@/components/status-badge";
import { ProductThumb } from "@/components/product-thumb";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { cn, formatDate, formatPercent, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <ProductView />
    </React.Suspense>
  );
}

function ProductView() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const confirm = useConfirm();
  const money = useMoney();
  const { can } = useSession();
  const { data: p, isLoading, error, refetch } = useApiQuery<Product>(id ? `/products/${id}` : null);
  const movements = useApiQuery<Paginated<StockMovement>>(id ? "/inventory/movements" : null, { productId: id, pageSize: 8 });

  const remove = useApiMutation(() => api.del<{ ok: true; result?: string }>(`/products/${id}`), {
    invalidate: ["/products", "/inventory"],
    success: "Product removed",
    onSuccess: () => router.push("/products"),
  });
  const restore = useApiMutation(
    () =>
      api.put<Product>(`/products/${id}`, {
        ...p!,
        isActive: true,
        variants: p!.variants.map((v) => ({ ...v, isActive: true })),
      }),
    { invalidate: ["/products"], success: "Product restored" },
  );

  if (!id) return <ErrorState title="Nothing selected" message="No product selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !p) return <ErrorState message={error?.message ?? "Product not found"} onRetry={() => refetch()} />;

  const variants = p.hasVariants ? p.variants.filter((v) => v.isActive) : p.variants;
  const stock = variants.reduce((s, v) => s + v.stock, 0);
  const value = variants.reduce((s, v) => s + Math.round(v.stock * v.costPrice), 0);
  const prices = variants.map((v) => v.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgMargin =
    variants.length && variants.some((v) => v.price > 0)
      ? (variants.reduce((s, v) => s + (v.price > 0 ? (v.price - v.costPrice) / v.price : 0), 0) / variants.filter((v) => v.price > 0).length) * 100
      : null;
  const locations = Array.from(new Map(variants.flatMap((v) => v.stockByLocation).map((s) => [s.locationId, s.locationName])).entries());
  const unit = p.unitShortName ?? "";

  return (
    <>
      <PageHeader
        backHref="/products"
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: p.name }]}
        title={
          <span className="flex items-center gap-3">
            <ProductThumb url={p.imageUrl} className="size-12" />
            {p.name}
          </span>
        }
        badge={
          <>
            {!p.isActive && <ActiveBadge active={false} />}
            {p.type === "service" && <Badge variant="info">Service</Badge>}
          </>
        }
        description={[p.categoryName, p.brandName].filter(Boolean).join(" · ") || "Uncategorised"}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/products/labels?productId=${p.id}`}>
                <Barcode /> Labels
              </Link>
            </Button>
            {can("products.manage") && (
              <Button asChild>
                <Link href={`/products/edit?id=${p.id}`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            {(can("inventory.manage") || can("products.manage")) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {can("inventory.manage") && p.trackInventory && (
                    <DropdownMenuItem asChild>
                      <Link href={`/inventory/adjustments/new?productId=${p.id}`}>
                        <SlidersHorizontal /> Adjust stock
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href={`/inventory/movements?productId=${p.id}`}>
                      <History /> Stock history
                    </Link>
                  </DropdownMenuItem>
                  {can("products.manage") && (
                    <>
                      <DropdownMenuSeparator />
                      {p.isActive ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={async () => {
                            const ok = await confirm({
                              title: `Remove ${p.name}?`,
                              description: "Products with sales or stock history are archived instead of deleted, so your books stay intact.",
                              tone: "destructive",
                              confirmText: "Remove",
                            });
                            if (ok) remove.mutate();
                          }}
                        >
                          <Archive /> Archive / delete
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => restore.mutate()}>
                          <Archive /> Restore
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Selling price"
          value={minPrice === maxPrice ? money.format(minPrice) : `${money.formatCompact(minPrice)}–${money.formatCompact(maxPrice)}`}
          icon={Tag}
          tone="primary"
          sublabel={p.taxRate ? `incl. ${p.taxRate}% tax rate` : "no tax"}
        />
        <StatCard label="Average margin" value={formatPercent(avgMargin)} icon={TrendingUp} tone="success" sublabel="on selling price" />
        <StatCard
          label="On hand"
          value={p.trackInventory ? `${formatQty(stock)} ${unit}` : "—"}
          icon={Boxes}
          tone={p.trackInventory && stock <= 0 ? "danger" : "info"}
          sublabel={p.trackInventory ? `${locations.length} location${locations.length === 1 ? "" : "s"}` : "not tracked"}
        />
        <StatCard label="Stock value" value={money.format(value)} icon={Wallet} tone="neutral" sublabel="at average cost" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <SectionCard title={p.hasVariants ? `Variants (${variants.length})` : "Pricing & stock"} flush>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{p.hasVariants ? "Variant" : "SKU"}</TableHead>
                  <TableHead align="right">Price</TableHead>
                  <TableHead align="right" className="hidden md:table-cell">
                    Cost
                  </TableHead>
                  <TableHead align="right" className="hidden lg:table-cell">
                    Wholesale
                  </TableHead>
                  {p.trackInventory && locations.length > 1
                    ? locations.map(([lid, lname]) => (
                        <TableHead key={lid} align="right" className="hidden sm:table-cell">
                          {lname}
                        </TableHead>
                      ))
                    : null}
                  {p.trackInventory && <TableHead align="right">Stock</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.id} className="hover:bg-transparent">
                    <TableCell>
                      {p.hasVariants && <p className="font-medium">{v.name}</p>}
                      <p className="font-mono text-[11.5px] text-muted-foreground">
                        {[v.sku, v.barcode].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </TableCell>
                    <TableCell numeric className="font-medium">
                      <Money value={v.price} />
                      {v.mrp ? <p className="text-[11px] text-muted-foreground line-through">{money.format(v.mrp)}</p> : null}
                    </TableCell>
                    <TableCell numeric className="hidden md:table-cell">
                      <Money value={v.costPrice} tone="muted" />
                    </TableCell>
                    <TableCell numeric className="hidden lg:table-cell">
                      <Money value={v.wholesalePrice} dashZero />
                    </TableCell>
                    {p.trackInventory && locations.length > 1
                      ? locations.map(([lid]) => (
                          <TableCell key={lid} numeric className="hidden text-muted-foreground sm:table-cell">
                            {formatQty(v.stockByLocation.find((s) => s.locationId === lid)?.quantity ?? 0)}
                          </TableCell>
                        ))
                      : null}
                    {p.trackInventory && (
                      <TableCell numeric>
                        <div className="flex items-center justify-end gap-2">
                          <span className={cn("font-semibold", v.stock <= 0 && "text-destructive")}>{formatQty(v.stock)}</span>
                          <StockBadge quantity={v.stock} reorderLevel={v.reorderLevel} className="hidden xl:inline-flex" />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>

          {p.trackInventory && (
            <SectionCard
              title="Recent stock movements"
              flush
              action={
                <Button variant="ghost" size="xs" asChild>
                  <Link href={`/inventory/movements?productId=${p.id}`}>View all</Link>
                </Button>
              }
            >
              {movements.data && movements.data.data.length > 0 ? (
                <Table>
                  <TableBody>
                    {movements.data.data.map((m) => (
                      <TableRow key={m.id} className="hover:bg-transparent">
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(m.date)}</TableCell>
                        <TableCell>
                          <p className="text-sm">{STOCK_MOVEMENT_LABELS[m.type]}</p>
                          <p className="text-xs text-muted-foreground">
                            {[p.hasVariants ? m.variantName : null, m.locationName, m.referenceNumber].filter(Boolean).join(" · ")}
                          </p>
                        </TableCell>
                        <TableCell numeric className={cn("font-semibold", m.quantity < 0 ? "text-destructive" : "text-success-soft-foreground")}>
                          {m.quantity > 0 ? "+" : ""}
                          {formatQty(m.quantity)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState compact icon={History} title={movements.isLoading ? "Loading…" : "No stock movements yet"} />
              )}
            </SectionCard>
          )}
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title="Details">
            <KeyValue
              items={[
                { label: "Type", value: p.type === "service" ? "Service" : "Goods" },
                { label: "Category", value: p.categoryName },
                { label: "Brand", value: p.brandName },
                { label: "Unit", value: p.unitName ? `${p.unitName} (${p.unitShortName})` : "Pieces" },
                { label: "Tax rate", value: `${p.taxRate}%` },
                { label: "Inventory", value: p.trackInventory ? "Tracked" : "Not tracked" },
                { label: "Options", value: p.options.map((o) => `${o.name}: ${o.values.join(", ")}`).join(" · "), hideEmpty: true },
                { label: "Tags", value: p.tags, hideEmpty: true },
                { label: "Description", value: p.description ? <span className="whitespace-pre-line">{p.description}</span> : null, hideEmpty: true },
                { label: "Last updated", value: formatDate(p.updatedAt) },
              ]}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
