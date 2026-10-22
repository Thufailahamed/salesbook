"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import type { ProductInput, SellableItem } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field, FieldGrid } from "@/components/form-field";
import { MoneyInput, QtyInput } from "@/components/money-input";
import { CameraScanner, cameraScanSupported } from "@/components/camera-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invalidatePaths } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatQty } from "@/lib/utils";

type Found = { kind: "exists"; code: string; item: SellableItem } | { kind: "new"; code: string };

export default function ScanToAddPage() {
  const { can, taxRates, locationId } = useSession();
  const money = useMoney();
  const qc = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState("");
  const [camera, setCamera] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [found, setFound] = React.useState<Found | null>(null);
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState(0);
  const [cost, setCost] = React.useState(0);
  const [qty, setQty] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [added, setAdded] = React.useState<{ name: string; code: string; price: number }[]>([]);
  const canCamera = React.useMemo(cameraScanSupported, []);

  const reset = () => {
    setFound(null);
    setText("");
    setName("");
    setPrice(0);
    setCost(0);
    setQty(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleCode = async (raw: string) => {
    const code = raw.trim();
    if (!code || checking) return;
    setChecking(true);
    setText(code);
    try {
      const item = await api.get<SellableItem>("/products/lookup", { code, locationId });
      setFound({ kind: "exists", code, item });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setFound({ kind: "new", code });
        setCamera(false);
        requestAnimationFrame(() => nameRef.current?.focus());
      } else toast.error(errorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    if (found?.kind !== "new" || !name.trim()) return;
    setSaving(true);
    const tax = taxRates.find((t) => t.isDefault) ?? null;
    const body: ProductInput = {
      name: name.trim(),
      description: null,
      type: "standard",
      categoryId: null,
      brandId: null,
      unitId: null,
      taxRateId: tax?.id ?? null,
      trackInventory: true,
      imageUrl: null,
      tags: null,
      isActive: true,
      hasVariants: false,
      options: [],
      variants: [
        {
          name: "",
          options: {},
          sku: null,
          barcode: found.code,
          price,
          wholesalePrice: null,
          costPrice: cost,
          mrp: null,
          reorderLevel: null,
          isActive: true,
          openingStock: qty > 0 && locationId ? [{ locationId, quantity: qty }] : undefined,
        },
      ],
    };
    try {
      await api.post("/products", body);
      setAdded((a) => [{ name: body.name, code: found.code, price }, ...a]);
      toast.success(`${body.name} added`);
      await invalidatePaths(qc, ["/products", "/inventory", "/reports"]);
      reset();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        backHref="/products"
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: "Scan to add" }]}
        title="Scan to add"
        description="Scan the barcode on a product. If it isn't in your catalog yet, give it a name and price and it's created with that barcode, ready to scan at the POS."
      />
      <div className="mx-auto grid max-w-2xl gap-5">
        <SectionCard title="Barcode" icon={ScanBarcode}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCode(text);
            }}
          >
            <Input
              ref={inputRef}
              autoFocus
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (found) setFound(null);
              }}
              placeholder="Scan with a barcode scanner, or type the code and press Enter"
              className="h-12 font-mono text-[15px]"
              disabled={!can("products.manage")}
            />
            {canCamera && (
              <Button type="button" variant="outline" className="h-12" onClick={() => setCamera((c) => !c)}>
                <Camera /> Camera
              </Button>
            )}
          </form>
          {camera && (
            <div className="mt-4">
              <CameraScanner onCode={(c) => void handleCode(c)} onClose={() => setCamera(false)} />
            </div>
          )}
        </SectionCard>

        {found?.kind === "exists" && (
          <SectionCard>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-muted-foreground">Already in your catalog</p>
                <p className="truncate text-lg font-semibold">{found.item.displayName}</p>
                <p className="num text-[13px] text-muted-foreground">
                  {money.format(found.item.price)}
                  {found.item.trackInventory && ` · ${formatQty(found.item.stock)} in stock`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" asChild>
                  <Link href={`/products/view?id=${found.item.productId}`}>Open</Link>
                </Button>
                <Button onClick={reset}>Scan next</Button>
              </div>
            </div>
          </SectionCard>
        )}

        {found?.kind === "new" && (
          <SectionCard
            title="New product"
            description={`No product has the barcode ${found.code}.`}
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={reset}>
                  Cancel
                </Button>
                <Button onClick={save} loading={saving} disabled={!name.trim() || price <= 0}>
                  Save and scan next
                </Button>
              </div>
            }
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <FieldGrid cols={2}>
                <Field label="Name" required className="sm:col-span-2">
                  <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
                </Field>
                <Field label="Selling price" required>
                  <MoneyInput value={price} onChange={setPrice} />
                </Field>
                <Field label="Cost price">
                  <MoneyInput value={cost} onChange={setCost} />
                </Field>
                <Field label="Opening stock" hint={locationId ? "Units on the shelf now (optional)" : undefined}>
                  <QtyInput value={qty} onChange={setQty} />
                </Field>
              </FieldGrid>
              <button type="submit" className="hidden" />
            </form>
          </SectionCard>
        )}

        {added.length > 0 && (
          <SectionCard title={`Added this session · ${added.length}`} flush>
            <ul className="divide-y divide-border">
              {added.map((a, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3">
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                  <span className="font-mono text-[12px] text-muted-foreground">{a.code}</span>
                  <span className="num text-[13px]">{money.format(a.price)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </>
  );
}
