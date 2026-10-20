"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ban, FileText, HandCoins, MoreHorizontal, Printer, Receipt, Undo2 } from "lucide-react";
import type { Customer, Invoice, InvoicePaymentInput, TenderInput } from "@shopbooks/shared";
import { TENDER_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatQty } from "@/lib/utils";

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
            {canPay && (
              <Button onClick={() => setPayOpen(true)}>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <SectionCard title="Items" flush>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Item</TableHead>
                  <TableHead align="right">Qty</TableHead>
                  <TableHead align="right" className="hidden sm:table-cell">
                    Price
                  </TableHead>
                  <TableHead align="right" className="hidden md:table-cell">
                    Discount
                  </TableHead>
                  <TableHead align="right" className="hidden lg:table-cell">
                    Tax
                  </TableHead>
                  <TableHead align="right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id} className="hover:bg-transparent">
                    <TableCell>
                      {l.productId ? (
                        <Link href={`/products/view?id=${l.productId}`} className="font-medium hover:underline">
                          {l.name}
                        </Link>
                      ) : (
                        <p className="font-medium">{l.name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {[l.sku, l.note].filter(Boolean).join(" · ")}
                        {l.quantityReturned > 0 && <span className="ml-1 text-warning">· {formatQty(l.quantityReturned)} returned</span>}
                      </p>
                    </TableCell>
                    <TableCell numeric>{formatQty(l.quantity)}</TableCell>
                    <TableCell numeric className="hidden sm:table-cell">
                      <Money value={l.unitPrice} />
                    </TableCell>
                    <TableCell numeric className="hidden md:table-cell">
                      <Money value={l.lineDiscount + l.docDiscount} dashZero />
                    </TableCell>
                    <TableCell numeric className="hidden text-muted-foreground lg:table-cell">
                      {l.taxRate ? `${l.taxRate}%` : "—"}
                    </TableCell>
                    <TableCell numeric className="font-medium">
                      <Money value={l.total} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-border/70 px-6 py-4">
              <dl className="ml-auto grid max-w-xs gap-1.5 text-sm">
                <TotalRow label="Subtotal" value={inv.subtotal + inv.itemDiscount} />
                {inv.discountTotal > 0 && <TotalRow label="Discounts" value={-inv.discountTotal} />}
                <TotalRow label={`Tax${inv.taxInclusive ? " (included)" : ""}`} value={inv.taxTotal} muted={inv.taxInclusive} />
                {inv.shipping > 0 && <TotalRow label="Charges" value={inv.shipping} />}
                {inv.roundOff !== 0 && <TotalRow label="Rounding" value={inv.roundOff} muted />}
                <div className="rule-double-top mt-1 flex justify-between pt-2 font-display text-lg font-semibold">
                  <dt>Total</dt>
                  <dd className="figure">{money.format(inv.total)}</dd>
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
          </SectionCard>

          <SectionCard title="Payments" flush>
            {(inv.payments ?? []).length === 0 ? (
              <p className="px-6 py-5 text-[13px] text-muted-foreground">No payments recorded.</p>
            ) : (
              <Table>
                <TableBody>
                  {inv.payments!.map((p) => {
                    const alloc = p.allocations.find((a) => a.docId === inv.id)?.amount ?? p.amount;
                    return (
                      <TableRow key={p.id} className="hover:bg-transparent">
                        <TableCell>
                          <p className="font-medium">
                            {p.methodName ?? TENDER_LABELS[p.tender]}
                            {p.status === "void" && (
                              <Badge variant="neutral" className="ml-2">
                                Void
                              </Badge>
                            )}
                          </p>
                          <p className="font-mono text-[11.5px] text-muted-foreground">
                            {[p.number, p.reference, p.giftCardCode].filter(Boolean).join(" · ")}
                          </p>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDateTime(p.createdAt)}</TableCell>
                        <TableCell numeric className="font-medium">
                          <Money value={p.direction === "in" ? alloc : -alloc} className={p.status === "void" ? "line-through" : undefined} />
                          {p.change ? <p className="text-[11px] text-muted-foreground">change {money.format(p.change)}</p> : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title="Customer">
            {inv.customerId ? (
              <Link href={`/customers/view?id=${inv.customerId}`} className="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-muted/50">
                <Avatar name={inv.customerName} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{inv.customerName}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{inv.customerPhone ?? "View account"}</p>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">Walk-in customer</p>
            )}
          </SectionCard>

          <SectionCard title="Details">
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
                ...(can("reports.view")
                  ? [
                      {
                        label: "Gross profit",
                        value: isVoid ? null : (
                          <span>
                            <Money value={inv.netTotal - inv.costTotal} />{" "}
                            <span className="text-muted-foreground">
                              ({inv.netTotal ? Math.round(((inv.netTotal - inv.costTotal) / inv.netTotal) * 100) : 0}%)
                            </span>
                          </span>
                        ),
                        hideEmpty: true,
                      },
                    ]
                  : []),
                { label: "Note", value: inv.note ? <span className="whitespace-pre-line">{inv.note}</span> : null, hideEmpty: true },
              ]}
            />
          </SectionCard>

          {(inv.returns?.length ?? 0) > 0 && (
            <SectionCard title="Returns" flush>
              <ul className="divide-y divide-border/70">
                {inv.returns!.map((r) => (
                  <li key={r.id}>
                    <Link href={`/sales/returns/view?id=${r.id}`} className="flex items-center justify-between px-6 py-3 text-sm hover:bg-muted/40">
                      <span>
                        <span className="font-mono text-[12.5px] font-medium">{r.number}</span>
                        <span className="ml-2 text-muted-foreground">{formatDate(r.date)}</span>
                      </span>
                      <Money value={r.total} />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
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

function TotalRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={muted ? "flex justify-between text-muted-foreground" : "flex justify-between"}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
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
