"use client";

import * as React from "react";
import type {
  ApplyCreditInput,
  CreditRefundInput,
  Customer,
  CustomerInput,
  OpenDocument,
  PartyPaymentInput,
  Payment,
  Supplier,
  SupplierInput,
} from "@shopbooks/shared";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, FieldGrid, ToggleRow } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { PaymentMethodSelect } from "@/components/entity-selects";
import { useBusinessToday } from "@/components/filters";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type PartyKind = "customer" | "supplier";

const nn = (s: string) => (s.trim() ? s.trim() : null);

/** Default payment method: first active cash method, else the first active method. */
export function useDefaultMethodId(): string | undefined {
  const { paymentMethods } = useSession();
  const active = paymentMethods.filter((m) => m.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  return (active.find((m) => m.type === "cash") ?? active[0])?.id;
}

// ---------------------------------------------------------------- customer form

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Edit when provided */
  customer?: Customer | null;
  onSaved?: (c: Customer) => void;
}) {
  const { user } = useSession();
  const editing = !!customer;
  const [f, setF] = React.useState(() => blankCustomer(customer));
  React.useEffect(() => {
    if (open) setF(blankCustomer(customer));
  }, [open, customer]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = useApiMutation(
    (body: CustomerInput) => (editing ? api.put<Customer>(`/customers/${customer!.id}`, body) : api.post<Customer>("/customers", body)),
    {
      invalidate: ["/customers", "/reports"],
      success: (c) => (editing ? "Customer updated" : `Customer “${c.name}” added`),
      onSuccess: (c) => {
        onSaved?.(c);
        onOpenChange(false);
      },
    },
  );

  const submit = () => {
    const body: CustomerInput = {
      name: f.name.trim(),
      phone: nn(f.phone),
      email: nn(f.email),
      address: nn(f.address),
      taxNumber: nn(f.taxNumber),
      type: f.type,
      priceTier: f.priceTier,
      allowCredit: f.allowCredit,
      creditLimit: f.creditLimit,
      birthday: f.birthday || null,
      notes: nn(f.notes),
      isActive: f.isActive,
    };
    if (!editing && f.openingBalance > 0) body.openingBalance = f.openingBalance;
    if (editing && (user.role === "owner" || user.role === "admin")) body.loyaltyPoints = f.loyaltyPoints;
    save.mutate(body);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.name.trim()) submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Edit customer" : "New customer"}</DialogTitle>
            <DialogDescription>Contact details, credit terms and pricing tier.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-5">
            <FieldGrid>
              <Field label="Name" htmlFor="c-name" required className="sm:col-span-2">
                <Input id="c-name" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
              </Field>
              <Field label="Phone" htmlFor="c-phone">
                <Input id="c-phone" value={f.phone} inputMode="tel" onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email" htmlFor="c-email">
                <Input id="c-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Address" htmlFor="c-address" className="sm:col-span-2">
                <Textarea id="c-address" rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
              <Field label="Customer type">
                <Select value={f.type} onValueChange={(v) => set("type", v as CustomerInput["type"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tax number" htmlFor="c-tax">
                <Input id="c-tax" value={f.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} />
              </Field>
              <Field label="Price tier" hint="Wholesale customers get wholesale prices at the POS.">
                <Select value={f.priceTier} onValueChange={(v) => set("priceTier", v as CustomerInput["priceTier"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Birthday" htmlFor="c-bday">
                <Input id="c-bday" type="date" value={f.birthday} onChange={(e) => set("birthday", e.target.value)} />
              </Field>
            </FieldGrid>

            <div className="rounded-xl border border-border px-4">
              <ToggleRow title="Allow sales on credit" description="Let this customer take goods now and pay later.">
                <Switch checked={f.allowCredit} onCheckedChange={(v) => set("allowCredit", v)} />
              </ToggleRow>
              {f.allowCredit && (
                <div className="pb-4">
                  <Field label="Credit limit" hint="0 = no limit">
                    <MoneyInput value={f.creditLimit} onChange={(v) => set("creditLimit", v)} />
                  </Field>
                </div>
              )}
            </div>

            <FieldGrid>
              {!editing && (
                <Field label="Opening balance" hint="Amount this customer already owes you.">
                  <MoneyInput value={f.openingBalance} onChange={(v) => set("openingBalance", v)} />
                </Field>
              )}
              {editing && (user.role === "owner" || user.role === "admin") && (
                <Field label="Loyalty points" htmlFor="c-pts" hint="Manual adjustment">
                  <Input
                    id="c-pts"
                    inputMode="numeric"
                    className="num"
                    value={String(f.loyaltyPoints)}
                    onChange={(e) => set("loyaltyPoints", Math.max(0, Number.parseInt(e.target.value.replace(/\D/g, "") || "0", 10)))}
                  />
                </Field>
              )}
              <Field label="Notes" htmlFor="c-notes" className="sm:col-span-2">
                <Textarea id="c-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </FieldGrid>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!f.name.trim()}>
              {editing ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function blankCustomer(c?: Customer | null) {
  return {
    name: c?.name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    taxNumber: c?.taxNumber ?? "",
    type: (c?.type ?? "individual") as CustomerInput["type"],
    priceTier: (c?.priceTier ?? "retail") as CustomerInput["priceTier"],
    allowCredit: c?.allowCredit ?? true,
    creditLimit: c?.creditLimit ?? 0,
    birthday: c?.birthday ?? "",
    notes: c?.notes ?? "",
    isActive: c?.isActive ?? true,
    openingBalance: 0,
    loyaltyPoints: c?.loyaltyPoints ?? 0,
  };
}

// ---------------------------------------------------------------- supplier form

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplier?: Supplier | null;
  onSaved?: (s: Supplier) => void;
}) {
  const editing = !!supplier;
  const blank = React.useCallback(
    () => ({
      name: supplier?.name ?? "",
      contactName: supplier?.contactName ?? "",
      phone: supplier?.phone ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
      taxNumber: supplier?.taxNumber ?? "",
      paymentTermsDays: supplier?.paymentTermsDays ?? 0,
      notes: supplier?.notes ?? "",
      openingBalance: 0,
    }),
    [supplier],
  );
  const [f, setF] = React.useState(blank);
  React.useEffect(() => {
    if (open) setF(blank());
  }, [open, blank]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = useApiMutation(
    (body: SupplierInput) => (editing ? api.put<Supplier>(`/suppliers/${supplier!.id}`, body) : api.post<Supplier>("/suppliers", body)),
    {
      invalidate: ["/suppliers", "/reports"],
      success: (s) => (editing ? "Supplier updated" : `Supplier “${s.name}” added`),
      onSuccess: (s) => {
        onSaved?.(s);
        onOpenChange(false);
      },
    },
  );

  const submit = () => {
    const body: SupplierInput = {
      name: f.name.trim(),
      contactName: nn(f.contactName),
      phone: nn(f.phone),
      email: nn(f.email),
      address: nn(f.address),
      taxNumber: nn(f.taxNumber),
      paymentTermsDays: f.paymentTermsDays,
      notes: nn(f.notes),
      isActive: supplier?.isActive ?? true,
    };
    if (!editing && f.openingBalance > 0) body.openingBalance = f.openingBalance;
    save.mutate(body);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.name.trim()) submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Edit supplier" : "New supplier"}</DialogTitle>
            <DialogDescription>Who you buy from, and on what terms.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGrid>
              <Field label="Company name" htmlFor="s-name" required className="sm:col-span-2">
                <Input id="s-name" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
              </Field>
              <Field label="Contact person" htmlFor="s-contact">
                <Input id="s-contact" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
              </Field>
              <Field label="Phone" htmlFor="s-phone">
                <Input id="s-phone" value={f.phone} inputMode="tel" onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Email" htmlFor="s-email">
                <Input id="s-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Tax number" htmlFor="s-tax">
                <Input id="s-tax" value={f.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} />
              </Field>
              <Field label="Address" htmlFor="s-address" className="sm:col-span-2">
                <Textarea id="s-address" rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
              <Field label="Payment terms" htmlFor="s-terms" hint="Days until a bill is due (0 = on receipt)">
                <Input
                  id="s-terms"
                  inputMode="numeric"
                  suffix="days"
                  className="num"
                  value={String(f.paymentTermsDays)}
                  onChange={(e) => set("paymentTermsDays", Math.min(365, Number.parseInt(e.target.value.replace(/\D/g, "") || "0", 10)))}
                />
              </Field>
              {!editing && (
                <Field label="Opening balance" hint="Amount you already owe this supplier.">
                  <MoneyInput value={f.openingBalance} onChange={(v) => set("openingBalance", v)} />
                </Field>
              )}
              <Field label="Notes" htmlFor="s-notes" className="sm:col-span-2">
                <Textarea id="s-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </FieldGrid>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!f.name.trim()}>
              {editing ? "Save changes" : "Add supplier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- allocation table

function useOpenDocs(kind: PartyKind, partyId: string, enabled: boolean) {
  return useApiQuery<OpenDocument[]>(
    enabled ? `/${kind === "customer" ? "customers" : "suppliers"}/${partyId}/${kind === "customer" ? "open-invoices" : "open-bills"}` : null,
  );
}

/** Oldest-first allocation of `amount` across documents. */
function autoAllocate(docs: OpenDocument[], amount: number): Record<string, number> {
  const out: Record<string, number> = {};
  let left = amount;
  for (const d of docs) {
    const a = Math.min(left, d.amountDue);
    out[d.id] = a;
    left -= a;
  }
  return out;
}

function AllocationTable({
  docs,
  alloc,
  onChange,
  loading,
}: {
  docs: OpenDocument[];
  alloc: Record<string, number>;
  onChange: (id: string, v: number) => void;
  loading?: boolean;
}) {
  if (loading) return <p className="py-4 text-center text-[13px] text-muted-foreground">Loading open documents…</p>;
  if (docs.length === 0) return <p className="py-4 text-center text-[13px] text-muted-foreground">No open documents.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-8" />
            <TableHead>Document</TableHead>
            <TableHead className="hidden sm:table-cell">Due</TableHead>
            <TableHead align="right">Balance</TableHead>
            <TableHead align="right" className="w-36">
              Apply
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((d) => {
            const v = alloc[d.id] ?? 0;
            return (
              <TableRow key={d.id} className="hover:bg-transparent">
                <TableCell>
                  <Checkbox checked={v > 0} onCheckedChange={(c) => onChange(d.id, c ? d.amountDue : 0)} aria-label={`Apply to ${d.number}`} />
                </TableCell>
                <TableCell>
                  <p className="font-mono text-[12.5px] font-medium">{d.number}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(d.date)}</p>
                </TableCell>
                <TableCell className="hidden text-[13px] text-muted-foreground sm:table-cell">{d.dueDate ? formatDate(d.dueDate) : "—"}</TableCell>
                <TableCell numeric>
                  <Money value={d.amountDue} />
                </TableCell>
                <TableCell>
                  <MoneyInput value={v} onChange={(x) => onChange(d.id, Math.min(x, d.amountDue))} hideSymbol className="h-8 text-right" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------- receive / make payment

/** Receive a customer payment on account, or pay a supplier. Allocates oldest-first unless edited. */
export function PartyPaymentDialog({
  open,
  onOpenChange,
  kind,
  partyId,
  partyName,
  balance,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: PartyKind;
  partyId: string;
  partyName: string;
  /** Current due balance (for the default amount) */
  balance: number;
  onDone?: (p: Payment) => void;
}) {
  const today = useBusinessToday();
  const defaultMethod = useDefaultMethodId();
  const docs = useOpenDocs(kind, partyId, open);
  const [amount, setAmount] = React.useState(balance);
  const [methodId, setMethodId] = React.useState<string | undefined>(defaultMethod);
  const [date, setDate] = React.useState(today);
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [manual, setManual] = React.useState(false);
  const [alloc, setAlloc] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (open) {
      setAmount(Math.max(0, balance));
      setMethodId(defaultMethod);
      setDate(today);
      setReference("");
      setNote("");
      setManual(false);
      setAlloc({});
    }
  }, [open, balance, defaultMethod, today]);

  const list = docs.data ?? [];
  const effective = manual ? alloc : autoAllocate(list, amount);
  const allocated = Object.values(effective).reduce((s, v) => s + v, 0);
  const advance = Math.max(0, amount - allocated);
  const overAllocated = allocated > amount;

  const mutation = useApiMutation(
    (body: PartyPaymentInput) => api.post<Payment>(`/${kind === "customer" ? "customers" : "suppliers"}/${partyId}/payments`, body),
    {
      invalidate: ["/customers", "/suppliers", "/sales", "/purchases", "/payments", "/reports", "/accounting"],
      success: (p) => `${kind === "customer" ? "Payment received" : "Payment recorded"} · ${p.number}`,
      onSuccess: (p) => {
        onDone?.(p);
        onOpenChange(false);
      },
    },
  );

  const submit = () => {
    if (!methodId || amount <= 0 || overAllocated) return;
    const body: PartyPaymentInput = { amount, methodId, date, reference: nn(reference), note: nn(note) };
    if (manual) body.allocations = Object.entries(alloc).filter(([, v]) => v > 0).map(([docId, v]) => ({ docId, amount: v }));
    mutation.mutate(body);
  };

  const isCustomer = kind === "customer";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{isCustomer ? "Receive payment" : "Pay supplier"}</DialogTitle>
            <DialogDescription>
              {isCustomer ? "From" : "To"} <span className="font-medium text-foreground">{partyName}</span> · balance{" "}
              <Money value={balance} className="font-medium text-foreground" />
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-5">
            <FieldGrid>
              <Field label="Amount" required>
                <MoneyInput value={amount} onChange={setAmount} autoFocus className="text-base font-semibold" />
              </Field>
              <Field label="Payment method" required>
                <PaymentMethodSelect value={methodId} onChange={setMethodId} />
              </Field>
              <Field label="Date" htmlFor="pp-date">
                <Input id="pp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Reference" htmlFor="pp-ref" hint="Cheque no., transfer ID…">
                <Input id="pp-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </FieldGrid>

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="label-caps">Allocation</p>
                <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Switch
                    checked={manual}
                    onCheckedChange={(v) => {
                      setManual(v);
                      if (v) setAlloc(autoAllocate(list, amount));
                    }}
                  />
                  Choose {isCustomer ? "invoices" : "bills"}
                </label>
              </div>
              {manual ? (
                <AllocationTable
                  docs={list}
                  alloc={alloc}
                  loading={docs.isLoading}
                  onChange={(id, v) => setAlloc((a) => ({ ...a, [id]: v }))}
                />
              ) : (
                <p className="rounded-xl bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
                  Applied to the oldest open {isCustomer ? "invoices" : "bills"} first ({list.length} open).
                </p>
              )}
              <div className="grid gap-1 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Allocated</span>
                  <Money value={allocated} className={overAllocated ? "text-destructive" : undefined} />
                </div>
                {advance > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{isCustomer ? "Kept as store credit (advance)" : "Kept as supplier advance"}</span>
                    <Money value={advance} className="font-medium" />
                  </div>
                )}
                {overAllocated && <p className="text-destructive">Allocations exceed the payment amount.</p>}
              </div>
            </div>

            <Field label="Note" htmlFor="pp-note">
              <Textarea id="pp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!methodId || amount <= 0 || overAllocated}>
              {isCustomer ? "Receive" : "Pay"} <Money value={amount} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- apply credit

/** Use a customer's store credit / a supplier's credit against open documents. */
export function ApplyCreditDialog({
  open,
  onOpenChange,
  kind,
  partyId,
  credit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: PartyKind;
  partyId: string;
  credit: number;
}) {
  const docs = useOpenDocs(kind, partyId, open);
  const list = docs.data ?? [];
  const [alloc, setAlloc] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    if (open && docs.data) setAlloc(autoAllocate(docs.data, credit));
  }, [open, docs.data, credit]);

  const total = Object.values(alloc).reduce((s, v) => s + v, 0);
  const mutation = useApiMutation(
    (body: ApplyCreditInput) => api.post(`/${kind === "customer" ? "customers" : "suppliers"}/${partyId}/apply-credit`, body),
    {
      invalidate: ["/customers", "/suppliers", "/sales", "/purchases", "/payments", "/reports", "/accounting"],
      success: "Credit applied",
      onSuccess: () => onOpenChange(false),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Apply credit</DialogTitle>
          <DialogDescription>
            <Money value={credit} className="font-medium text-foreground" /> available to settle open {kind === "customer" ? "invoices" : "bills"}.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <AllocationTable docs={list} alloc={alloc} loading={docs.isLoading} onChange={(id, v) => setAlloc((a) => ({ ...a, [id]: v }))} />
          <div className="flex justify-between text-[13px]">
            <span className="text-muted-foreground">Applying</span>
            <Money value={total} className={total > credit ? "font-medium text-destructive" : "font-medium"} />
          </div>
          {total > credit && <p className="text-[13px] text-destructive">You can apply at most the available credit.</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={total <= 0 || total > credit}
            onClick={() =>
              mutation.mutate({ allocations: Object.entries(alloc).filter(([, v]) => v > 0).map(([docId, amount]) => ({ docId, amount })) })
            }
          >
            Apply <Money value={total} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- refund credit

/** Pay out a customer's store credit, or record a supplier paying their credit back. */
export function CreditRefundDialog({
  open,
  onOpenChange,
  kind,
  partyId,
  credit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: PartyKind;
  partyId: string;
  credit: number;
}) {
  const today = useBusinessToday();
  const defaultMethod = useDefaultMethodId();
  const [amount, setAmount] = React.useState(credit);
  const [methodId, setMethodId] = React.useState<string | undefined>(defaultMethod);
  const [date, setDate] = React.useState(today);
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setAmount(credit);
      setMethodId(defaultMethod);
      setDate(today);
      setReference("");
      setNote("");
    }
  }, [open, credit, defaultMethod, today]);

  const mutation = useApiMutation(
    (body: CreditRefundInput) => api.post<Payment>(`/${kind === "customer" ? "customers" : "suppliers"}/${partyId}/refund-credit`, body),
    {
      invalidate: ["/customers", "/suppliers", "/payments", "/reports", "/accounting"],
      success: (p) => `Refund recorded · ${p.number}`,
      onSuccess: () => onOpenChange(false),
    },
  );
  const isCustomer = kind === "customer";
  const invalid = !methodId || amount <= 0 || amount > credit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) mutation.mutate({ amount, methodId: methodId!, date, reference: nn(reference), note: nn(note) });
          }}
        >
          <DialogHeader>
            <DialogTitle>{isCustomer ? "Refund store credit" : "Receive supplier refund"}</DialogTitle>
            <DialogDescription>
              {isCustomer ? "Pay the customer back from" : "The supplier pays back part of"} <Money value={credit} className="font-medium text-foreground" />{" "}
              {isCustomer ? "of store credit." : "of credit they owe you."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <FieldGrid>
              <Field label="Amount" required error={amount > credit ? "More than the available credit" : null}>
                <MoneyInput value={amount} onChange={setAmount} autoFocus />
              </Field>
              <Field label="Payment method" required>
                <PaymentMethodSelect value={methodId} onChange={setMethodId} />
              </Field>
              <Field label="Date" htmlFor="cr-date">
                <Input id="cr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Reference" htmlFor="cr-ref">
                <Input id="cr-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </FieldGrid>
            <Field label="Note" htmlFor="cr-note">
              <Textarea id="cr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={invalid}>
              {isCustomer ? "Refund" : "Record"} <Money value={amount} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
