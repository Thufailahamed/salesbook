"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PackageCheck, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DiscountType, Purchase, PurchaseInput, SellableItem, Supplier } from "@shopbooks/shared";
import { calculateDocument } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field, FieldGrid, ToggleRow } from "@/components/form-field";
import { VariantPicker } from "@/components/variant-picker";
import { SupplierPicker } from "@/components/supplier-picker";
import { LocationSelect, PaymentMethodSelect } from "@/components/entity-selects";
import { MoneyInput, PercentInput, QtyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/empty-state";
import { PageLoader } from "@/components/loading";
import { useBusinessToday } from "@/components/filters";
import { useDefaultMethodId } from "@/components/party-dialogs";
import { DiscountInput } from "@/components/pos/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatQty } from "@/lib/utils";

interface Line {
  key: string;
  variantId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
  discountPercent: number;
  taxRate: number;
  /** YYYY-MM-DD, "" when not recorded */
  expiryDate: string;
  allowDecimal: boolean;
  stock: number;
}

interface PayRow {
  key: string;
  methodId: string | undefined;
  amount: number;
  reference: string;
}

let n = 0;
const key = () => `p${n++}`;

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <PurchaseEditor />
    </React.Suspense>
  );
}

function PurchaseEditor() {
  const id = useSearchParams().get("id");
  const existing = useApiQuery<Purchase>(id ? `/purchases/${id}` : null, undefined, { staleTime: 0 });
  if (id && existing.isLoading) return <PageLoader />;
  if (id && !existing.data) return <EmptyState title="Purchase not found" />;
  return <PurchaseForm key={existing.data?.id ?? "new"} purchase={existing.data} />;
}

