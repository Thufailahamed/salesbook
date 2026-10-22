"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Barcode as BarcodeIcon, History, MapPin, MoreHorizontal, Pencil, SlidersHorizontal } from "lucide-react";
import type { Category, Paginated, Product, StockMovement, Variant } from "@shopbooks/shared";
import { STOCK_MOVEMENT_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { ActiveBadge, StockBadge } from "@/components/status-badge";
import { Barcode } from "@/components/barcode";
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
import { api, assetUrl } from "@/lib/api";
import { cn, formatDate, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <ProductView />
    </React.Suspense>
  );
}

/** Splits a selling price into cost, tax and profit (tax-inclusive prices carry the tax inside). */
function priceAnatomy(v: Pick<Variant, "price" | "costPrice">, taxRate: number, taxInclusive: boolean) {
  const tax = taxInclusive ? Math.round((v.price * taxRate) / (100 + taxRate)) : Math.round((v.price * taxRate) / 100);
  const net = taxInclusive ? v.price - tax : v.price;
  const profit = net - v.costPrice;
  return { tax, net, profit, margin: v.costPrice > 0 && net > 0 ? (profit / net) * 100 : null };
}

function ProductView() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const confirm = useConfirm();
  const money = useMoney();
  const { can, business } = useSession();
  const { data: p, isLoading, error, refetch } = useApiQuery<Product>(id ? `/products/${id}` : null);
  const movements = useApiQuery<Paginated<StockMovement>>(id ? "/inventory/movements" : null, { productId: id, pageSize: 8 });
  const categories = useApiQuery<Category[]>("/categories", undefined, { staleTime: 60_000 });

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
  const retail = variants.reduce((s, v) => s + Math.round(v.stock * v.price), 0);
  const prices = variants.map((v) => v.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const lead = variants.find((v) => v.price === minPrice) ?? variants[0]!;
  const anatomy = priceAnatomy(lead, p.taxRate, business.taxInclusive);
  const margins = variants.map((v) => priceAnatomy(v, p.taxRate, business.taxInclusive).margin).filter((m): m is number => m != null);
  const avgMargin = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : null;
  const unit = p.unitShortName ?? "";
  const color = p.categoryId ? (categories.data ?? []).find((c) => c.id === p.categoryId)?.color ?? null : null;
  const code = lead.barcode || lead.sku;
  const reorder = variants.reduce((s, v) => s + (v.reorderLevel ?? 0), 0);

  // stock per location, summed over variants
  const byLocation = Array.from(
    variants
      .flatMap((v) => v.stockByLocation)
      .reduce((m, s) => m.set(s.locationId, { name: s.locationName, qty: (m.get(s.locationId)?.qty ?? 0) + s.quantity }), new Map<string, { name: string; qty: number }>())
      .entries(),
  );
  const locMax = Math.max(1, reorder * 2, ...byLocation.map(([, l]) => l.qty));
  const locations = byLocation.map(([lid, l]) => [lid, l.name] as const);
  const status = !p.trackInventory ? null : stock <= 0 ? "out" : reorder > 0 && stock <= reorder ? "low" : "ok";

  return (
    <>
      <PageHeader
        backHref="/products"
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: p.name }]}
        title={p.name}
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
                <BarcodeIcon /> Labels
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

      {/* ------------------------------------------------ hero */}
      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid overflow-hidden rounded-[24px] bg-card shadow-[var(--shadow-card)] ring-1 ring-border md:grid-cols-[240px_minmax(0,1fr)]">
          {/* art + label */}
          <div className="flex items-center gap-3 border-b border-border p-4 md:flex-col md:items-stretch md:border-r md:border-b-0">
            <Art name={p.name} url={p.imageUrl} color={color} className="w-28 shrink-0 md:w-full" />
            {code ? (
              <div className="min-w-0 flex-1 rounded-xl bg-white px-3 pt-2.5 pb-2 text-black ring-1 ring-black/10 md:flex-none">
                <Barcode value={code} height={34} />
                <p className="mt-1 text-center font-mono text-[10.5px] tracking-[0.14em]">{code}</p>
              </div>
            ) : (
              <p className="flex-1 rounded-xl border border-dashed border-border-strong px-3 py-3 text-center text-[12px] text-muted-foreground md:flex-none">No SKU or barcode</p>
            )}
          </div>

          {/* price anatomy */}
          <div className="flex flex-col p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              {p.categoryName && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium">
                  <span className="size-1.5 rounded-full bg-muted-foreground/50" style={color ? { background: color } : undefined} />
                  {p.categoryName}
                </span>
              )}
              {p.brandName && <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground">{p.brandName}</span>}
              {p.hasVariants && <span className="rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground">{variants.length} variants</span>}
            </div>

            <p className="eyebrow mt-6">Selling price</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="figure text-[40px] leading-none sm:text-[48px]">
                {minPrice === maxPrice ? money.format(minPrice) : `${money.format(minPrice)} – ${money.format(maxPrice)}`}
              </span>
              {lead.mrp ? <span className="num text-[15px] text-muted-foreground line-through">{money.format(lead.mrp)}</span> : null}
            </p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {p.taxRate ? `${business.taxInclusive ? "Includes" : "Plus"} ${p.taxRate}% tax` : "No tax"}
              {lead.wholesalePrice ? <> · wholesale {money.format(lead.wholesalePrice)}</> : null}
            </p>

            <div className="mt-auto pt-7">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium">
                  Where {p.hasVariants ? `each ${money.format(lead.price)}` : "the money"} goes
                </span>
                <span className={cn("num font-semibold", anatomy.margin == null ? "text-muted-foreground" : anatomy.margin < 15 ? "text-warning-soft-foreground" : "text-success-soft-foreground")}>
                  {anatomy.margin == null ? "No cost set" : `${Math.round(anatomy.margin)}% margin`}
                </span>
              </div>
              <PriceBar price={lead.price} cost={lead.costPrice} tax={anatomy.tax} profit={anatomy.profit} inclusive={business.taxInclusive} />
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
                <Legend swatch="bg-foreground/30" label="Cost" value={lead.costPrice > 0 ? money.format(lead.costPrice) : "not set"} />
                {p.taxRate > 0 && <Legend swatch="bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_3px,transparent_3px_6px)] ring-1 ring-border-strong" label="Tax" value={money.format(anatomy.tax)} />}
                <Legend swatch={anatomy.profit < 0 ? "bg-destructive" : "bg-primary"} label="Profit" value={lead.costPrice > 0 ? money.format(anatomy.profit) : "—"} />
              </div>
              {lead.costPrice <= 0 && can("products.manage") && (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Add a cost price —{" "}
                  <Link href={`/products/edit?id=${p.id}`} className="font-medium text-primary hover:underline">
                    edit product
                  </Link>{" "}
                  — or receive it through a purchase to see your real margin.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* stock: the black card */}
        <div className="metal relative flex flex-col overflow-hidden rounded-[24px] p-6 sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_100%_0%,oklch(0.82_0.09_84/0.12),transparent)]" />
          <div className="relative flex items-center justify-between">
            <p className="text-[10.5px] font-semibold tracking-[0.18em] text-white/45 uppercase [font-stretch:115%]">On hand</p>
            {status && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  status === "out"
                    ? "bg-[oklch(0.66_0.18_25/0.2)] text-[oklch(0.82_0.1_25)]"
                    : status === "low"
                      ? "bg-[oklch(0.79_0.14_75/0.18)] text-[oklch(0.87_0.1_82)]"
                      : "bg-[oklch(0.7_0.13_155/0.16)] text-[oklch(0.82_0.12_155)]",
                )}
              >
                <span className={cn("size-1.5 rounded-full", status === "out" ? "bg-[oklch(0.7_0.18_25)]" : status === "low" ? "bg-[oklch(0.8_0.14_75)]" : "bg-[oklch(0.72_0.13_155)]")} />
                {status === "out" ? "Out of stock" : status === "low" ? "Running low" : "In stock"}
              </span>
            )}
          </div>
          {p.trackInventory ? (
            <>
              <p className="relative mt-3 flex items-baseline gap-2">
                <span className="figure text-gold text-[52px] leading-none">{formatQty(stock)}</span>
                <span className="text-[14px] text-white/50">{unit || "units"}</span>
              </p>
              <p className="relative mt-2 text-[12.5px] text-white/50">
                across {byLocation.length} location{byLocation.length === 1 ? "" : "s"}
                {reorder > 0 && <> · reorder at {formatQty(reorder)}</>}
              </p>
              <dl className="relative mt-auto grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
                <div>
                  <dt className="text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">Value at cost</dt>
                  <dd className="num mt-1 text-[15px] font-semibold text-white/90">{money.format(value)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">Sells for</dt>
                  <dd className="num mt-1 text-[15px] font-semibold text-white/90">{money.format(retail)}</dd>
                </div>
              </dl>
              {can("inventory.manage") && (
                <Button asChild variant="highlight" className="relative mt-5 w-full">
                  <Link href={`/inventory/adjustments/new?productId=${p.id}`}>
                    <SlidersHorizontal /> Adjust stock
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <div className="relative mt-4">
              <p className="figure text-[30px] leading-none text-white/85">{p.type === "service" ? "Service" : "Not tracked"}</p>
              <p className="mt-2 text-[12.5px] text-white/50">Stock isn&apos;t counted for this {p.type === "service" ? "service" : "item"}, so it never runs out at the counter.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          {p.trackInventory && byLocation.length > 0 && (
            <SectionCard title="Stock by location" description={reorder > 0 ? `The line marks the reorder level (${formatQty(reorder)})` : undefined}>
              <ul className="grid gap-4">
                {byLocation.map(([lid, l]) => {
                  const pct = Math.max(l.qty > 0 ? 2 : 0, (l.qty / locMax) * 100);
                  const low = reorder > 0 && l.qty <= reorder;
                  return (
                    <li key={lid}>
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="flex items-center gap-2">
                          <MapPin className="size-3.5 text-muted-foreground" />
                          {l.name}
                        </span>
                        <span className={cn("num font-semibold", l.qty <= 0 ? "text-destructive" : low && "text-warning-soft-foreground")}>
                          {formatQty(l.qty)} {unit}
                        </span>
                      </div>
                      <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", l.qty <= 0 ? "bg-destructive" : low ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
                        {reorder > 0 && <span className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${(reorder / locMax) * 100}%` }} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}

          <SectionCard title={p.hasVariants ? `Variants (${variants.length})` : "Pricing & codes"} flush>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{p.hasVariants ? "Variant" : "SKU · barcode"}</TableHead>
                  <TableHead align="right">Price</TableHead>
                  <TableHead align="right" className="hidden md:table-cell">
                    Cost
                  </TableHead>
                  <TableHead align="right" className="hidden sm:table-cell">
                    Margin
                  </TableHead>
                  <TableHead align="right" className="hidden lg:table-cell">
                    Wholesale
                  </TableHead>
                  {p.trackInventory && locations.length > 1
                    ? locations.map(([lid, lname]) => (
                        <TableHead key={lid} align="right" className="hidden xl:table-cell">
                          {lname}
                        </TableHead>
                      ))
                    : null}
                  {p.trackInventory && <TableHead align="right">Stock</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => {
                  const m = priceAnatomy(v, p.taxRate, business.taxInclusive).margin;
                  return (
                    <TableRow key={v.id} className="hover:bg-transparent">
                      <TableCell>
                        {p.hasVariants && <p className="font-medium">{v.name}</p>}
                        <p className="font-mono text-[11.5px] text-muted-foreground">{[v.sku, v.barcode].filter(Boolean).join(" · ") || "—"}</p>
                      </TableCell>
                      <TableCell numeric className="font-semibold">
                        <Money value={v.price} />
                        {v.mrp ? <p className="text-[11px] font-normal text-muted-foreground line-through">{money.format(v.mrp)}</p> : null}
                      </TableCell>
                      <TableCell numeric className="hidden md:table-cell">
                        {v.costPrice > 0 ? <Money value={v.costPrice} tone="muted" /> : <span className="text-xs text-muted-foreground">not set</span>}
                      </TableCell>
                      <TableCell numeric className="hidden sm:table-cell">
                        {m == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={cn("num", m < 0 ? "text-destructive" : m < 15 ? "text-warning-soft-foreground" : "text-success-soft-foreground")}>{Math.round(m)}%</span>
                        )}
                      </TableCell>
                      <TableCell numeric className="hidden lg:table-cell">
                        <Money value={v.wholesalePrice} dashZero />
                      </TableCell>
                      {p.trackInventory && locations.length > 1
                        ? locations.map(([lid]) => (
                            <TableCell key={lid} numeric className="hidden text-muted-foreground xl:table-cell">
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
                  );
                })}
              </TableBody>
            </Table>
          </SectionCard>

          {p.trackInventory && (
            <SectionCard
              title="Stock history"
              description="Every unit in and out, newest first"
              action={
                <Button variant="ghost" size="xs" asChild>
                  <Link href={`/inventory/movements?productId=${p.id}`}>View all</Link>
                </Button>
              }
            >
              {movements.data && movements.data.data.length > 0 ? (
                <ol className="relative">
                  <span className="absolute top-2 bottom-2 left-[11px] w-px bg-border" aria-hidden="true" />
                  {movements.data.data.map((m) => {
                    const inbound = m.quantity > 0;
                    return (
                      <li key={m.id} className="relative flex items-start gap-4 py-2.5">
                        <span
                          className={cn(
                            "relative z-10 mt-0.5 flex size-[23px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold ring-4 ring-card",
                            inbound ? "bg-success-soft text-success-soft-foreground" : "bg-destructive-soft text-destructive-soft-foreground",
                          )}
                        >
                          {inbound ? "+" : "−"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-medium">{STOCK_MOVEMENT_LABELS[m.type]}</p>
                          <p className="truncate text-[12px] text-muted-foreground">
                            {[formatDate(m.date), p.hasVariants ? m.variantName : null, m.locationName, m.referenceNumber].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className={cn("num pt-0.5 text-[14px] font-semibold", inbound ? "text-success-soft-foreground" : "text-destructive-soft-foreground")}>
                          {inbound ? "+" : ""}
                          {formatQty(m.quantity)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
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
                { label: "Average margin", value: avgMargin == null ? "Set a cost to see it" : `${Math.round(avgMargin)}%` },
                { label: "Options", value: p.options.map((o) => `${o.name}: ${o.values.join(", ")}`).join(" · "), hideEmpty: true },
                { label: "Description", value: p.description ? <span className="whitespace-pre-line">{p.description}</span> : null, hideEmpty: true },
                { label: "Added", value: formatDate(p.createdAt) },
                { label: "Last updated", value: formatDate(p.updatedAt) },
              ]}
            />
            {p.tags && (
              <div className="mt-5 flex flex-wrap gap-1.5 border-t border-border pt-4">
                {p.tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((t) => (
                    <span key={t} className="rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground">
                      #{t}
                    </span>
                  ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- pieces

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
}

function Art({ name, url, color, className }: { name: string; url: string | null; color: string | null; className?: string }) {
  return (
    <div
      className={cn("relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[16px] bg-[radial-gradient(120%_90%_at_30%_0%,var(--card),var(--muted))] ring-1 ring-border", className)}
      style={!url && color ? { background: `radial-gradient(120% 90% at 30% 0%, var(--card), color-mix(in oklch, ${color} 18%, var(--muted)))` } : undefined}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(url)!} alt="" className="size-full object-cover" />
      ) : (
        <span
          className={cn("text-[32px] font-semibold md:text-[56px] tracking-[-0.05em] [font-stretch:125%]", !color && "text-foreground/20")}
          style={color ? { color: `color-mix(in oklch, ${color} 55%, var(--foreground))`, opacity: 0.55 } : undefined}
        >
          {initials(name)}
        </span>
      )}
    </div>
  );
}

function PriceBar({ price, cost, tax, profit, inclusive }: { price: number; cost: number; tax: number; profit: number; inclusive: boolean }) {
  const whole = Math.max(1, inclusive ? price : price + tax);
  const pct = (n: number) => `${Math.max(0, (n / whole) * 100)}%`;
  return (
    <div className="mt-2.5 flex h-3.5 w-full overflow-hidden rounded-full bg-muted">
      {cost > 0 && <span className="h-full bg-foreground/30" style={{ width: pct(Math.min(cost, inclusive ? price - tax : price)) }} />}
      {tax > 0 && <span className="h-full bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_3px,transparent_3px_6px)]" style={{ width: pct(tax) }} />}
      {cost > 0 && <span className={cn("h-full", profit < 0 ? "bg-destructive" : "bg-primary")} style={{ width: pct(Math.abs(profit)) }} />}
    </div>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("size-2.5 rounded-[3px]", swatch)} />
      {label} <span className="num font-medium text-foreground">{value}</span>
    </span>
  );
}
