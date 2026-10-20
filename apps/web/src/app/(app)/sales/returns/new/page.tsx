"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Repeat, ScanLine, Search, Undo2 } from "lucide-react";
import type { Invoice, ReturnableLine, SaleReturn, SaleReturnInput } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field } from "@/components/form-field";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/empty-state";
import { PageLoader } from "@/components/loading";
import { PaymentMethodSelect } from "@/components/entity-selects";
import { useBusinessToday } from "@/components/filters";
import { useDefaultMethodId } from "@/components/party-dialogs";
import { ReturnLinesPicker, lineCredit, type ReturnPicks } from "@/components/return-lines-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <NewReturn />
    </React.Suspense>
  );
}

function NewReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const today = useBusinessToday();
  const { can } = useSession();
  const defaultMethod = useDefaultMethodId();
  const [invoiceId, setInvoiceId] = React.useState<string | null>(params.get("invoiceId"));
  const [number, setNumber] = React.useState("");
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [looking, setLooking] = React.useState(false);
  const [picks, setPicks] = React.useState<ReturnPicks>({});
  const [reason, setReason] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [mode, setMode] = React.useState<"method" | "store_credit">("method");
  const [methodId, setMethodId] = React.useState<string | undefined>(defaultMethod);

  const inv = useApiQuery<Invoice>(invoiceId ? `/sales/${invoiceId}` : null);
  const returnable = useApiQuery<ReturnableLine[]>(invoiceId ? `/sales/${invoiceId}/returnable` : null);

  const lookup = async () => {
    const n = number.trim();
    if (!n) return;
    setLooking(true);
    setLookupError(null);
    try {
      const found = await api.get<Invoice>("/sales/lookup", { number: n });
      setInvoiceId(found.id);
      setPicks({});
    } catch (e) {
      setLookupError(errorMessage(e));
    } finally {
      setLooking(false);
    }
  };

  const lines = returnable.data ?? [];
  const credit = lines.reduce((s, l) => s + lineCredit(l, picks[l.id]?.quantity ?? 0), 0);
  const count = Object.values(picks).reduce((s, p) => s + p.quantity, 0);
  const invoice = inv.data;
  const toBalance = invoice ? Math.min(credit, invoice.amountDue) : 0;
  const refundDue = credit - toBalance;

  const save = useApiMutation((body: SaleReturnInput) => api.post<SaleReturn>("/returns", body), {
    invalidate: ["/returns", "/sales", "/customers", "/inventory", "/products", "/reports", "/accounting", "/payments", "/shifts"],
    success: (r) => `Credit note ${r.number} created`,
    onSuccess: (r) => router.push(`/sales/returns/view?id=${r.id}`),
  });

  const submit = () => {
    if (!invoice) return;
    save.mutate({
      invoiceId: invoice.id,
      date,
      reason: reason.trim() || null,
      lines: Object.entries(picks)
        .filter(([, p]) => p.quantity > 0)
        .map(([invoiceLineId, p]) => ({ invoiceLineId, quantity: p.quantity, restock: p.restock })),
      refund: refundDue > 0 ? { mode, methodId: mode === "method" ? methodId : null } : null,
    });
  };

  return (
    <>
      <PageHeader
        backHref="/sales/returns"
        breadcrumbs={[{ label: "Returns", href: "/sales/returns" }, { label: "New" }]}
        title="Return items"
        description="Original discounts and taxes are respected. Unpaid balances on the invoice are reduced first."
        actions={
          can("pos.sell") && (
            <Button variant="outline" asChild>
              <Link href="/pos">
                <Repeat /> Exchange at the POS
              </Link>
            </Button>
          )
        }
      />

      {!invoiceId ? (
        <SectionCard title="Find the invoice" className="max-w-xl">
          <Field label="Invoice number" error={lookupError}>
            <div className="flex gap-2">
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void lookup();
                  }
                }}
                icon={<ScanLine />}
                className="font-mono"
                placeholder="Scan the receipt or type INV-…"
                autoFocus
              />
              <Button onClick={lookup} loading={looking}>
                <Search /> Find
              </Button>
            </div>
          </Field>
        </SectionCard>
      ) : inv.isLoading || returnable.isLoading ? (
        <PageLoader />
      ) : !invoice ? (
        <EmptyState title="Invoice not found" action={<Button onClick={() => setInvoiceId(null)}>Search again</Button>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <SectionCard
            title={
              <span>
                Items on <span className="font-mono">{invoice.number}</span>
              </span>
            }
            description={`${formatDate(invoice.date)} · ${invoice.customerName ?? "Walk-in customer"}`}
            action={
              !params.get("invoiceId") && (
                <Button variant="ghost" size="sm" onClick={() => setInvoiceId(null)}>
                  Change invoice
                </Button>
              )
            }
            flush
            className="min-w-0 lg:col-span-2"
          >
            {invoice.status === "void" ? (
              <EmptyState compact icon={Undo2} title="This invoice is void" />
            ) : lines.every((l) => l.returnableQuantity <= 0) ? (
              <EmptyState compact icon={Undo2} title="Nothing left to return" description="Every item on this invoice has already been returned." />
            ) : (
              <ReturnLinesPicker lines={lines} picks={picks} onChange={setPicks} />
            )}
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
                    <dt>Return credit</dt>
                    <dd>
                      <Money value={credit} />
                    </dd>
                  </div>
                  {toBalance > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Clears unpaid balance</dt>
                      <dd>
                        <Money value={toBalance} />
                      </dd>
                    </div>
                  )}
                  <div className="rule-double-top mt-1 flex justify-between pt-2 font-semibold">
                    <dt>To refund</dt>
                    <dd>
                      <Money value={refundDue} />
                    </dd>
                  </div>
                </dl>
                {refundDue > 0 && (
                  <>
                    <RadioGroup value={mode} onValueChange={(v) => setMode(v as "method" | "store_credit")} className="grid gap-2">
                      <RadioCard value="method">
                        <span className="font-medium">Money back</span>
                      </RadioCard>
                      <RadioCard value="store_credit" disabled={!invoice.customerId}>
                        <span className="font-medium">Store credit</span>
                        {!invoice.customerId && <span className="block text-[12.5px] text-muted-foreground">Walk-in sales can&apos;t get credit</span>}
                      </RadioCard>
                    </RadioGroup>
                    {mode === "method" && (
                      <Field label="Refund via">
                        <PaymentMethodSelect value={methodId} onChange={setMethodId} />
                      </Field>
                    )}
                  </>
                )}
                <Field label="Reason" htmlFor="r-reason">
                  <Input id="r-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong size, defective…" />
                </Field>
                <Field label="Date" htmlFor="r-date">
                  <Input id="r-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>
            </SectionCard>
            <Button size="lg" onClick={submit} loading={save.isPending} disabled={count <= 0 || (refundDue > 0 && mode === "method" && !methodId)}>
              Create credit note · <Money value={credit} />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
