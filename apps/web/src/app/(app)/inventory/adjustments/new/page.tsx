"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AdjustmentReason, Product, SellableItem, StockAdjustment, StockAdjustmentInput } from "@shopbooks/shared";
import { ADJUSTMENT_REASONS, ADJUSTMENT_REASON_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field } from "@/components/form-field";
import { VariantPicker } from "@/components/variant-picker";
import { LocationSelect } from "@/components/entity-selects";
import { QtyInput } from "@/components/qty-input";
import { MoneyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/empty-state";
import { PageLoader } from "@/components/loading";
import { useBusinessToday } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { cn, formatQty } from "@/lib/utils";

type Mode = "count" | "add" | "remove";

const DEFAULT_MODE: Record<AdjustmentReason, Mode> = {
  opening: "add",
  count: "count",
  damage: "remove",
  theft: "remove",
  expired: "remove",
  internal_use: "remove",
  gift: "remove",
  found: "add",
  correction: "count",
  other: "count",
};

interface Line {
  variantId: string;
  name: string;
  variantName: string;
  sku: string | null;
  stock: number;
  costPrice: number;
  allowDecimal: boolean;
  /** counted quantity (count mode) or the absolute change (add/remove) */
  qty: number;
  unitCost: number;
}

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <NewAdjustment />
    </React.Suspense>
  );
}

