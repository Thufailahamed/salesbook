"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ban, MoreHorizontal, PackageCheck, PackageMinus, Pencil, Printer, Wallet } from "lucide-react";
import type { Purchase, PurchaseReceiveInput, Supplier } from "@shopbooks/shared";
import { TENDER_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { Money } from "@/components/money";
import { PaymentStatusBadge, PurchaseStatusBadge } from "@/components/status-badge";
import { useConfirm } from "@/components/confirm-dialog";
import { Field, ToggleRow } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { PaymentMethodSelect } from "@/components/entity-selects";
import { useBusinessToday } from "@/components/filters";
import { useDefaultMethodId } from "@/components/party-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

const INVALIDATE = ["/purchases", "/suppliers", "/inventory", "/products", "/reports", "/accounting", "/payments"];

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <PurchaseView />
    </React.Suspense>
  );
}

function PurchaseView() {
  const id = useSearchParams().get("id");
  const confirm = useConfirm();
  const money = useMoney();
  const { can } = useSession();
  const { data: p, isLoading, error, refetch } = useApiQuery<Purchase>(id ? `/purchases/${id}` : null);
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);

  const cancel = useApiMutation(() => api.post<Purchase>(`/purchases/${id}/cancel`), { invalidate: INVALIDATE, success: "Order cancelled" });

  if (!id) return <ErrorState title="Nothing selected" message="No purchase selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !p) return <ErrorState message={error?.message ?? "Purchase not found"} onRetry={() => refetch()} />;

  const manage = can("purchases.manage");
  const ordered = p.status === "ordered";
  const received = p.status === "received";
  const canReturn = manage && received && p.kind === "purchase" && (p.lines ?? []).some((l) => l.quantity - l.quantityReturned > 0);

  return (
    <>
      <PageHeader
        backHref="/purchases"
        breadcrumbs={[{ label: "Purchases", href: "/purchases" }, { label: p.number }]}
        eyebrow={p.kind === "opening_balance" ? "Opening balance" : ordered ? "Purchase order" : "Purchase"}
        title={<span className="font-mono tracking-tight">{p.number}</span>}
        badge={received ? <PaymentStatusBadge status={p.paymentStatus} /> : <PurchaseStatusBadge status={p.status} />}
        description={`${p.supplierName ?? ""} · ${formatDate(p.receivedDate ?? p.orderDate)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.open(`/print/purchase?id=${p.id}&autoprint=1`, "_blank")}>
              <Printer /> Print
            </Button>
            {manage && ordered && (
              <Button onClick={() => setReceiveOpen(true)}>
                <PackageCheck /> Receive goods
              </Button>
            )}
            {manage && received && p.amountDue > 0 && (
              <Button onClick={() => setPayOpen(true)}>
                <Wallet /> Record payment
              </Button>
            )}
            {manage && (ordered || canReturn) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {ordered && (
                    <DropdownMenuItem asChild>
                      <Link href={`/purchases/new?id=${p.id}`}>
                        <Pencil /> Edit order
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {canReturn && (
                    <DropdownMenuItem asChild>
                      <Link href={`/purchases/returns/new?purchaseId=${p.id}`}>
                        <PackageMinus /> Return to supplier
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {ordered && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={async () => {
                          if (await confirm({ title: `Cancel order ${p.number}?`, tone: "destructive", confirmText: "Cancel order", cancelText: "Keep" }))
                            cancel.mutate();
                        }}
                      >
                        <Ban /> Cancel order
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <SectionCard title="Items" flush>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Item</TableHead>
                  <TableHead align="right">Qty</TableHead>
                  <TableHead align="right" className="hidden sm:table-cell">
                    Unit cost
                  </TableHead>
                  <TableHead align="right" className="hidden md:table-cell">
                    Landed cost
                  </TableHead>
                  <TableHead align="right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(p.lines ?? []).map((l) => (
                  <TableRow key={l.id} className="hover:bg-transparent">
                    <TableCell>
                      <Link href={`/products/view?id=${l.productId}`} className="font-medium hover:underline">
                        {l.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {l.sku}
                        {l.quantityReturned > 0 && <span className="ml-1 text-warning">· {formatQty(l.quantityReturned)} returned</span>}
                      </p>
                    </TableCell>
                    <TableCell numeric>{formatQty(l.quantity)}</TableCell>
                    <TableCell numeric className="hidden sm:table-cell">
                      <Money value={l.unitCost} />
                    </TableCell>
                    <TableCell numeric className="hidden text-muted-foreground md:table-cell">
                      <Money value={l.landedUnitCost} />
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
                <Row label="Subtotal" value={p.subtotal + p.itemDiscount} />
                {p.discountTotal > 0 && <Row label="Discounts" value={-p.discountTotal} />}
                <Row label={p.taxInclusive ? "Tax (included)" : "Tax"} value={p.taxTotal} />
                {p.shipping > 0 && <Row label="Freight" value={p.shipping} />}
                <div className="rule-double-top mt-1 flex justify-between pt-2 font-display text-lg font-semibold">
                  <dt>Total</dt>
                  <dd className="figure">{money.format(p.total)}</dd>
                </div>
                {received && (
                  <>
                    {p.amountReturned > 0 && <Row label="Returned" value={-p.amountReturned} />}
                    <Row label="Paid" value={p.amountPaid} />
                    {p.amountDue > 0 && (
                      <div className="flex justify-between font-semibold text-destructive">
                        <dt>Balance due</dt>
                        <dd className="num">{money.format(p.amountDue)}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </div>
          </SectionCard>

          {received && (
            <SectionCard title="Payments" flush>
              {(p.payments ?? []).length === 0 ? (
                <p className="px-6 py-5 text-[13px] text-muted-foreground">No payments yet.</p>
              ) : (
                <Table>
                  <TableBody>
                    {p.payments!.map((pm) => (
                      <TableRow key={pm.id} className="hover:bg-transparent">
                        <TableCell>
                          <p className="font-medium">
                            {pm.methodName ?? TENDER_LABELS[pm.tender]}
                            {pm.status === "void" && (
                              <Badge variant="neutral" className="ml-2">
                                Void
                              </Badge>
                            )}
                          </p>
                          <p className="font-mono text-[11.5px] text-muted-foreground">{[pm.number, pm.reference].filter(Boolean).join(" · ")}</p>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(pm.date)}</TableCell>
                        <TableCell numeric className="font-medium">
                          <Money value={pm.allocations.find((a) => a.docId === p.id)?.amount ?? pm.amount} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>
          )}
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title="Details">
            <KeyValue
              items={[
                {
                  label: "Supplier",
                  value: (
                    <Link href={`/suppliers/view?id=${p.supplierId}`} className="hover:underline">
                      {p.supplierName}
                    </Link>
                  ),
                },
                { label: "Supplier ref", value: p.supplierRef, hideEmpty: true },
                { label: "Location", value: p.locationName },
                { label: "Order date", value: formatDate(p.orderDate) },
                { label: "Received", value: p.receivedDate ? formatDate(p.receivedDate) : null, hideEmpty: true },
                { label: "Due date", value: p.dueDate ? formatDate(p.dueDate) : null, hideEmpty: true },
                { label: "Created by", value: p.createdByName },
                { label: "Created", value: formatDateTime(p.createdAt) },
                { label: "Note", value: p.note ? <span className="whitespace-pre-line">{p.note}</span> : null, hideEmpty: true },
              ]}
            />
          </SectionCard>
          {(p.returns?.length ?? 0) > 0 && (
            <SectionCard title="Returns" flush>
              <ul className="divide-y divide-border/70">
                {p.returns!.map((r) => (
                  <li key={r.id}>
                    <Link href={`/purchases/returns/view?id=${r.id}`} className="flex items-center justify-between px-6 py-3 text-sm hover:bg-muted/40">
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
        </div>
      </div>

      {ordered && <ReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} purchase={p} />}
      {received && p.amountDue > 0 && <PayDialog open={payOpen} onOpenChange={setPayOpen} purchase={p} />}
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  );
}

function ReceiveDialog({ open, onOpenChange, purchase }: { open: boolean; onOpenChange: (o: boolean) => void; purchase: Purchase }) {
  const today = useBusinessToday();
  const defaultMethod = useDefaultMethodId();
  const supplier = useApiQuery<Supplier>(open ? `/suppliers/${purchase.supplierId}` : null);
  const [date, setDate] = React.useState(today);
  const [amount, setAmount] = React.useState(0);
  const [methodId, setMethodId] = React.useState<string | undefined>(defaultMethod);
  const [reference, setReference] = React.useState("");
  const [applyCredit, setApplyCredit] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setDate(today);
      setAmount(0);
      setMethodId(defaultMethod);
      setReference("");
      setApplyCredit(false);
    }
  }, [open, today, defaultMethod]);

  const receive = useApiMutation((body: PurchaseReceiveInput) => api.post<Purchase>(`/purchases/${purchase.id}/receive`, body), {
    invalidate: INVALIDATE,
    success: (p) => `${p.number} received into stock`,
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            receive.mutate({
              receivedDate: date,
              payments: amount > 0 && methodId ? [{ methodId, amount, reference: reference.trim() || null }] : [],
              applySupplierCredit: applyCredit,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Receive {purchase.number}</DialogTitle>
            <DialogDescription>
              Adds the items to stock at {purchase.locationName} and posts the bill of <Money value={purchase.total} className="font-medium text-foreground" />.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Received on" htmlFor="rcv-date">
              <Input id="rcv-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Pay now (optional)" error={amount > purchase.total ? "More than the bill" : null}>
              <MoneyInput value={amount} onChange={setAmount} />
            </Field>
            {amount > 0 && (
              <>
                <Field label="Method">
                  <PaymentMethodSelect value={methodId} onChange={setMethodId} />
                </Field>
                <Field label="Reference" htmlFor="rcv-ref">
                  <Input id="rcv-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
              </>
            )}
            {(supplier.data?.creditBalance ?? 0) > 0 && (
              <ToggleRow
                title="Use supplier credit"
                description={
                  <>
                    <Money value={supplier.data!.creditBalance} /> available
                  </>
                }
              >
                <Switch checked={applyCredit} onCheckedChange={setApplyCredit} />
              </ToggleRow>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={receive.isPending} disabled={amount > purchase.total || (amount > 0 && !methodId)}>
              Receive goods
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ open, onOpenChange, purchase }: { open: boolean; onOpenChange: (o: boolean) => void; purchase: Purchase }) {
  const today = useBusinessToday();
  const defaultMethod = useDefaultMethodId();
  const [date, setDate] = React.useState(today);
  const [amount, setAmount] = React.useState(purchase.amountDue);
  const [methodId, setMethodId] = React.useState<string | undefined>(defaultMethod);
  const [reference, setReference] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setDate(today);
      setAmount(purchase.amountDue);
      setMethodId(defaultMethod);
      setReference("");
    }
  }, [open, today, defaultMethod, purchase.amountDue]);

  const pay = useApiMutation(
    (body: { date: string; payments: { methodId: string; amount: number; reference: string | null }[] }) =>
      api.post<Purchase>(`/purchases/${purchase.id}/payments`, body),
    { invalidate: INVALIDATE, success: "Payment recorded", onSuccess: () => onOpenChange(false) },
  );
  const invalid = amount <= 0 || amount > purchase.amountDue || !methodId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) pay.mutate({ date, payments: [{ methodId: methodId!, amount, reference: reference.trim() || null }] });
          }}
        >
          <DialogHeader>
            <DialogTitle>Pay {purchase.number}</DialogTitle>
            <DialogDescription>
              Balance <Money value={purchase.amountDue} className="font-medium text-foreground" /> to {purchase.supplierName}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Amount" error={amount > purchase.amountDue ? "More than the balance" : null}>
              <MoneyInput value={amount} onChange={setAmount} autoFocus />
            </Field>
            <Field label="Method">
              <PaymentMethodSelect value={methodId} onChange={setMethodId} />
            </Field>
            <Field label="Reference" htmlFor="pp-ref">
              <Input id="pp-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Date" htmlFor="pp-date">
              <Input id="pp-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pay.isPending} disabled={invalid}>
              Pay <Money value={amount} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