function PurchaseForm({ purchase }: { purchase?: Purchase }) {
  const router = useRouter();
  const params = useSearchParams();
  const today = useBusinessToday();
  const money = useMoney();
  const defaultMethod = useDefaultMethodId();
  const { locationId: sessionLocation } = useSession();
  const editing = !!purchase;

  const [supplierId, setSupplierId] = React.useState<string | null>(purchase?.supplierId ?? params.get("supplierId"));
  const supplier = useApiQuery<Supplier>(supplierId ? `/suppliers/${supplierId}` : null);
  const [locationId, setLocationId] = React.useState<string | undefined>(purchase?.locationId ?? sessionLocation);
  const [status, setStatus] = React.useState<"received" | "ordered">(editing ? "ordered" : "received");
  const [orderDate, setOrderDate] = React.useState(purchase?.orderDate ?? today);
  const [supplierRef, setSupplierRef] = React.useState(purchase?.supplierRef ?? "");
  const [taxInclusive, setTaxInclusive] = React.useState(purchase?.taxInclusive ?? false);
  const [docDiscountType, setDocDiscountType] = React.useState<DiscountType | null>(purchase?.docDiscountType ?? null);
  const [docDiscountValue, setDocDiscountValue] = React.useState<number | null>(purchase?.docDiscountValue ?? null);
  const [shipping, setShipping] = React.useState(purchase?.shipping ?? 0);
  const [note, setNote] = React.useState(purchase?.note ?? "");
  const [dueDate, setDueDate] = React.useState(purchase?.dueDate ?? "");
  const [applyCredit, setApplyCredit] = React.useState(false);
  const [updateCost, setUpdateCost] = React.useState(true);
  const [payments, setPayments] = React.useState<PayRow[]>([]);
  const [lines, setLines] = React.useState<Line[]>(
    (purchase?.lines ?? []).map((l) => ({
      key: key(),
      variantId: l.variantId,
      name: l.name,
      sku: l.sku,
      quantity: l.quantity,
      unitCost: l.unitCost,
      discountPercent: l.discountType === "percent" ? (l.discountValue ?? 0) : 0,
      taxRate: l.taxRate,
      expiryDate: l.expiryDate ?? "",
      allowDecimal: true,
      stock: 0,
    })),
  );

  const add = (i: SellableItem) => {
    if (!i.trackInventory) return toast.error(`${i.displayName} doesn't track inventory`);
    setLines((ls) => {
      const existing = ls.find((l) => l.variantId === i.variantId);
      if (existing) return ls.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...ls,
        {
          key: key(),
          variantId: i.variantId,
          name: i.displayName,
          sku: i.sku,
          quantity: 1,
          unitCost: i.costPrice,
          discountPercent: 0,
          taxRate: i.taxRate,
          expiryDate: "",
          allowDecimal: i.allowDecimal,
          stock: i.stock,
        },
      ];
    });
  };
  const update = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const totals = calculateDocument(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitCost,
      discountType: l.discountPercent > 0 ? "percent" : null,
      discountValue: l.discountPercent || null,
      taxRate: l.taxRate,
    })),
    { taxInclusive, docDiscountType, docDiscountValue, shipping, roundingIncrement: 0 },
  );
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const credit = status === "received" && applyCredit ? Math.min(supplier.data?.creditBalance ?? 0, Math.max(0, totals.total - paid)) : 0;
  const due = Math.max(0, totals.total - paid - credit);

  const save = useApiMutation(
    (body: PurchaseInput) => (editing ? api.put<Purchase>(`/purchases/${purchase!.id}`, body) : api.post<Purchase>("/purchases", body)),
    {
      invalidate: ["/purchases", "/suppliers", "/inventory", "/products", "/reports", "/accounting", "/payments"],
      success: (p) => (p.status === "received" ? `Purchase ${p.number} received` : `Order ${p.number} saved`),
      onSuccess: (p) => router.push(`/purchases/view?id=${p.id}`),
    },
  );

  const submit = () => {
    if (!supplierId) return toast.error("Choose a supplier");
    if (!locationId) return toast.error("Choose a location");
    if (lines.length === 0) return toast.error("Add at least one item");
    if (lines.some((l) => l.quantity <= 0)) return toast.error("Quantities must be more than zero");
    if (paid > totals.total) return toast.error("Payments exceed the total");
    if (payments.some((p) => p.amount > 0 && !p.methodId)) return toast.error("Choose a payment method");
    save.mutate({
      supplierId,
      locationId,
      status,
      orderDate,
      receivedDate: status === "received" ? orderDate : undefined,
      dueDate: dueDate || null,
      supplierRef: supplierRef.trim() || null,
      taxInclusive,
      lines: lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        unitCost: l.unitCost,
        discountType: l.discountPercent > 0 ? "percent" : null,
        discountValue: l.discountPercent || null,
        taxRate: l.taxRate,
        expiryDate: l.expiryDate || null,
      })),
      docDiscountType,
      docDiscountValue,
      shipping: shipping || null,
      note: note.trim() || null,
      payments:
        status === "received"
          ? payments.filter((p) => p.amount > 0).map((p) => ({ methodId: p.methodId!, amount: p.amount, reference: p.reference.trim() || null }))
          : [],
      applySupplierCredit: status === "received" && applyCredit,
      updateCostPrice: updateCost,
    });
  };

  return (
    <>
      <PageHeader
        backHref={editing ? `/purchases/view?id=${purchase!.id}` : "/purchases"}
        breadcrumbs={[{ label: "Purchases", href: "/purchases" }, { label: editing ? purchase!.number : "New" }]}
        title={editing ? `Edit order ${purchase!.number}` : "New purchase"}
        description="Record stock bought from a supplier. Freight is capitalised into the cost of the goods."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          {!editing && (
            <RadioGroup value={status} onValueChange={(v) => setStatus(v as "received" | "ordered")} className="grid gap-3 sm:grid-cols-2">
              <RadioCard value="received">
                <span className="flex items-center gap-2 font-medium">
                  <PackageCheck className="size-4 text-muted-foreground" /> Goods received
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">Stock and the supplier bill are posted now.</span>
              </RadioCard>
              <RadioCard value="ordered">
                <span className="flex items-center gap-2 font-medium">
                  <ShoppingBag className="size-4 text-muted-foreground" /> Purchase order
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">Nothing is posted until you receive it.</span>
              </RadioCard>
            </RadioGroup>
          )}

          <SectionCard title="Items" flush>
            <div className="border-b border-border/70 px-5 py-4">
              <VariantPicker onSelect={add} locationId={locationId} showPrice="cost" includeServices={false} autoFocus={!editing} />
            </div>
            {lines.length === 0 ? (
              <EmptyState compact icon={ShoppingBag} title="No items yet" description="Search or scan what you're buying." />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Item</TableHead>
                      <TableHead align="right">Qty</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead align="right">Unit cost</TableHead>
                      <TableHead align="right">Disc.</TableHead>
                      <TableHead align="right">Tax</TableHead>
                      <TableHead align="right">Total</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, i) => (
                      <TableRow key={l.key} className="hover:bg-transparent">
                        <TableCell className="min-w-52">
                          <p className="font-medium">{l.name}</p>
                          <p className="font-mono text-[11.5px] text-muted-foreground">
                            {l.sku ?? "—"}
                            {!editing && <span className="font-sans"> · {formatQty(l.stock)} in stock</span>}
                          </p>
                        </TableCell>
                        <TableCell className="w-24">
                          <QtyInput size="sm" value={l.quantity} allowDecimal={l.allowDecimal} onChange={(v) => update(l.key, { quantity: v })} />
                        </TableCell>
                        <TableCell className="w-40">
                          <Input type="date" aria-label="Expiry date" className="h-8" value={l.expiryDate} onChange={(e) => update(l.key, { expiryDate: e.target.value })} />
                        </TableCell>
                        <TableCell className="w-32">
                          <MoneyInput hideSymbol className="h-8 text-right" value={l.unitCost} onChange={(v) => update(l.key, { unitCost: v })} />
                        </TableCell>
                        <TableCell className="w-24">
                          <PercentInput className="text-right" wrapperClassName="h-8" value={l.discountPercent} onChange={(v) => update(l.key, { discountPercent: v })} />
                        </TableCell>
                        <TableCell className="w-24">
                          <PercentInput className="text-right" wrapperClassName="h-8" value={l.taxRate} onChange={(v) => update(l.key, { taxRate: v })} />
                        </TableCell>
                        <TableCell numeric className="font-medium">
                          <Money value={totals.lines[i]?.total ?? 0} />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line">
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          {status === "received" && (
            <SectionCard
              title="Payment"
              description="Leave empty to record the whole bill on credit."
              action={
                <div className="flex gap-2">
                  {totals.total > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPayments([{ key: key(), methodId: defaultMethod, amount: Math.max(0, totals.total - credit), reference: "" }])}
                    >
                      Paid in full
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setPayments((ps) => [...ps, { key: key(), methodId: defaultMethod, amount: due, reference: "" }])}>
                    <Plus /> Add payment
                  </Button>
                </div>
              }
            >
              <div className="grid gap-3">
                {payments.map((p) => (
                  <div key={p.key} className="grid items-end gap-2 sm:grid-cols-[1fr_160px_1fr_auto]">
                    <Field label="Method">
                      <PaymentMethodSelect value={p.methodId} onChange={(v) => setPayments((ps) => ps.map((x) => (x.key === p.key ? { ...x, methodId: v } : x)))} />
                    </Field>
                    <Field label="Amount">
                      <MoneyInput value={p.amount} onChange={(v) => setPayments((ps) => ps.map((x) => (x.key === p.key ? { ...x, amount: v } : x)))} />
                    </Field>
                    <Field label="Reference">
                      <Input value={p.reference} onChange={(e) => setPayments((ps) => ps.map((x) => (x.key === p.key ? { ...x, reference: e.target.value } : x)))} />
                    </Field>
                    <Button variant="ghost" size="icon" onClick={() => setPayments((ps) => ps.filter((x) => x.key !== p.key))} aria-label="Remove payment">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {(supplier.data?.creditBalance ?? 0) > 0 && (
                  <ToggleRow
                    title="Use supplier credit"
                    description={
                      <>
                        <Money value={supplier.data!.creditBalance} /> available from returns and advances.
                      </>
                    }
                  >
                    <Switch checked={applyCredit} onCheckedChange={setApplyCredit} />
                  </ToggleRow>
                )}
                {payments.length === 0 && !applyCredit && (
                  <p className="text-[13px] text-muted-foreground">
                    The full amount goes to accounts payable{supplier.data?.paymentTermsDays ? `, due in ${supplier.data.paymentTermsDays} days` : ""}.
                  </p>
                )}
              </div>
            </SectionCard>
          )}
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title="Supplier">
            <div className="grid gap-4">
              <SupplierPicker value={supplierId} onChange={(id) => setSupplierId(id)} disabled={editing} />
              {supplier.data && (supplier.data.dueBalance > 0 || supplier.data.creditBalance > 0) && (
                <p className="text-[13px] text-muted-foreground">
                  {supplier.data.dueBalance > 0 && (
                    <>
                      You owe <Money value={supplier.data.dueBalance} className="font-medium text-foreground" />.{" "}
                    </>
                  )}
                  {supplier.data.creditBalance > 0 && (
                    <>
                      Credit <Money value={supplier.data.creditBalance} className="font-medium text-foreground" />.
                    </>
                  )}
                </p>
              )}
              <Field label="Supplier invoice / ref" htmlFor="po-ref">
                <Input id="po-ref" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
              </Field>
            </div>
          </SectionCard>
          <SectionCard title="Details">
            <div className="grid gap-4">
              <Field label={status === "received" ? "Receive into" : "Deliver to"}>
                <LocationSelect value={locationId} onChange={setLocationId} />
              </Field>
              <FieldGrid>
                <Field label={status === "received" ? "Date" : "Order date"} htmlFor="po-date">
                  <Input id="po-date" type="date" value={orderDate} max={today} onChange={(e) => setOrderDate(e.target.value)} />
                </Field>
                <Field label="Due date" htmlFor="po-due" hint="Blank = supplier terms">
                  <Input id="po-due" type="date" value={dueDate} min={orderDate} onChange={(e) => setDueDate(e.target.value)} />
                </Field>
              </FieldGrid>
              <Field label="Discount on total">
                <DiscountInput
                  type={docDiscountType}
                  value={docDiscountValue}
                  onChange={(t, v) => {
                    setDocDiscountType(t);
                    setDocDiscountValue(v);
                  }}
                />
              </Field>
              <Field label="Freight / landed cost" hint="Added to the cost of the goods">
                <MoneyInput value={shipping} onChange={setShipping} />
              </Field>
              <div className="-my-2 divide-y divide-border/70">
                <ToggleRow title="Costs include tax" description="Tick if supplier prices already contain tax.">
                  <Switch checked={taxInclusive} onCheckedChange={setTaxInclusive} />
                </ToggleRow>
                <ToggleRow title="Update cost prices" description="Recalculate the average cost of these items.">
                  <Switch checked={updateCost} onCheckedChange={setUpdateCost} />
                </ToggleRow>
              </div>
              <Field label="Note" htmlFor="po-note">
                <Textarea id="po-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </SectionCard>
          <SectionCard title="Summary">
            <dl className="grid gap-1.5 text-sm">
              <SumRow label="Subtotal" value={totals.subtotal} />
              {totals.docDiscount > 0 && <SumRow label="Discount" value={-totals.docDiscount} />}
              <SumRow label={taxInclusive ? "Tax (included)" : "Tax"} value={totals.taxTotal} />
              {totals.shipping > 0 && <SumRow label="Freight" value={totals.shipping} />}
              <div className="rule-double-top mt-1 flex justify-between pt-2 font-display text-lg font-semibold">
                <dt>Total</dt>
                <dd className="figure">{money.format(totals.total)}</dd>
              </div>
              {status === "received" && (
                <>
                  {paid > 0 && <SumRow label="Paid now" value={-paid} />}
                  {credit > 0 && <SumRow label="Supplier credit" value={-credit} />}
                  <div className="flex justify-between font-semibold">
                    <dt>On account</dt>
                    <dd>
                      <Money value={due} />
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </SectionCard>
          <Button size="lg" onClick={submit} loading={save.isPending}>
            {editing ? "Save order" : status === "received" ? "Receive stock" : "Save purchase order"}
          </Button>
        </div>
      </div>
    </>
  );
}

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  );
}