function NewAdjustment() {
  const router = useRouter();
  const params = useSearchParams();
  const today = useBusinessToday();
  const { locationId: sessionLocation } = useSession();
  const [locationId, setLocationId] = React.useState<string | undefined>(sessionLocation || undefined);
  const [reason, setReason] = React.useState<AdjustmentReason>((params.get("reason") as AdjustmentReason) || "count");
  const [mode, setMode] = React.useState<Mode>(DEFAULT_MODE[reason]);
  const [date, setDate] = React.useState(today);
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);

  // preload a product's variants (from the product page)
  const productId = params.get("productId");
  const product = useApiQuery<Product>(productId ? `/products/${productId}` : null);
  const preloaded = React.useRef(false);
  React.useEffect(() => {
    const p = product.data;
    if (!p || preloaded.current || !locationId) return;
    preloaded.current = true;
    setLines(
      p.variants
        .filter((v) => v.isActive)
        .map((v) => {
          const stock = v.stockByLocation.find((s) => s.locationId === locationId)?.quantity ?? 0;
          return {
            variantId: v.id,
            name: p.name,
            variantName: p.hasVariants ? v.name : "",
            sku: v.sku,
            stock,
            costPrice: v.costPrice,
            allowDecimal: p.allowDecimal,
            qty: mode === "count" ? stock : 0,
            unitCost: v.costPrice,
          };
        }),
    );
  }, [product.data, locationId, mode]);

  const add = (i: SellableItem) => {
    if (!i.trackInventory) {
      toast.error(`${i.displayName} doesn't track inventory`);
      return;
    }
    setLines((ls) =>
      ls.some((l) => l.variantId === i.variantId)
        ? ls
        : [
            ...ls,
            {
              variantId: i.variantId,
              name: i.productName,
              variantName: i.variantName,
              sku: i.sku,
              stock: i.stock,
              costPrice: i.costPrice,
              allowDecimal: i.allowDecimal,
              qty: mode === "count" ? i.stock : 1,
              unitCost: i.costPrice,
            },
          ],
    );
  };
  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.variantId === id ? { ...l, ...patch } : l)));

  const change = (l: Line) => (mode === "count" ? l.qty - l.stock : mode === "add" ? l.qty : -l.qty);
  const lineValue = (l: Line) => {
    const c = change(l);
    return Math.round(c * (c > 0 ? l.unitCost : l.costPrice));
  };
  const total = lines.reduce((s, l) => s + lineValue(l), 0);
  const effective = lines.filter((l) => change(l) !== 0);

  const save = useApiMutation((body: StockAdjustmentInput) => api.post<StockAdjustment>("/inventory/adjustments", body), {
    invalidate: ["/inventory", "/products", "/reports", "/accounting"],
    success: (a) => `Adjustment ${a.number} posted`,
    onSuccess: (a) => router.push(`/inventory/adjustments/view?id=${a.id}`),
  });

  const submit = () => {
    if (!locationId) return toast.error("Choose a location");
    if (effective.length === 0) return toast.error("Nothing to adjust — every line matches current stock");
    save.mutate({
      locationId,
      date,
      reason,
      note: note.trim() || null,
      lines: effective.map((l) =>
        mode === "count"
          ? { variantId: l.variantId, countedQuantity: l.qty, unitCost: change(l) > 0 ? l.unitCost : undefined }
          : { variantId: l.variantId, quantityChange: change(l), unitCost: change(l) > 0 ? l.unitCost : undefined },
      ),
    });
  };

  return (
    <>
      <PageHeader
        backHref="/inventory/adjustments"
        breadcrumbs={[{ label: "Adjustments", href: "/inventory/adjustments" }, { label: "New" }]}
        title="New stock adjustment"
        description="Correct stock levels. Increases are valued at the unit cost you enter; decreases at average cost."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <SectionCard
            title="Items"
            flush
            action={
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => {
                  if (!v) return;
                  const m = v as Mode;
                  setMode(m);
                  setLines((ls) => ls.map((l) => ({ ...l, qty: m === "count" ? l.stock : 0 })));
                }}
              >
                <ToggleGroupItem value="count">
                  <ClipboardList /> Count
                </ToggleGroupItem>
                <ToggleGroupItem value="add">
                  <Plus /> Add
                </ToggleGroupItem>
                <ToggleGroupItem value="remove">
                  <Minus /> Remove
                </ToggleGroupItem>
              </ToggleGroup>
            }
          >
            <div className="border-b border-border/70 px-5 py-4">
              <VariantPicker onSelect={add} locationId={locationId} showPrice="cost" includeServices={false} autoFocus disabled={!locationId} />
            </div>
            {lines.length === 0 ? (
              <EmptyState compact icon={ClipboardList} title="No items yet" description="Search or scan the items you're adjusting." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Item</TableHead>
                    <TableHead align="right">In stock</TableHead>
                    <TableHead align="right">{mode === "count" ? "Counted" : mode === "add" ? "Add" : "Remove"}</TableHead>
                    <TableHead align="right">Change</TableHead>
                    {mode !== "remove" && (
                      <TableHead align="right" className="hidden md:table-cell">
                        Unit cost
                      </TableHead>
                    )}
                    <TableHead align="right" className="hidden sm:table-cell">
                      Value
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => {
                    const c = change(l);
                    return (
                      <TableRow key={l.variantId} className="hover:bg-transparent">
                        <TableCell>
                          <p className="font-medium">
                            {l.name}
                            {l.variantName && <span className="font-normal text-muted-foreground"> · {l.variantName}</span>}
                          </p>
                          <p className="font-mono text-[11.5px] text-muted-foreground">{l.sku ?? "—"}</p>
                        </TableCell>
                        <TableCell numeric className="text-muted-foreground">
                          {formatQty(l.stock)}
                        </TableCell>
                        <TableCell className="w-28">
                          <QtyInput size="sm" value={l.qty} allowDecimal={l.allowDecimal} onChange={(v) => update(l.variantId, { qty: v })} />
                        </TableCell>
                        <TableCell numeric className={cn("font-semibold", c < 0 ? "text-destructive" : c > 0 ? "text-success-soft-foreground" : "text-muted-foreground")}>
                          {c > 0 ? "+" : ""}
                          {formatQty(c)}
                        </TableCell>
                        {mode !== "remove" && (
                          <TableCell className="hidden w-32 md:table-cell">
                            {c > 0 ? (
                              <MoneyInput hideSymbol className="h-8 text-right" value={l.unitCost} onChange={(v) => update(l.variantId, { unitCost: v })} />
                            ) : (
                              <span className="block text-right text-xs text-muted-foreground">avg cost</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell numeric className="hidden sm:table-cell">
                          <Money value={lineValue(l)} tone="signed" dashZero />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))} aria-label="Remove line">
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={mode !== "remove" ? 5 : 4}>
                      Net adjustment value
                    </TableCell>
                    <TableCell numeric className="hidden sm:table-cell">
                      <Money value={total} tone="signed" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </SectionCard>
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title="Adjustment">
            <div className="grid gap-4">
              <Field label="Location" required>
                <LocationSelect
                  value={locationId}
                  onChange={(v) => {
                    if (v !== locationId && lines.length) {
                      setLines([]);
                      toast.info("Lines cleared — stock levels differ per location");
                    }
                    setLocationId(v);
                  }}
                />
              </Field>
              <Field label="Reason" required>
                <Select
                  value={reason}
                  onValueChange={(v) => {
                    const r = v as AdjustmentReason;
                    setReason(r);
                    if (lines.length === 0) setMode(DEFAULT_MODE[r]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ADJUSTMENT_REASON_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date" htmlFor="adj-date">
                <Input id="adj-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Note" htmlFor="adj-note">
                <Textarea id="adj-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
              </Field>
            </div>
          </SectionCard>
          <div className="rounded-2xl bg-muted/50 p-4 text-[13px] text-muted-foreground">
            {reason === "opening"
              ? "Opening stock is credited to Opening Balance Equity."
              : "Losses are expensed to Inventory Adjustments & Shrinkage; gains reduce it."}
          </div>
          <Button size="lg" onClick={submit} loading={save.isPending} disabled={effective.length === 0}>
            Post adjustment
          </Button>
        </div>
      </div>
    </>
  );
}
