"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Barcode as BarcodeIcon, Printer, Trash2 } from "lucide-react";
import type { Product, SellableItem } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { VariantPicker } from "@/components/variant-picker";
import { QtyInput } from "@/components/qty-input";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/form-field";
import { PageLoader } from "@/components/loading";
import { Barcode } from "@/components/barcode";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { LABELS_STORAGE_KEY, type LabelJob, type LabelItem } from "@/lib/labels";

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <LabelsPage />
    </React.Suspense>
  );
}

function LabelsPage() {
  const productId = useSearchParams().get("productId");
  const money = useMoney();
  const { business } = useSession();
  const [items, setItems] = React.useState<LabelItem[]>([]);
  const [columns, setColumns] = React.useState("3");
  const [showPrice, setShowPrice] = React.useState(true);
  const [showName, setShowName] = React.useState(true);
  const [showBusiness, setShowBusiness] = React.useState(false);

  const preload = useApiQuery<Product>(productId ? `/products/${productId}` : null);
  const loaded = React.useRef(false);
  React.useEffect(() => {
    const p = preload.data;
    if (!p || loaded.current) return;
    loaded.current = true;
    setItems(
      p.variants
        .filter((v) => v.isActive)
        .map((v) => ({
          variantId: v.id,
          name: p.name,
          variantName: p.hasVariants ? v.name : "",
          code: v.barcode || v.sku || "",
          price: v.price,
          mrp: v.mrp,
          copies: Math.max(1, Math.round(v.stock)) || 1,
        })),
    );
  }, [preload.data]);

  const add = (i: SellableItem) =>
    setItems((list) => {
      const existing = list.find((x) => x.variantId === i.variantId);
      if (existing) return list.map((x) => (x.variantId === i.variantId ? { ...x, copies: x.copies + 1 } : x));
      return [
        ...list,
        { variantId: i.variantId, name: i.productName, variantName: i.variantName, code: i.barcode || i.sku || "", price: i.price, mrp: i.mrp, copies: 1 },
      ];
    });

  const total = items.reduce((s, i) => s + i.copies, 0);
  const missing = items.filter((i) => !i.code).length;

  const print = () => {
    const job: LabelJob = { items: items.filter((i) => i.code && i.copies > 0), columns: Number(columns), showPrice, showName, showBusiness };
    try {
      sessionStorage.setItem(LABELS_STORAGE_KEY, JSON.stringify(job));
    } catch {}
    window.open("/print/labels?autoprint=1", "_blank");
  };

  const sample = items.find((i) => i.code);

  return (
    <>
      <PageHeader
        title="Barcode labels"
        description="Print Code 128 labels on A4 sticker sheets. Scanners read them straight into the POS."
        actions={
          <Button onClick={print} disabled={total === 0 || items.every((i) => !i.code)}>
            <Printer /> Print {total > 0 ? `${total} labels` : ""}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <SectionCard title="Items" description="Search or scan to add. Quantities default to stock on hand." flush>
            <div className="border-b border-border/70 px-5 py-4">
              <VariantPicker onSelect={add} includeServices={false} />
            </div>
            {items.length === 0 ? (
              <EmptyState compact icon={BarcodeIcon} title={preload.isLoading ? "Loading product…" : "No items yet"} description="Add products to print labels for them." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden sm:table-cell">Code</TableHead>
                    <TableHead align="right">Price</TableHead>
                    <TableHead align="right">Copies</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.variantId} className="hover:bg-transparent">
                      <TableCell>
                        <p className="font-medium">{i.name}</p>
                        {i.variantName && <p className="text-xs text-muted-foreground">{i.variantName}</p>}
                      </TableCell>
                      <TableCell className="hidden font-mono text-[12.5px] sm:table-cell">
                        {i.code || <span className="text-destructive">No SKU / barcode</span>}
                      </TableCell>
                      <TableCell numeric>{money.format(i.price)}</TableCell>
                      <TableCell>
                        <QtyInput
                          size="sm"
                          steppers
                          min={0}
                          value={i.copies}
                          onChange={(v) => setItems((list) => list.map((x) => (x.variantId === i.variantId ? { ...x, copies: v } : x)))}
                          wrapperClassName="justify-end"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setItems((list) => list.filter((x) => x.variantId !== i.variantId))}
                          aria-label="Remove"
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
          {missing > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {missing} item{missing === 1 ? " has" : "s have"} no SKU or barcode and will be skipped. Edit the product to add one.
            </p>
          )}
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title="Layout">
            <div className="grid gap-4">
              <Field label="Labels per row">
                <Select value={columns} onValueChange={setColumns}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 per row (large)</SelectItem>
                    <SelectItem value="3">3 per row (65 per sheet style)</SelectItem>
                    <SelectItem value="4">4 per row (small)</SelectItem>
                    <SelectItem value="5">5 per row (mini)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-center justify-between text-sm">
                Product name <Switch checked={showName} onCheckedChange={setShowName} />
              </label>
              <label className="flex items-center justify-between text-sm">
                Price <Switch checked={showPrice} onCheckedChange={setShowPrice} />
              </label>
              <label className="flex items-center justify-between text-sm">
                Shop name <Switch checked={showBusiness} onCheckedChange={setShowBusiness} />
              </label>
            </div>
          </SectionCard>
          <SectionCard title="Preview">
            {sample ? (
              <div className="mx-auto w-56 rounded-md border border-dashed border-border-strong bg-white p-3 text-center text-black">
                {showBusiness && <p className="truncate text-[9px] font-semibold uppercase">{business.name}</p>}
                {showName && (
                  <p className="truncate text-[11px] font-medium">
                    {sample.name}
                    {sample.variantName ? ` · ${sample.variantName}` : ""}
                  </p>
                )}
                <Barcode value={sample.code} height={42} className="my-1" />
                <p className="font-mono text-[10px]">{sample.code}</p>
                {showPrice && <p className="text-[13px] font-bold">{money.format(sample.price)}</p>}
              </div>
            ) : (
              <p className="text-center text-[13px] text-muted-foreground">Add an item to preview its label.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
