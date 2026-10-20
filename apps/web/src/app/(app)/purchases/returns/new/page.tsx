"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PackageMinus } from "lucide-react";
import type { Paginated, Purchase, PurchaseLine, PurchaseReturn, PurchaseReturnInput } from "@shopbooks/shared";
import { proportionalLine } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field } from "@/components/form-field";
import { SupplierPicker } from "@/components/supplier-picker";
import { QtyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/empty-state";
import { PageLoader } from "@/components/loading";
import { PaymentMethodSelect } from "@/components/entity-selects";
import { useBusinessToday } from "@/components/filters";
import { useDefaultMethodId } from "@/components/party-dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { cn, formatDate, formatQty } from "@/lib/utils";

/** Value of returning `qty` of a purchase line (exact remainder when returning everything left), mirroring the API. */
function lineValue(l: PurchaseLine, qty: number): number {
  if (qty <= 0) return 0;
  const left = l.quantity - l.quantityReturned;
  if (Math.abs(qty - left) < 1e-9) {
    const already = proportionalLine(l, l.quantityReturned);
    return l.total - already.total;
  }
  return proportionalLine(l, qty).total;
}

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <NewPurchaseReturn />
    </React.Suspense>
  );
}

function NewPurchaseReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const today = useBusinessToday();
  const defaultMethod = useDefaultMethodId();
  const [purchaseId, setPurchaseId] = React.useState<string | null>(params.get("purchaseId"));
  const [supplierId, setSupplierId] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [settlement, setSettlement] = React.useState<"credit" | "refund">("credit");
  const [methodId, setMethodId] = React.useState<string | undefined>(defaultMethod);
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [date, setDate] = React.useState(today);

  const purchase = useApiQuery<Purchase>(purchaseId ? `/purchases/${purchaseId}` : null);
  const candidates = useApiQuery<Paginated<Purchase>>(!purchaseId && supplierId ? "/purchases" : null, {
    supplierId,
    status: "received",
    pageSize: 50,
  });

  const p = purchase.data;
  const lines = p?.lines ?? [];
  const total = lines.reduce((s, l) => s + lineValue(l, qty[l.id] ?? 0), 0);
  const count = Object.values(qty).reduce((s, v) => s + v, 0);
  const toBill = p ? Math.min(total, p.amountDue) : 0;
  const remainder = total - toBill;

  const save = useApiMutation((body: PurchaseReturnInput) => api.post<PurchaseReturn>("/purchase-returns", body), {
    invalidate: ["/purchase-returns", "/purchases", "/suppliers", "/inventory", "/products", "/reports", "/accounting", "/payments"],
    success: (r) => `Debit note ${r.number} created`,
    onSuccess: (r) => router.push(`/purchases/returns/view?id=${r.id}`),
  });

  const submit = () => {
    if (!p) return;
    save.mutate({
      purchaseId: p.id,
      date,
      note: note.trim() || null,
      lines: Object.entries(qty)
        .filter(([, v]) => v > 0)
        .map(([purchaseLineId, quantity]) => ({ purchaseLineId, quantity })),
      settlement,
      methodId: settlement === "refund" ? methodId : null,
      reference: reference.trim() || null,
    });
  };

  return (
    <>
      <PageHeader
        backHref="/purchases/returns"
        breadcrumbs={[{ label: "Purchase returns", href: "/purchases/returns" }, { label: "New" }]}
        title="Return to supplier"
        description="Sends stock back at its landed cost and reduces what you owe — or records the supplier's refund."
      />

      {!purchaseId ? (
        <SectionCard title="Which purchase?" className="max-w-2xl" flush>
          <div className="border-b border-border/70 px-6 py-4">
            <SupplierPicker value={supplierId} onChange={(id) => setSupplierId(id)} allowCreate={false} />
          </div>
          {!supplierId ? (
            <p className="px-6 py-5 text-[13px] text-muted-foreground">Choose the supplier first.</p>
          ) : candidates.isLoading ? (
            <p className="px-6 py-5 text-[13px] text-muted-foreground">Loading…</p>
          ) : (candidates.data?.data ?? []).length === 0 ? (
            <EmptyState compact icon={PackageMinus} title="No received purchases from this supplier" />
          ) : (
            <ul className="divide-y divide-border/70">
              {candidates.data!.data.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setPurchaseId(c.id)} className="flex w-full items-center justify-between px-6 py-3 text-left text-sm hover:bg-muted/40">
                    <span>
                      <span className="font-mono text-[12.5px] font-medium">{c.number}</span>
                      <span className="ml-2 text-muted-foreground">
                        {formatDate(c.receivedDate ?? c.orderDate)}
                        {c.supplierRef ? ` · ${c.supplierRef}` : ""}
                      </span>
                    </span>
                    <Money value={c.total} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : purchase.isLoading ? (
        <PageLoader />
      ) : !p ? (
        <EmptyState title="Purchase not found" />
      ) : p.status !== "received" ? (
        <EmptyState icon={PackageMinus} title="Only received purchases can be returned" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <SectionCard
            title={
              <span>
                Items on <span className="font-mono">{p.number}</span>
              </span>
            }
            description={`${p.supplierName} · ${formatDate(p.receivedDate ?? p.orderDate)} · ${p.locationName}`}
            action={
              !params.get("purchaseId") && (
                <Button variant="ghost" size="sm" onClick={() => setPurchaseId(null)}>
                  Change
                </Button>
              )
            }
            flush
            className="min-w-0 lg:col-span-2"
          >
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-8" />
                  <TableHead>Item</TableHead>
                  <TableHead align="right" className="hidden sm:table-cell">
                    Returnable
                  </TableHead>
                  <TableHead align="right">Return</TableHead>
                  <TableHead align="right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const left = l.quantity - l.quantityReturned;
                  const v = qty[l.id] ?? 0;
                  return (
                    <TableRow key={l.id} className={cn("hover:bg-transparent", left <= 0 && "opacity-50")}>
                      <TableCell>
                        <Checkbox
                          checked={v > 0}
                          disabled={left <= 0}
                          onCheckedChange={(c) => setQty((q) => ({ ...q, [l.id]: c ? left : 0 }))}
                          aria-label={`Return ${l.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <Money value={l.unitCost} /> each
                        </p>
                      </TableCell>
                      <TableCell numeric className="hidden text-muted-foreground sm:table-cell">
                        {formatQty(left)}
                      </TableCell>
                      <TableCell className="w-36">
                        <QtyInput
                          size="sm"
                          steppers
                          min={0}
                          max={left}
                          allowDecimal={!Number.isInteger(l.quantity)}
                          disabled={left <= 0}
                          value={v}
                          onChange={(n) => setQty((q) => ({ ...q, [l.id]: Math.min(n, left) }))}
                          wrapperClassName="justify-end"
                        />
                      </TableCell>
                      <TableCell numeric className="font-medium">
                        <Money value={lineValue(l, v)} dashZero />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </SectionCard>

          <div className="grid content-start gap-6">
            <SectionCard title="Settlement">
              <div className="grid gap-4">
                <dl className="grid gap-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Items</dt>
                    <dd className="num">{formatQty(count)}</dd>
                  </div>
                  <div className="flex justify-between font-medium">
                    <dt>Return value</dt>
                    <dd>
                      <Money value={total} />
                    </dd>
                  </div>
                  {toBill > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Reduces this bill</dt>
                      <dd>
                        <Money value={toBill} />
                      </dd>
                    </div>
                  )}
                  <div className="rule-double-top mt-1 flex justify-between pt-2 font-semibold">
                    <dt>Remaining</dt>
                    <dd>
                      <Money value={remainder} />
                    </dd>
                  </div>
                </dl>
                {remainder > 0 && (
                  <>
                    <RadioGroup value={settlement} onValueChange={(v) => setSettlement(v as "credit" | "refund")} className="grid gap-2">
                      <RadioCard value="credit">
                        <span className="font-medium">Keep as supplier credit</span>
                        <span className="block text-[12.5px] text-muted-foreground">Use it against future bills</span>
                      </RadioCard>
                      <RadioCard value="refund">
                        <span className="font-medium">Supplier refunds now</span>
                        <span className="block text-[12.5px] text-muted-foreground">Money comes back to you</span>
                      </RadioCard>
                    </RadioGroup>
                    {settlement === "refund" && (
                      <>
                        <Field label="Received via">
                          <PaymentMethodSelect value={methodId} onChange={setMethodId} />
                        </Field>
                        <Field label="Reference" htmlFor="pr-ref">
                          <Input id="pr-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                        </Field>
                      </>
                    )}
                  </>
                )}
                <Field label="Date" htmlFor="pr-date">
                  <Input id="pr-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Note" htmlFor="pr-note">
                  <Textarea id="pr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Damaged in transit, wrong item…" />
                </Field>
              </div>
            </SectionCard>
            <Button size="lg" onClick={submit} loading={save.isPending} disabled={count <= 0 || (remainder > 0 && settlement === "refund" && !methodId)}>
              Create debit note · <Money value={total} />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
