"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ban, CreditCard, FileText, HandCoins, MoreHorizontal, Printer, Receipt, Undo2 } from "lucide-react";
import type { Customer, GatewayCheckout, Invoice, InvoicePaymentInput, TenderInput } from "@shopbooks/shared";
import { TENDER_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { KeyValue } from "@/components/key-value";
import { Money } from "@/components/money";
import { InvoiceStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { useConfirm } from "@/components/confirm-dialog";
import { Field } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { PaymentMethodSelect } from "@/components/entity-selects";
import { useBusinessToday } from "@/components/filters";
import { useDefaultMethodId } from "@/components/party-dialogs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn, formatDate, formatDateTime, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <InvoiceView />
    </React.Suspense>
  );
}

const INVALIDATE = ["/sales", "/customers", "/payments", "/reports", "/accounting", "/inventory", "/products", "/shifts"];

function InvoiceView() {
  const id = useSearchParams().get("id");
  const confirm = useConfirm();
  const money = useMoney();
  const { can, business } = useSession();
  const { data: inv, isLoading, error, refetch } = useApiQuery<Invoice>(id ? `/sales/${id}` : null);
  const [payOpen, setPayOpen] = React.useState(false);
  const gw = useApiQuery<{ enabled: boolean }>("/gateway/status");
  const checkout = useApiMutation(
    () => api.post<GatewayCheckout>("/gateway/checkouts", { invoiceId: id, returnOrigin: window.location.origin }),
    { onSuccess: (c) => { window.location.href = c.url; } },
  );
  // Back from payments.lk: the webhook settles the invoice, which can lag the redirect by a moment.
  const gatewayResult = useSearchParams().get("gateway");
  React.useEffect(() => {
    if (gatewayResult === "success") {
      toast.success("Payment submitted — updating the invoice…");
      const timers = [2000, 5000, 10000].map((ms) => setTimeout(() => refetch(), ms));
      return () => timers.forEach(clearTimeout);
    }
    if (gatewayResult === "cancelled") toast.message("Online payment cancelled");
  }, [gatewayResult, refetch]);

  const voidInv = useApiMutation((reason: string) => api.post<Invoice>(`/sales/${id}/void`, { reason }), {
    invalidate: INVALIDATE,
    success: (i) => `${i.number} voided`,
  });

  if (!id) return <ErrorState title="Nothing selected" message="No invoice selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !inv) return <ErrorState message={error?.message ?? "Invoice not found"} onRetry={() => refetch()} />;

  const isVoid = inv.status === "void";
  const lines = inv.lines ?? [];
  const canReturn = can("sales.return") && !isVoid && inv.kind === "sale" && lines.some((l) => l.quantity - l.quantityReturned > 0);
  const canPay = can("customers.payments") && !isVoid && inv.amountDue > 0;
  const canVoid = can("sales.void") && !isVoid && inv.amountReturned === 0 && !inv.exchangeReturnId;
  const print = (format?: "receipt") => window.open(`/print/invoice?id=${inv.id}${format ? "&format=receipt" : ""}&autoprint=1`, "_blank");
  const paidPct = inv.total > 0 ? Math.min(100, Math.round((inv.amountPaid / inv.total) * 100)) : 0;
  const grossProfit = inv.netTotal - inv.costTotal;
  const marginPct = inv.netTotal ? Math.round((grossProfit / inv.netTotal) * 100) : 0;

  return (
    <>
      <PageHeader
        backHref="/sales"
        breadcrumbs={[{ label: "Invoices", href: "/sales" }, { label: inv.number }]}
        eyebrow={inv.kind === "opening_balance" ? "Opening balance" : "Sales invoice"}
        title={<span className="font-mono tracking-tight">{inv.number}</span>}
        badge={isVoid ? <InvoiceStatusBadge status="void" /> : <PaymentStatusBadge status={inv.paymentStatus} />}
        description={`${formatDate(inv.date, { weekday: "short", year: "numeric", month: "short", day: "numeric" })} · ${inv.locationName ?? ""}`}
        actions={
          <>
            <Button variant="outline" onClick={() => print("receipt")}>
              <Receipt /> Receipt
            </Button>
            <Button variant="outline" onClick={() => print()}>
              <Printer /> Invoice
            </Button>
            {canPay && gw.data?.enabled && (
              <Button variant="outline" loading={checkout.isPending} onClick={() => checkout.mutate()}>
                <CreditCard /> Pay online
              </Button>
            )}
            {canPay && (
              <Button variant="ink" onClick={() => setPayOpen(true)}>
                <HandCoins /> Receive payment
              </Button>
            )}
            {(canReturn || canVoid) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {canReturn && (
                    <DropdownMenuItem asChild>
                      <Link href={`/sales/returns/new?invoiceId=${inv.id}`}>
                        <Undo2 /> Return items
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {canVoid && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={async () => {
                          const reason = await confirm({
                            title: `Void ${inv.number}?`,
                            description: "Every journal, stock movement and payment is reversed. This can't be undone.",
                            tone: "destructive",
                            requireReason: true,
                            confirmText: "Void invoice",
                          });
                          if (typeof reason === "string") voidInv.mutate(reason);
                        }}
                      >
                        <Ban /> Void invoice
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {isVoid && (
        <div className="mb-6 rounded-2xl border border-destructive/25 bg-destructive-soft/50 px-5 py-4 text-sm">
          <p className="font-medium text-destructive-soft-foreground">This invoice was voided{inv.voidedAt ? ` on ${formatDateTime(inv.voidedAt)}` : ""}.</p>
          {inv.voidReason && <p className="mt-0.5 text-muted-foreground">Reason: {inv.voidReason}</p>}
        </div>
      )}

      {/* Signature "black card": the invoice total, settlement progress and headline numbers. */}
      <section
        className={cn(
          "metal relative mb-6 overflow-hidden rounded-3xl p-6 text-white sm:p-8",
          isVoid && "opacity-60 saturate-50",
        )}
      >
        <div className="grid gap-8">
          <div className="min-w-0">
            <p className="eyebrow text-white/50">Invoice total</p>
            <p className="figure mt-3 text-4xl leading-none text-gold sm:text-5xl">{money.format(inv.total)}</p>

            <div className="mt-7">
              <div className="flex items-center justify-between text-[13px] text-white/60">
                <span>{isVoid ? "Voided" : paidPct >= 100 ? "Fully settled" : `${paidPct}% settled`}</span>
                <span className="num">{inv.payments?.length ?? 0} payment{(inv.payments?.length ?? 0) === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-highlight/70 to-highlight transition-[width] duration-700"
                  style={{ width: `${isVoid ? 0 : paidPct}%` }}
                />
              </div>
            </div>
          </div>

          <dl className="grid gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10 sm:grid-cols-3">
            <HeroStat label="Paid" value={money.format(inv.amountPaid)} />
            <HeroStat
              label="Balance due"
              value={isVoid ? "—" : inv.amountDue > 0 ? money.format(inv.amountDue) : "Settled"}
              accent={!isVoid && inv.amountDue > 0}
            />
            {can("reports.view") && !isVoid && <HeroStat label="Gross profit" value={money.format(grossProfit)} sub={`${marginPct}% margin`} />}
          </dl>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <Panel title="Items" aside={<span className="label-caps text-muted-foreground">{lines.length} {lines.length === 1 ? "line" : "lines"}</span>}>
            <ul className="divide-y divide-border/60">
              {lines.map((l) => {
                const discount = l.lineDiscount + l.docDiscount;
                return (
                  <li key={l.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-6 py-4">
                    <span className="num flex size-11 items-center justify-center rounded-xl bg-muted font-display text-[15px] font-semibold">
                      {formatQty(l.quantity)}
                    </span>
                    <div className="min-w-0">
                      {l.productId ? (
                        <Link href={`/products/view?id=${l.productId}`} className="block truncate font-medium hover:underline">
                          {l.name}
                        </Link>
                      ) : (
                        <p className="truncate font-medium">{l.name}</p>
                      )}
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                        {l.sku && <span className="font-mono text-[11.5px]">{l.sku}</span>}
                        <span className="num">
                          × <Money value={l.unitPrice} />
                        </span>
                        {discount > 0 && (
                          <span className="num">
                            − <Money value={discount} />
                          </span>
                        )}
                        {l.taxRate ? <span className="rounded-md bg-muted px-1.5 py-px text-[11px]">{l.taxRate}% tax</span> : null}
                        {l.note && <span className="italic">{l.note}</span>}
                        {l.quantityReturned > 0 && <span className="text-warning">{formatQty(l.quantityReturned)} returned</span>}
                      </p>
                    </div>
                    <Money value={l.total} className="figure text-[15px] font-semibold" />
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-border/60 bg-muted/35 px-6 py-5">
              <dl className="ml-auto grid max-w-sm gap-2 text-sm">
                <TotalRow label="Subtotal" value={inv.subtotal + inv.itemDiscount} />
                {inv.discountTotal > 0 && <TotalRow label="Discounts" value={-inv.discountTotal} />}
                <TotalRow label={`Tax${inv.taxInclusive ? " (included)" : ""}`} value={inv.taxTotal} muted={inv.taxInclusive} />
                {inv.shipping > 0 && <TotalRow label="Charges" value={inv.shipping} />}
                {inv.roundOff !== 0 && <TotalRow label="Rounding" value={inv.roundOff} muted />}
                <div className="rule-double-top mt-2 flex items-baseline justify-between pt-3">
                  <dt className="font-display text-base font-semibold">Total</dt>
                  <dd className="figure text-lg">{money.format(inv.total)}</dd>
                </div>
                {inv.amountReturned > 0 && <TotalRow label="Returned" value={-inv.amountReturned} />}
                <TotalRow label="Paid" value={inv.amountPaid} />
                {inv.amountDue > 0 && !isVoid && (
                  <div className="flex justify-between font-semibold text-destructive">
                    <dt>Balance due</dt>
                    <dd className="num">{money.format(inv.amountDue)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </Panel>

          <Panel title="Payments" aside={<span className="label-caps text-muted-foreground">{inv.payments?.length ?? 0} recorded</span>}>
            {(inv.payments ?? []).length === 0 ? (
              <p className="px-6 py-6 text-[13px] text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ol className="px-6 py-5">
                {inv.payments!.map((p, i, all) => {
                  const alloc = p.allocations.find((a) => a.docId === inv.id)?.amount ?? p.amount;
                  const voided = p.status === "void";
                  return (
                    <li key={p.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < all.length - 1 && <span aria-hidden className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />}
                      <span
                        aria-hidden
                        className={cn(
                          "relative mt-1.5 size-[15px] shrink-0 rounded-full ring-4 ring-card",
                          voided ? "bg-border-strong" : "bg-highlight",
                        )}
                      />
                      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-6 gap-y-1">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {p.methodName ?? TENDER_LABELS[p.tender]}
                            {voided && (
                              <Badge variant="neutral" className="ml-2">
                                Void
                              </Badge>
                            )}
                          </p>
                          <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
                            {[p.number, p.reference, p.giftCardCode].filter(Boolean).join(" · ")}
                          </p>
                          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{formatDateTime(p.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <Money
                            value={p.direction === "in" ? alloc : -alloc}
                            className={cn("figure text-[15px] font-semibold", voided && "line-through text-muted-foreground")}
                          />
                          {p.change ? <p className="num text-[11.5px] text-muted-foreground">change {money.format(p.change)}</p> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel title="Customer">
            {inv.customerId ? (
              <Link
                href={`/customers/view?id=${inv.customerId}`}
                className="group flex items-center gap-4 rounded-2xl p-2 -m-2 transition-colors hover:bg-muted/60"
              >
                <Avatar name={inv.customerName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-semibold">{inv.customerName}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{inv.customerPhone ?? "View account"}</p>
                </div>
                <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            ) : (
              <div className="flex items-center gap-4">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <HandCoins className="size-[17px]" strokeWidth={1.8} />
                </span>
                <p className="text-sm text-muted-foreground">Walk-in customer</p>
              </div>
            )}
          </Panel>

          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Date", value: formatDate(inv.date) },
                { label: "Due date", value: inv.dueDate ? formatDate(inv.dueDate) : null, hideEmpty: true },
                { label: "Location", value: inv.locationName },
                { label: "Salesperson", value: inv.salespersonName ?? inv.createdByName },
                { label: "Rung up by", value: inv.createdByName },
                { label: "Created", value: formatDateTime(inv.createdAt) },
                { label: "Price tier", value: inv.priceTier === "wholesale" ? "Wholesale" : null, hideEmpty: true },
                {
                  label: "Loyalty",
                  value:
                    business.loyaltyEnabled && (inv.pointsEarned || inv.pointsRedeemed)
                      ? `${inv.pointsEarned ? `+${inv.pointsEarned} earned` : ""}${inv.pointsEarned && inv.pointsRedeemed ? " · " : ""}${inv.pointsRedeemed ? `${inv.pointsRedeemed} redeemed` : ""}`
                      : null,
                  hideEmpty: true,
                },
                { label: "Note", value: inv.note ? <span className="whitespace-pre-line">{inv.note}</span> : null, hideEmpty: true },
              ]}
            />
          </Panel>

          {(inv.returns?.length ?? 0) > 0 && (
            <Panel title="Returns" flush>
              <ul className="divide-y divide-border/60">
                {inv.returns!.map((r) => (
                  <li key={r.id}>
                    <Link href={`/sales/returns/view?id=${r.id}`} className="flex items-center justify-between px-6 py-3.5 text-sm transition-colors hover:bg-muted/50">
                      <span>
                        <span className="font-mono text-[12.5px] font-medium">{r.number}</span>
                        <span className="ml-2 text-muted-foreground">{formatDate(r.date)}</span>
                      </span>
                      <Money value={r.total} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {inv.exchangeReturnId && (
            <Button variant="outline" asChild>
              <Link href={`/sales/returns/view?id=${inv.exchangeReturnId}`}>
                <FileText /> View the exchange return
              </Link>
            </Button>
          )}
        </div>
      </div>

      {canPay && <InvoicePaymentDialog open={payOpen} onOpenChange={setPayOpen} invoice={inv} />}
    </>
  );
}

/** Soft, borderless panel used for every section on this page. */
function Panel({
  title,
  aside,
  flush,
  className,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl bg-card shadow-card", className)}>
      <header className={cn("flex items-center justify-between gap-4 px-6 pt-5", flush ? "pb-4" : "pb-3")}>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {aside}
      </header>
      {flush ? children : <div className="px-6 pb-6">{children}</div>}
    </section>
  );
}

function HeroStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-black/25 px-5 py-4 backdrop-blur-sm">
      <dt className="label-caps text-white/50">{label}</dt>
      <dd className={cn("figure mt-2 text-xl", accent ? "text-highlight" : "text-white")}>{value}</dd>
      {sub && <p className="num mt-0.5 text-[12px] text-white/50">{sub}</p>}
    </div>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted-foreground")}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num">
        <Money value={value} />
      </dd>
    </div>
  );
}

function InvoicePaymentDialog({ open, onOpenChange, invoice }: { open: boolean; onOpenChange: (o: boolean) => void; invoice: Invoice }) {
  const today = useBusinessToday();
  const defaultMethod = useDefaultMethodId();
  const customer = useApiQuery<Customer>(open && invoice.customerId ? `/customers/${invoice.customerId}` : null);
  const credit = customer.data?.creditBalance ?? 0;
  const [mode, setMode] = React.useState<"method" | "store_credit">("method");
  const [methodId, setMethodId] = React.useState<string | undefined>(defaultMethod);
  const [amount, setAmount] = React.useState(invoice.amountDue);
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState(today);
  React.useEffect(() => {
    if (open) {
      setMode("method");
      setMethodId(defaultMethod);
      setAmount(invoice.amountDue);
      setReference("");
      setDate(today);
    }
  }, [open, invoice.amountDue, defaultMethod, today]);

  const pay = useApiMutation((body: InvoicePaymentInput) => api.post<Invoice>(`/sales/${invoice.id}/payments`, body), {
    invalidate: INVALIDATE,
    success: "Payment recorded",
    onSuccess: () => onOpenChange(false),
  });

  const max = mode === "store_credit" ? Math.min(invoice.amountDue, credit) : invoice.amountDue;
  const valid = amount > 0 && amount <= max && (mode === "store_credit" || !!methodId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            const tender: TenderInput =
              mode === "method" ? { tender: "method", methodId, amount, reference: reference.trim() || null } : { tender: "store_credit", amount };
            pay.mutate({ date, payments: [tender] });
          }}
        >
          <DialogHeader>
            <DialogTitle>Receive payment</DialogTitle>
            <DialogDescription>
              {invoice.number} · balance <Money value={invoice.amountDue} className="font-medium text-foreground" />
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            {credit > 0 && (
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => {
                  if (!v) return;
                  setMode(v as "method" | "store_credit");
                  setAmount(v === "store_credit" ? Math.min(invoice.amountDue, credit) : invoice.amountDue);
                }}
                className="w-full"
              >
                <ToggleGroupItem value="method" className="flex-1">
                  Money
                </ToggleGroupItem>
                <ToggleGroupItem value="store_credit" className="flex-1">
                  Store credit (<Money value={credit} />)
                </ToggleGroupItem>
              </ToggleGroup>
            )}
            <Field label="Amount" required error={amount > max ? "More than allowed" : null}>
              <MoneyInput value={amount} onChange={setAmount} autoFocus />
            </Field>
            {mode === "method" && (
              <>
                <Field label="Method" required>
                  <PaymentMethodSelect value={methodId} onChange={setMethodId} />
                </Field>
                <Field label="Reference" htmlFor="ip-ref">
                  <Input id="ip-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Date" htmlFor="ip-date">
              <Input id="ip-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pay.isPending} disabled={!valid}>
              Record <Money value={amount} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
