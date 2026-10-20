"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CirclePlus, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DiscountType, Quotation, QuotationInput, SellableItem } from "@shopbooks/shared";
import { addDays, calculateDocument } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field, FieldGrid } from "@/components/form-field";
import { VariantPicker } from "@/components/variant-picker";
import { CustomerPicker } from "@/components/customer-picker";
import { LocationSelect, TaxRateSelect } from "@/components/entity-selects";
import { MoneyInput, PercentInput, QtyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/empty-state";
import { PageLoader } from "@/components/loading";
import { useBusinessToday } from "@/components/filters";
import { DiscountInput } from "@/components/pos/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";

interface Line {
  key: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  allowDecimal: boolean;
}

let n = 0;
const key = () => `q${n++}`;

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <QuotationEditor />
    </React.Suspense>
  );
}

function QuotationEditor() {
  const id = useSearchParams().get("id");
  const existing = useApiQuery<Quotation>(id ? `/quotations/${id}` : null, undefined, { staleTime: 0 });
  if (id && existing.isLoading) return <PageLoader />;
  if (id && !existing.data) return <EmptyState title="Quotation not found" />;
  return <QuotationForm key={existing.data?.id ?? "new"} quotation={existing.data} />;
}

function QuotationForm({ quotation }: { quotation?: Quotation }) {
  const router = useRouter();
  const today = useBusinessToday();
  const money = useMoney();
  const { business, locationId: sessionLocation, taxRates } = useSession();
  const editing = !!quotation;

  const [customerId, setCustomerId] = React.useState<string | null>(quotation?.customerId ?? null);
  const [customerName, setCustomerName] = React.useState(quotation && !quotation.customerId ? quotation.customerName ?? "" : "");
  const [locationId, setLocationId] = React.useState<string | undefined>(quotation?.locationId ?? sessionLocation);
  const [date, setDate] = React.useState(quotation?.date ?? today);
  const [validUntil, setValidUntil] = React.useState(quotation?.validUntil ?? addDays(today, 14));
  const [docDiscountType, setDocDiscountType] = React.useState<DiscountType | null>(quotation?.docDiscountType ?? null);
  const [docDiscountValue, setDocDiscountValue] = React.useState<number | null>(quotation?.docDiscountValue ?? null);
  const [shipping, setShipping] = React.useState(quotation?.shipping ?? 0);
  const [notes, setNotes] = React.useState(quotation?.notes ?? "");
  const [terms, setTerms] = React.useState(quotation?.terms ?? business.invoiceTerms ?? "");
  const [lines, setLines] = React.useState<Line[]>(
    (quotation?.lines ?? []).map((l) => ({
      key: key(),
      variantId: l.variantId,
      name: l.name,
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountType === "percent" ? (l.discountValue ?? 0) : 0,
      taxRate: l.taxRate,
      allowDecimal: true,
    })),
  );
  const [customTax, setCustomTax] = React.useState<string | null>(business.defaultTaxRateId);

  const add = (i: SellableItem) =>
    setLines((ls) => [
      ...ls,
      {
        key: key(),
        variantId: i.variantId,
        name: i.displayName,
        sku: i.sku,
        quantity: 1,
        unitPrice: i.price,
        discountPercent: 0,
        taxRate: i.taxRate,
        allowDecimal: i.allowDecimal,
      },
    ]);
  const addCustom = () =>
    setLines((ls) => [
      ...ls,
      {
        key: key(),
        variantId: null,
        name: "",
        sku: null,
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        taxRate: taxRates.find((t) => t.id === customTax)?.rate ?? 0,
        allowDecimal: true,
      },
    ]);
  const update = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const totals = calculateDocument(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountType: l.discountPercent > 0 ? "percent" : null,
      discountValue: l.discountPercent || null,
      taxRate: l.taxRate,
    })),
    { taxInclusive: business.taxInclusive, docDiscountType, docDiscountValue, shipping, roundingIncrement: 0 },
  );

  const save = useApiMutation(
    (body: QuotationInput) => (editing ? api.put<Quotation>(`/quotations/${quotation!.id}`, body) : api.post<Quotation>("/quotations", body)),
    {
      invalidate: ["/quotations"],
      success: (q) => (editing ? `${q.number} saved` : `Quotation ${q.number} created`),
      onSuccess: (q) => router.push(`/sales/quotations/view?id=${q.id}`),
    },
  );

  const submit = (status?: "draft" | "sent") => {
    if (!locationId) return toast.error("Choose a location");
    if (lines.length === 0) return toast.error("Add at least one item");
    if (lines.some((l) => !l.variantId && !l.name.trim())) return toast.error("Give every custom line a description");
    if (lines.some((l) => l.quantity <= 0)) return toast.error("Quantities must be more than zero");
    save.mutate({
      customerId,
      customerName: customerId ? null : customerName.trim() || null,
      locationId,
      date,
      validUntil: validUntil || null,
      status: status ?? (editing ? undefined : "draft"),
      lines: lines.map((l) => ({
        variantId: l.variantId,
        name: l.variantId ? undefined : l.name.trim(),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountType: l.discountPercent > 0 ? "percent" : null,
        discountValue: l.discountPercent || null,
        taxRate: l.variantId ? undefined : l.taxRate,
      })),
      docDiscountType,
      docDiscountValue,
      shipping: shipping || null,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
    });
  };

  return (
    <>
      <PageHeader
        backHref={editing ? `/sales/quotations/view?id=${quotation!.id}` : "/sales/quotations"}
        breadcrumbs={[{ label: "Quotations", href: "/sales/quotations" }, { label: editing ? quotation!.number : "New" }]}
        title={editing ? `Edit ${quotation!.number}` : "New quotation"}
        description="Prices come from the catalog; you can adjust them per quote."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <SectionCard title="Items" flush action={<Button variant="ghost" size="sm" onClick={addCustom}><CirclePlus /> Custom line</Button>}>
            <div className="border-b border-border/70 px-5 py-4">
              <VariantPicker onSelect={add} locationId={locationId} autoFocus={!editing} />
            </div>
            {lines.length === 0 ? (
              <EmptyState compact icon={FileText} title="No items yet" description="Search the catalog or add a custom line." />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Item</TableHead>
                      <TableHead align="right">Qty</TableHead>
                      <TableHead align="right">Price</TableHead>
                      <TableHead align="right">Disc.</TableHead>
                      <TableHead align="right">Tax</TableHead>
                      <TableHead align="right">Total</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, i) => (
                      <TableRow key={l.key} className="hover:bg-transparent">
                        <TableCell className="min-w-56">
                          {l.variantId ? (
                            <>
                              <p className="font-medium">{l.name}</p>
                              <p className="font-mono text-[11.5px] text-muted-foreground">{l.sku ?? "—"}</p>
                            </>
                          ) : (
                            <Input className="h-8" placeholder="Description" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} />
                          )}
                        </TableCell>
                        <TableCell className="w-24">
                          <QtyInput size="sm" value={l.quantity} allowDecimal={l.allowDecimal} onChange={(v) => update(l.key, { quantity: v })} />
                        </TableCell>
                        <TableCell className="w-32">
                          <MoneyInput hideSymbol className="h-8 text-right" value={l.unitPrice} onChange={(v) => update(l.key, { unitPrice: v })} />
                        </TableCell>
                        <TableCell className="w-24">
                          <PercentInput className="h-8 text-right" wrapperClassName="h-8" value={l.discountPercent} onChange={(v) => update(l.key, { discountPercent: v })} />
                        </TableCell>
                        <TableCell numeric className="text-muted-foreground">
                          {l.taxRate ? `${l.taxRate}%` : "—"}
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
            {lines.some((l) => !l.variantId) && (
              <div className="flex items-center gap-3 border-t border-border/70 px-5 py-3 text-[13px] text-muted-foreground">
                Tax for new custom lines
                <TaxRateSelect value={customTax} onChange={setCustomTax} size="sm" className="w-48" />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Notes & terms">
            <FieldGrid>
              <Field label="Notes to the customer" htmlFor="q-notes">
                <Textarea id="q-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Field label="Terms" htmlFor="q-terms">
                <Textarea id="q-terms" rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} />
              </Field>
            </FieldGrid>
          </SectionCard>
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title="Customer">
            <div className="grid gap-4">
              <CustomerPicker value={customerId} onChange={(cid) => setCustomerId(cid)} />
              {!customerId && (
                <Field label="Or name only" htmlFor="q-cname" hint="For prospects who aren't customers yet">
                  <Input id="q-cname" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </Field>
              )}
            </div>
          </SectionCard>
          <SectionCard title="Quotation">
            <div className="grid gap-4">
              <Field label="Location">
                <LocationSelect value={locationId} onChange={setLocationId} />
              </Field>
              <FieldGrid>
                <Field label="Date" htmlFor="q-date">
                  <Input id="q-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Valid until" htmlFor="q-valid">
                  <Input id="q-valid" type="date" value={validUntil ?? ""} min={date} onChange={(e) => setValidUntil(e.target.value)} />
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
              <Field label="Delivery / charges">
                <MoneyInput value={shipping} onChange={setShipping} />
              </Field>
            </div>
          </SectionCard>
          <SectionCard title="Summary">
            <dl className="grid gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>
                  <Money value={totals.subtotal} />
                </dd>
              </div>
              {totals.docDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd>
                    <Money value={-totals.docDiscount} />
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax{business.taxInclusive ? " (included)" : ""}</dt>
                <dd>
                  <Money value={totals.taxTotal} />
                </dd>
              </div>
              {totals.shipping > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Charges</dt>
                  <dd>
                    <Money value={totals.shipping} />
                  </dd>
                </div>
              )}
              <div className="rule-double-top mt-1 flex justify-between pt-2 font-display text-lg font-semibold">
                <dt>Total</dt>
                <dd className="figure">{money.format(totals.total)}</dd>
              </div>
            </dl>
          </SectionCard>
          <div className="grid grid-cols-2 gap-2">
            {editing ? (
              <Button className="col-span-2" size="lg" onClick={() => submit()} loading={save.isPending}>
                Save quotation
              </Button>
            ) : (
              <>
                <Button variant="outline" size="lg" onClick={() => submit("draft")} loading={save.isPending}>
                  Save draft
                </Button>
                <Button size="lg" onClick={() => submit("sent")} loading={save.isPending}>
                  Save & mark sent
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
