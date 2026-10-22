"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Layers, Package, Plus, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import type { AiStatus, Brand, Category, Product, ProductDraft, ProductInput, Unit, VariantInput } from "@shopbooks/shared";
import { SectionCard } from "@/components/section-card";
import { BarcodeInput } from "@/components/barcode-input";
import { Field, FieldGrid, ToggleRow } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { QtyInput } from "@/components/qty-input";
import { TaxRateSelect, LocationSelect } from "@/components/entity-selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api, assetUrl, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const NONE = "__none__";

interface OptionDraft {
  name: string;
  values: string[];
}

interface VariantDraft {
  id?: string;
  options: Record<string, string>;
  sku: string;
  barcode: string;
  price: number;
  wholesalePrice: number | null;
  costPrice: number;
  mrp: number | null;
  reorderLevel: number | null;
  isActive: boolean;
  openingStock: number;
}

const blankVariant = (options: Record<string, string> = {}, base?: Partial<VariantDraft>): VariantDraft => ({
  options,
  sku: "",
  barcode: "",
  price: base?.price ?? 0,
  wholesalePrice: base?.wholesalePrice ?? null,
  costPrice: base?.costPrice ?? 0,
  mrp: base?.mrp ?? null,
  reorderLevel: base?.reorderLevel ?? null,
  isActive: true,
  openingStock: 0,
});

const comboKey = (opts: Record<string, string>, names: string[]) => names.map((n) => (opts[n] ?? "").toLowerCase()).join("\u0000");

/** Cartesian product of option values. */
function combinations(options: OptionDraft[]): Record<string, string>[] {
  const usable = options.filter((o) => o.name.trim() && o.values.length > 0);
  if (usable.length === 0) return [];
  return usable.reduce<Record<string, string>[]>(
    (acc, o) => acc.flatMap((combo) => o.values.map((v) => ({ ...combo, [o.name.trim()]: v }))),
    [{}],
  );
}

/** Text field that turns comma/Enter-separated entries into removable chips. */
function ChipInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = React.useState("");
  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !values.some((v) => v.toLowerCase() === p.toLowerCase()));
    if (parts.length) onChange([...values, ...parts]);
    setText("");
  };
  return (
    <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-[10px] border border-input bg-card px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20 dark:bg-input/20">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[13px]">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${v}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => {
          if (e.target.value.includes(",")) add(e.target.value);
          else setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => text && add(text)}
        placeholder={values.length ? "" : placeholder}
        className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
      />
    </div>
  );
}

