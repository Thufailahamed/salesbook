"use client";

import * as React from "react";
import { CheckCircle2, FileText, PauseCircle, Printer, Receipt, ScanLine, Search, Trash2 } from "lucide-react";
import type { CheckoutResponse, DiscountType, HeldSale, Invoice, ReturnableLine } from "@shopbooks/shared";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldGrid } from "@/components/form-field";
import { MoneyInput, PercentInput, QtyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/empty-state";
import { TaxRateSelect } from "@/components/entity-selects";
import { ReturnLinesPicker, type ReturnPicks } from "@/components/return-lines-picker";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatQty, relativeTime } from "@/lib/utils";
import { lineKey, returnCredit, type CartLine, type CartState, type ReturnSelection } from "./cart";

// ---------------------------------------------------------------- discount input

export function DiscountInput({
  type,
  value,
  onChange,
}: {
  type: DiscountType | null;
  value: number | null;
  onChange: (type: DiscountType | null, value: number | null) => void;
}) {
  const t = type ?? "percent";
  return (
    <div className="flex gap-2">
      <ToggleGroup type="single" value={t} onValueChange={(v) => v && onChange(v as DiscountType, null)} className="shrink-0">
        <ToggleGroupItem value="percent">%</ToggleGroupItem>
        <ToggleGroupItem value="amount">Amount</ToggleGroupItem>
      </ToggleGroup>
      {t === "percent" ? (
        <PercentInput value={value ?? 0} onChange={(v) => onChange(v > 0 ? "percent" : null, v > 0 ? v : null)} />
      ) : (
        <MoneyInput value={value ?? 0} onChange={(v) => onChange(v > 0 ? "amount" : null, v > 0 ? v : null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- line edit

export function LineEditDialog({
  line,
  onOpenChange,
  canOverride,
  onSave,
  onRemove,
}: {
  line: CartLine | null;
  onOpenChange: (o: boolean) => void;
  canOverride: boolean;
  onSave: (l: CartLine) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = React.useState<CartLine | null>(line);
  React.useEffect(() => setDraft(line), [line]);
  if (!draft) return null;
  const set = (patch: Partial<CartLine>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  return (
    <Dialog open={!!line} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft);
          }}
        >
          <DialogHeader>
            <DialogTitle>{draft.name}</DialogTitle>
            {draft.variantName && <DialogDescription>{draft.variantName}</DialogDescription>}
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <FieldGrid>
              <Field label="Quantity">
                <QtyInput value={draft.quantity} onChange={(v) => set({ quantity: v })} allowDecimal={draft.allowDecimal} min={0} steppers autoFocus />
              </Field>
              <Field label="Unit price" hint={!canOverride && draft.variantId ? "Needs manager permission" : undefined}>
                <MoneyInput value={draft.unitPrice} onChange={(v) => set({ unitPrice: v })} disabled={!canOverride && !!draft.variantId} />
              </Field>
            </FieldGrid>
            <Field label="Line discount">
              <DiscountInput type={draft.discountType} value={draft.discountValue} onChange={(t, v) => set({ discountType: t, discountValue: v })} />
            </Field>
            <Field label="Note" htmlFor="line-note" hint="Printed under the item (e.g. alteration details, serial no.)">
              <Input id="line-note" value={draft.note ?? ""} onChange={(e) => set({ note: e.target.value || null })} />
            </Field>
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" className="text-destructive" onClick={onRemove}>
              <Trash2 /> Remove
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={draft.quantity <= 0}>
                Update
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- custom item

export function CustomItemDialog({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (l: CartLine) => void }) {
  const { business, taxRates } = useSession();
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState(0);
  const [qty, setQty] = React.useState(1);
  const [taxRateId, setTaxRateId] = React.useState<string | null>(business.defaultTaxRateId);
  React.useEffect(() => {
    if (open) {
      setName("");
      setPrice(0);
      setQty(1);
      setTaxRateId(business.defaultTaxRateId);
    }
  }, [open, business.defaultTaxRateId]);
  const rate = taxRates.find((t) => t.id === taxRateId)?.rate ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || qty <= 0) return;
            onAdd({
              key: lineKey(),
              variantId: null,
              productId: null,
              name: name.trim(),
              variantName: "",
              sku: null,
              quantity: qty,
              unitPrice: price,
              listPrice: price,
              retailPrice: price,
              wholesalePrice: null,
              discountType: null,
              discountValue: null,
              taxRate: rate,
              allowDecimal: true,
              trackInventory: false,
              stock: 0,
              imageUrl: null,
              unitShortName: null,
              note: null,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Custom item</DialogTitle>
            <DialogDescription>Sell something that isn&apos;t in the catalog (no stock is tracked).</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Description" htmlFor="ci-name" required>
              <Input id="ci-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Alteration, delivery, gift wrap…" />
            </Field>
            <FieldGrid>
              <Field label="Price" required>
                <MoneyInput value={price} onChange={setPrice} />
              </Field>
              <Field label="Quantity">
                <QtyInput value={qty} onChange={setQty} allowDecimal min={0} />
              </Field>
            </FieldGrid>
            <Field label="Tax">
              <TaxRateSelect value={taxRateId} onChange={setTaxRateId} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || qty <= 0}>
              Add to cart
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- cart options (discount, shipping, note)

export function CartOptionsDialog({
  open,
  onOpenChange,
  cart,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cart: CartState;
  onSave: (patch: Partial<CartState>) => void;
}) {
  const [type, setType] = React.useState<DiscountType | null>(cart.docDiscountType);
  const [value, setValue] = React.useState<number | null>(cart.docDiscountValue);
  const [shipping, setShipping] = React.useState(cart.shipping);
  const [note, setNote] = React.useState(cart.note);
  React.useEffect(() => {
    if (open) {
      setType(cart.docDiscountType);
      setValue(cart.docDiscountValue);
      setShipping(cart.shipping);
      setNote(cart.note);
    }
  }, [open, cart]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ docDiscountType: type, docDiscountValue: value, shipping, note });
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Discount & charges</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Cart discount" hint="Spread across all items in proportion to their value">
              <DiscountInput
                type={type}
                value={value}
                onChange={(t, v) => {
                  setType(t);
                  setValue(v);
                }}
              />
            </Field>
            <Field label="Delivery / extra charges" hint="Added after tax">
              <MoneyInput value={shipping} onChange={setShipping} />
            </Field>
            <Field label="Invoice note" htmlFor="cart-note">
              <Textarea id="cart-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Apply</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- return lookup

export function ReturnLookupDialog({
  open,
  onOpenChange,
  initial,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ReturnSelection | null;
  onConfirm: (sel: ReturnSelection | null) => void;
}) {
  const [number, setNumber] = React.useState("");
  const [invoice, setInvoice] = React.useState<Invoice | null>(initial?.invoice ?? null);
  const [lines, setLines] = React.useState<ReturnableLine[]>(initial?.lines ?? []);
  const [picks, setPicks] = React.useState<ReturnPicks>(initial?.picks ?? {});
  const [reason, setReason] = React.useState(initial?.reason ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setNumber(initial?.invoice.number ?? "");
    setInvoice(initial?.invoice ?? null);
    setLines(initial?.lines ?? []);
    setPicks(initial?.picks ?? {});
    setReason(initial?.reason ?? "");
    setError(null);
  }, [open, initial]);

  const lookup = async () => {
    const n = number.trim();
    if (!n) return;
    setLoading(true);
    setError(null);
    try {
      const inv = await api.get<Invoice>("/sales/lookup", { number: n });
      if (inv.status === "void") throw new Error(`${inv.number} is void`);
      const rl = await api.get<ReturnableLine[]>(`/sales/${inv.id}/returnable`);
      if (!rl.some((l) => l.returnableQuantity > 0)) throw new Error(`Everything on ${inv.number} has already been returned`);
      setInvoice(inv);
      setLines(rl);
      setPicks({});
    } catch (e) {
      setInvoice(null);
      setLines([]);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const sel: ReturnSelection | null = invoice ? { invoice, lines, picks, reason } : null;
  const credit = returnCredit(sel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Return or exchange</DialogTitle>
          <DialogDescription>Find the original invoice, pick what&apos;s coming back, then add any replacement items to the cart.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label="Invoice number" error={error}>
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
                placeholder="Scan the receipt or type INV-…"
                className="font-mono"
                autoFocus
              />
              <Button variant="outline" onClick={lookup} loading={loading}>
                <Search /> Find
              </Button>
            </div>
          </Field>
          {invoice && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-4 py-3 text-[13px]">
                <span>
                  <span className="font-mono font-medium">{invoice.number}</span> · {formatDate(invoice.date)} · {invoice.customerName ?? "Walk-in"}
                </span>
                <span>
                  Total <Money value={invoice.total} className="font-medium" />
                  {invoice.amountDue > 0 && (
                    <>
                      {" "}
                      · due <Money value={invoice.amountDue} className="font-medium text-destructive" />
                    </>
                  )}
                </span>
              </div>
              <div className="-mx-6 border-y border-border">
                <ReturnLinesPicker lines={lines} picks={picks} onChange={setPicks} />
              </div>
              <Field label="Reason" htmlFor="ret-reason">
                <Input id="ret-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong size, defective…" />
              </Field>
            </>
          )}
        </DialogBody>
        <DialogFooter className="sm:justify-between">
          {initial ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                onConfirm(null);
                onOpenChange(false);
              }}
            >
              Cancel return
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              disabled={!sel || credit.count <= 0}
              onClick={() => {
                onConfirm(sel);
                onOpenChange(false);
              }}
            >
              Return {credit.count > 0 ? `${formatQty(credit.count)} items · ` : ""}
              <Money value={credit.total} />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- held sales

export function HeldSalesSheet({
  open,
  onOpenChange,
  locationId,
  onResume,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  locationId: string;
  onResume: (h: HeldSale) => void;
}) {
  const { data, isLoading } = useApiQuery<HeldSale[]>(open ? "/held-sales" : null, { locationId });
  const del = useApiMutation((id: string) => api.del(`/held-sales/${id}`), { invalidate: ["/held-sales"], success: "Held sale discarded" });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Held sales</SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0">
          {isLoading ? (
            <p className="p-6 text-center text-[13px] text-muted-foreground">Loading…</p>
          ) : !data || data.length === 0 ? (
            <EmptyState compact icon={PauseCircle} title="Nothing on hold" description="Park a cart with Hold (F4) to serve another customer." />
          ) : (
            <ul className="divide-y divide-border/70">
              {data.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-5 py-3.5">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onResume(h)}>
                    <p className="truncate font-medium">{h.label || h.customerName || "Walk-in customer"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatQty(h.itemCount)} items · {h.userName ?? "—"} · {relativeTime(h.createdAt)}
                    </p>
                  </button>
                  <Money value={h.total} className="font-semibold" />
                  <Button variant="ghost" size="icon-sm" onClick={() => del.mutate(h.id)} aria-label="Discard held sale">
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------- sale complete

export function SaleCompleteDialog({ result, onNewSale }: { result: CheckoutResponse | null; onNewSale: () => void }) {
  const money = useMoney();
  const inv = result?.invoice;
  const ret = result?.saleReturn;
  const printReceipt = () => {
    if (inv) window.open(`/print/invoice?id=${inv.id}&format=receipt&autoprint=1`, "_blank");
    else if (ret) window.open(`/print/return?id=${ret.id}&format=receipt&autoprint=1`, "_blank");
  };
  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onNewSale()}>
      <DialogContent size="sm" hideClose onEscapeKeyDown={onNewSale}>
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-7" />
          </span>
          <DialogTitle>{inv ? "Sale complete" : "Return complete"}</DialogTitle>
          <DialogDescription>
            {inv && <span className="font-mono">{inv.number}</span>}
            {inv && ret && " · "}
            {ret && <span className="font-mono">{ret.number}</span>}
          </DialogDescription>
        </div>
        <DialogBody className="grid gap-2">
          {inv && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <Money value={inv.total} className="font-semibold" />
            </div>
          )}
          {inv && inv.amountDue > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">On account</span>
              <Money value={inv.amountDue} className="font-semibold text-destructive" />
            </div>
          )}
          {ret && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Returned</span>
              <Money value={ret.total} />
            </div>
          )}
          {result && result.refunded > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Refunded</span>
              <Money value={result.refunded} className="font-semibold" />
            </div>
          )}
          {ret && ret.toStoreCredit > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Added to store credit</span>
              <Money value={ret.toStoreCredit} className="font-semibold" />
            </div>
          )}
          {result && result.change > 0 && (
            <div className="mt-2 rounded-xl bg-highlight-soft px-4 py-3 text-center">
              <p className="label-caps">Change due</p>
              <p className="figure text-4xl">{money.format(result.change)}</p>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={printReceipt}>
            <Receipt /> Receipt
          </Button>
          {inv ? (
            <Button variant="outline" onClick={() => window.open(`/print/invoice?id=${inv.id}&autoprint=1`, "_blank")}>
              <FileText /> A4 invoice
            </Button>
          ) : (
            <Button variant="outline" onClick={() => ret && window.open(`/print/return?id=${ret.id}&autoprint=1`, "_blank")}>
              <Printer /> Credit note
            </Button>
          )}
          <Button className="col-span-2" size="lg" onClick={onNewSale} autoFocus>
            New sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