export function ProductForm({ product, initialBarcode }: { product?: Product; initialBarcode?: string }) {
  const router = useRouter();
  const { business, locationId: sessionLocationId } = useSession();
  const editing = !!product;
  const categories = useApiQuery<Category[]>("/categories", undefined, { staleTime: 60_000 });
  const aiStatus = useApiQuery<AiStatus>("/ai/status", undefined, { staleTime: Infinity });
  const [draftNote, setDraftNote] = React.useState<string | null>(null);
  // Fills only the fields that are still empty, so nothing the user typed is overwritten.
  const draft = useApiMutation((productName: string) => api.post<ProductDraft>("/ai/product-draft", { name: productName }), {
    errorToast: true,
    onSuccess: (d) => {
      if (d.description && !description.trim()) setDescription(d.description);
      if (d.tags && !tags.trim()) setTags(d.tags);
      if (d.categoryId && !categoryId) setCategoryId(d.categoryId);
      setDraftNote("Drafted with AI. Check it before saving.");
    },
  });
  const brands = useApiQuery<Brand[]>("/brands", undefined, { staleTime: 60_000 });
  const units = useApiQuery<Unit[]>("/units", undefined, { staleTime: 60_000 });

  const [name, setName] = React.useState(product?.name ?? "");
  const [description, setDescription] = React.useState(product?.description ?? "");
  const [type, setType] = React.useState<"standard" | "service">(product?.type ?? "standard");
  const [categoryId, setCategoryId] = React.useState<string | null>(product?.categoryId ?? null);
  const [brandId, setBrandId] = React.useState<string | null>(product?.brandId ?? null);
  const [unitId, setUnitId] = React.useState<string | null>(product?.unitId ?? null);
  const [taxRateId, setTaxRateId] = React.useState<string | null>(product ? product.taxRateId : business.defaultTaxRateId);
  const [trackInventory, setTrackInventory] = React.useState(product?.trackInventory ?? true);
  const [imageUrl, setImageUrl] = React.useState<string | null>(product?.imageUrl ?? null);
  const [tags, setTags] = React.useState(product?.tags ?? "");
  const [isActive, setIsActive] = React.useState(product?.isActive ?? true);
  const [hasVariants, setHasVariants] = React.useState(product?.hasVariants ?? false);
  const [options, setOptions] = React.useState<OptionDraft[]>(
    product?.options.length ? product.options.map((o) => ({ name: o.name, values: [...o.values] })) : [{ name: "Size", values: [] }],
  );
  const [variants, setVariants] = React.useState<VariantDraft[]>(() =>
    product
      ? product.variants
          .filter((v) => v.isActive || !product.hasVariants)
          .map((v) => ({
            id: v.id,
            options: v.options,
            sku: v.sku ?? "",
            barcode: v.barcode ?? "",
            price: v.price,
            wholesalePrice: v.wholesalePrice,
            costPrice: v.costPrice,
            mrp: v.mrp,
            reorderLevel: v.reorderLevel,
            isActive: v.isActive,
            openingStock: 0,
          }))
      : [{ ...blankVariant(), barcode: initialBarcode ?? "" }],
  );
  const [openingLocationId, setOpeningLocationId] = React.useState<string | undefined>(sessionLocationId || undefined);
  const [uploading, setUploading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const fileRef = React.useRef<HTMLInputElement>(null);

  const isService = type === "service";
  const tracks = !isService && trackInventory;
  const unit = units.data?.find((u) => u.id === unitId);
  const simple = variants[0] ?? blankVariant();

  // keep the variant matrix in sync with the option values
  const optionNames = options.map((o) => o.name.trim()).filter(Boolean);
  const combos = React.useMemo(() => combinations(options), [options]);
  React.useEffect(() => {
    if (!hasVariants) return;
    setVariants((prev) => {
      const byKey = new Map(prev.filter((v) => Object.keys(v.options).length > 0).map((v) => [comboKey(v.options, optionNames), v]));
      const template = prev[0];
      return combos.map((c) => byKey.get(comboKey(c, optionNames)) ?? blankVariant(c, template));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combos, hasVariants]);

  const updateVariant = (i: number, patch: Partial<VariantDraft>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const applyToAll = (patch: Partial<VariantDraft>) => setVariants((vs) => vs.map((v) => ({ ...v, ...patch })));

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file");
    if (file.size > 5 * 1024 * 1024) return toast.error("Images must be 5 MB or smaller");
    setUploading(true);
    try {
      const res = await api.upload(file);
      setImageUrl(res.url);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const save = useApiMutation(
    (body: ProductInput) => (editing ? api.put<Product>(`/products/${product!.id}`, body) : api.post<Product>("/products", body)),
    {
      invalidate: ["/products", "/inventory", "/categories", "/brands", "/reports"],
      success: editing ? "Product saved" : "Product created",
      onSuccess: (p) => router.push(`/products/view?id=${p.id}`),
    },
  );

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Required";
    if (hasVariants && variants.length === 0) errs.variants = "Add option values to create variants";
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(Object.values(errs)[0]!);
      return;
    }
    const list = hasVariants ? variants : [simple];
    const body: ProductInput = {
      name: name.trim(),
      description: description.trim() || null,
      type,
      categoryId,
      brandId,
      unitId,
      taxRateId,
      trackInventory: tracks,
      imageUrl,
      tags: tags.trim() || null,
      isActive,
      hasVariants,
      options: hasVariants ? options.filter((o) => o.name.trim() && o.values.length).map((o) => ({ name: o.name.trim(), values: o.values })) : [],
      variants: list.map(
        (v): VariantInput => ({
          id: v.id,
          name: null,
          options: hasVariants ? v.options : {},
          sku: v.sku.trim() || null,
          barcode: v.barcode.trim() || null,
          price: v.price,
          wholesalePrice: v.wholesalePrice || null,
          costPrice: v.costPrice,
          mrp: v.mrp || null,
          reorderLevel: v.reorderLevel,
          isActive: v.isActive,
          openingStock:
            !editing && tracks && openingLocationId && v.openingStock > 0 ? [{ locationId: openingLocationId, quantity: v.openingStock }] : undefined,
        }),
      ),
    };
    save.mutate(body);
  };

  const margin = simple.price > 0 ? ((simple.price - simple.costPrice) / simple.price) * 100 : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-6 lg:grid-cols-3"
    >
      <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
        <SectionCard title="Basics">
          <div className="grid gap-4">
            <Field label="Product name" htmlFor="p-name" required error={errors.name}>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!editing} aria-invalid={!!errors.name || undefined} />
            </Field>
            <Field
              label="Description"
              htmlFor="p-desc"
              labelAside={
                aiStatus.data?.productDraft ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!name.trim()}
                    loading={draft.isPending}
                    onClick={() => draft.mutate(name.trim())}
                  >
                    <Sparkles /> Draft with AI
                  </Button>
                ) : undefined
              }
              hint={draftNote ?? undefined}
            >
              <Textarea id="p-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <RadioGroup value={type} onValueChange={(v) => setType(v as "standard" | "service")} className="grid gap-3 sm:grid-cols-2">
              <RadioCard value="standard">
                <span className="flex items-center gap-2 font-medium">
                  <Package className="size-4 text-muted-foreground" /> Goods
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">Physical items you stock and sell.</span>
              </RadioCard>
              <RadioCard value="service">
                <span className="flex items-center gap-2 font-medium">
                  <Wrench className="size-4 text-muted-foreground" /> Service
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">Alterations, repairs, delivery — no stock.</span>
              </RadioCard>
            </RadioGroup>
          </div>
        </SectionCard>

        <SectionCard
          title="Pricing & variants"
          description={hasVariants ? "Each combination of options is a variant with its own price, SKU and stock." : "One price and SKU for this product."}
          action={
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Layers className="size-4" /> Has variants
              <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
            </label>
          }
        >
          {!hasVariants ? (
            <div className="grid gap-4">
              <FieldGrid cols={3}>
                <Field label="Selling price" required hint={business.taxInclusive ? "Tax inclusive" : "Before tax"}>
                  <MoneyInput value={simple.price} onChange={(v) => updateVariant(0, { price: v })} />
                </Field>
                <Field label="Cost price" hint={margin !== null ? `Margin ${margin.toFixed(1)}%` : undefined}>
                  <MoneyInput value={simple.costPrice} onChange={(v) => updateVariant(0, { costPrice: v })} />
                </Field>
                <Field label="Wholesale price">
                  <MoneyInput value={simple.wholesalePrice} onChange={(v) => updateVariant(0, { wholesalePrice: v || null })} />
                </Field>
                <Field label="MRP / list price">
                  <MoneyInput value={simple.mrp} onChange={(v) => updateVariant(0, { mrp: v || null })} />
                </Field>
                <Field label="SKU" htmlFor="p-sku" hint="Leave blank to auto-generate">
                  <Input id="p-sku" className="font-mono" value={simple.sku} onChange={(e) => updateVariant(0, { sku: e.target.value })} />
                </Field>
                <Field label="Barcode" htmlFor="p-barcode">
                  <BarcodeInput id="p-barcode" productId={product?.id} value={simple.barcode} onChange={(v) => updateVariant(0, { barcode: v })} />
                </Field>
              </FieldGrid>
              {tracks && (
                <FieldGrid cols={3}>
                  <Field label="Reorder level" hint="Flag as low stock at or below">
                    <QtyInput
                      value={simple.reorderLevel ?? 0}
                      allowDecimal={unit?.allowDecimal}
                      onChange={(v) => updateVariant(0, { reorderLevel: v || null })}
                    />
                  </Field>
                  {!editing && (
                    <>
                      <Field label="Opening stock">
                        <QtyInput value={simple.openingStock} allowDecimal={unit?.allowDecimal} onChange={(v) => updateVariant(0, { openingStock: v })} />
                      </Field>
                      <Field label="At location">
                        <LocationSelect value={openingLocationId} onChange={setOpeningLocationId} />
                      </Field>
                    </>
                  )}
                </FieldGrid>
              )}
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="grid gap-3">
                {options.map((o, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-start">
                    <Input
                      value={o.name}
                      placeholder="Option (e.g. Size)"
                      onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <ChipInput
                      values={o.values}
                      placeholder="Values, separated by commas — S, M, L"
                      onChange={(values) => setOptions((os) => os.map((x, j) => (j === i ? { ...x, values } : x)))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setOptions((os) => os.filter((_, j) => j !== i))}
                      disabled={options.length === 1}
                      aria-label="Remove option"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {options.length < 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => setOptions((os) => [...os, { name: os.some((x) => x.name === "Color") ? "" : "Color", values: [] }])}
                  >
                    <Plus /> Add option
                  </Button>
                )}
              </div>

              {variants.length === 0 ? (
                <p className={cn("rounded-xl bg-muted/50 px-4 py-6 text-center text-[13px]", errors.variants ? "text-destructive" : "text-muted-foreground")}>
                  Add option values above to generate variants.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="label-caps">{variants.length} variants</span>
                    <span className="mx-1 text-border">|</span>
                    Copy first row&apos;s
                    <Button type="button" variant="ghost" size="xs" onClick={() => applyToAll({ price: variants[0]!.price })}>
                      price
                    </Button>
                    <Button type="button" variant="ghost" size="xs" onClick={() => applyToAll({ costPrice: variants[0]!.costPrice })}>
                      cost
                    </Button>
                    <Button type="button" variant="ghost" size="xs" onClick={() => applyToAll({ wholesalePrice: variants[0]!.wholesalePrice })}>
                      wholesale
                    </Button>
                    {tracks && (
                      <Button type="button" variant="ghost" size="xs" onClick={() => applyToAll({ reorderLevel: variants[0]!.reorderLevel })}>
                        reorder level
                      </Button>
                    )}
                    to all
                  </div>
                  <div className="-mx-6 overflow-x-auto border-y border-border">
                    <Table className="min-w-[860px]">
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>Variant</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Barcode</TableHead>
                          <TableHead align="right">Price</TableHead>
                          <TableHead align="right">Cost</TableHead>
                          <TableHead align="right">Wholesale</TableHead>
                          {tracks && <TableHead align="right">Reorder</TableHead>}
                          {tracks && !editing && <TableHead align="right">Opening</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variants.map((v, i) => (
                          <TableRow key={comboKey(v.options, optionNames) || i} className="hover:bg-transparent">
                            <TableCell className="font-medium whitespace-nowrap">{Object.values(v.options).join(" / ")}</TableCell>
                            <TableCell className="min-w-32">
                              <Input className="h-8 font-mono text-[12.5px]" placeholder="auto" value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} />
                            </TableCell>
                            <TableCell className="min-w-32">
                              <BarcodeInput compact productId={product?.id} value={v.barcode} onChange={(x) => updateVariant(i, { barcode: x })} />
                            </TableCell>
                            <TableCell className="min-w-28">
                              <MoneyInput hideSymbol className="h-8 text-right" value={v.price} onChange={(x) => updateVariant(i, { price: x })} />
                            </TableCell>
                            <TableCell className="min-w-28">
                              <MoneyInput hideSymbol className="h-8 text-right" value={v.costPrice} onChange={(x) => updateVariant(i, { costPrice: x })} />
                            </TableCell>
                            <TableCell className="min-w-28">
                              <MoneyInput hideSymbol className="h-8 text-right" value={v.wholesalePrice} onChange={(x) => updateVariant(i, { wholesalePrice: x || null })} />
                            </TableCell>
                            {tracks && (
                              <TableCell className="min-w-20">
                                <QtyInput size="sm" value={v.reorderLevel ?? 0} allowDecimal={unit?.allowDecimal} onChange={(x) => updateVariant(i, { reorderLevel: x || null })} />
                              </TableCell>
                            )}
                            {tracks && !editing && (
                              <TableCell className="min-w-20">
                                <QtyInput size="sm" value={v.openingStock} allowDecimal={unit?.allowDecimal} onChange={(x) => updateVariant(i, { openingStock: x })} />
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {tracks && !editing && (
                    <Field label="Opening stock location" className="max-w-xs">
                      <LocationSelect value={openingLocationId} onChange={setOpeningLocationId} />
                    </Field>
                  )}
                  {editing && (
                    <p className="text-[12.5px] text-muted-foreground">
                      Removing an option value archives that variant; its history is kept. Add stock through purchases or adjustments.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid content-start gap-6">
        <SectionCard title="Image">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          {imageUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(imageUrl)!} alt="" className="aspect-square w-full object-cover" />
              <div className="absolute right-2 bottom-2 flex gap-1.5">
                <Button type="button" size="xs" variant="outline" onClick={() => fileRef.current?.click()}>
                  Replace
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={() => setImageUrl(null)}>
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void upload(f);
              }}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-muted/40 text-[13px] text-muted-foreground transition-colors hover:bg-muted"
            >
              {uploading ? <Spinner size={18} /> : <ImagePlus className="size-5" />}
              {uploading ? "Uploading…" : "Click or drop an image"}
              <span className="text-xs">PNG or JPG, up to 5 MB</span>
            </button>
          )}
        </SectionCard>

        <SectionCard title="Organisation">
          <div className="grid gap-4">
            <Field label="Category">
              <EntitySelect value={categoryId} onChange={setCategoryId} items={categories.data} placeholder="No category" />
            </Field>
            <Field label="Brand">
              <EntitySelect value={brandId} onChange={setBrandId} items={brands.data} placeholder="No brand" />
            </Field>
            <Field label="Unit" hint={unit?.allowDecimal ? "Fractional quantities allowed" : undefined}>
              <EntitySelect
                value={unitId}
                onChange={setUnitId}
                items={units.data?.map((u) => ({ id: u.id, name: `${u.name} (${u.shortName})` }))}
                placeholder="Pieces"
              />
            </Field>
            <Field label="Tax rate">
              <TaxRateSelect value={taxRateId} onChange={setTaxRateId} />
            </Field>
            <Field label="Tags" htmlFor="p-tags" hint="Comma separated, used in search">
              <Input id="p-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Settings">
          <div className="-my-3 divide-y divide-border/70">
            {!isService && (
              <ToggleRow title="Track inventory" description="Count stock and block overselling.">
                <Switch checked={trackInventory} onCheckedChange={setTrackInventory} />
              </ToggleRow>
            )}
            <ToggleRow title="Active" description="Inactive products are hidden from the POS.">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </ToggleRow>
          </div>
        </SectionCard>

        <div className="flex gap-2 lg:sticky lg:top-20">
          <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" loading={save.isPending} disabled={uploading}>
            {editing ? "Save product" : "Create product"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function EntitySelect({
  value,
  onChange,
  items,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  items: { id: string; name: string }[] | undefined;
  placeholder: string;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {(items ?? []).map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
