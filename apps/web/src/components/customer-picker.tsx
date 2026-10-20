"use client";

import * as React from "react";
import { Plus, User, UserRound } from "lucide-react";
import type { Customer, CustomerInput, Paginated } from "@shopbooks/shared";
import { WALK_IN_CUSTOMER_NAME } from "@shopbooks/shared";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/form-field";
import { Avatar } from "@/components/ui/avatar";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useDebounce } from "@/hooks/use-debounce";
import { useMoney } from "@/hooks/use-money";
import { api } from "@/lib/api";

const WALK_IN = "__walkin__";

export interface CustomerPickerProps {
  /** Customer id, or null for walk-in / none */
  value: string | null | undefined;
  onChange: (customerId: string | null, customer: Customer | null) => void;
  /** Show a "Walk-in customer" option that maps to null */
  allowWalkIn?: boolean;
  /** Show "+ New customer" quick-create (default true) */
  allowCreate?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
  invalid?: boolean;
  id?: string;
}

/**
 * Async customer search with balances, walk-in option and quick-create.
 *   <CustomerPicker value={customerId} onChange={(id, c) => setCustomer(c)} allowWalkIn />
 */
export function CustomerPicker({
  value,
  onChange,
  allowWalkIn,
  allowCreate = true,
  placeholder,
  disabled,
  className,
  size,
  invalid,
  id,
}: CustomerPickerProps) {
  const money = useMoney();
  const [q, setQ] = React.useState("");
  const dq = useDebounce(q, 250);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");

  const list = useApiQuery<Paginated<Customer>>("/customers", { q: dq, pageSize: 20, status: "active" });
  const selected = useApiQuery<Customer>(value ? `/customers/${value}` : null, undefined, { staleTime: 60_000 });

  const options: ComboboxOption<Customer>[] = React.useMemo(() => {
    const rows = list.data?.data ?? [];
    const opts: ComboboxOption<Customer>[] = rows.map((c) => ({
      value: c.id,
      label: c.name,
      data: c,
      render: (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar name={c.name} size="xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <p className="truncate text-xs text-muted-foreground">{c.phone || c.email || "No contact"}</p>
          </div>
          <div className="shrink-0 text-right text-[11.5px] leading-tight">
            {c.dueBalance > 0 && <p className="num font-medium text-destructive">Due {money.format(c.dueBalance)}</p>}
            {c.creditBalance > 0 && <p className="num font-medium text-success-soft-foreground">Credit {money.format(c.creditBalance)}</p>}
          </div>
        </div>
      ),
    }));
    if (allowWalkIn && !dq) {
      opts.unshift({
        value: WALK_IN,
        label: WALK_IN_CUSTOMER_NAME,
        render: (
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="size-3.5" />
            </span>
            <span className="text-sm">{WALK_IN_CUSTOMER_NAME}</span>
          </div>
        ),
      });
    }
    return opts;
  }, [list.data, allowWalkIn, dq, money]);

  const selectedLabel = value ? selected.data?.name ?? "Loading…" : allowWalkIn ? WALK_IN_CUSTOMER_NAME : undefined;

  return (
    <>
      <Combobox<Customer>
        id={id}
        value={value ?? (allowWalkIn ? WALK_IN : null)}
        onChange={(v, opt) => {
          if (!v || v === WALK_IN) onChange(null, null);
          else onChange(v, opt?.data ?? null);
        }}
        options={options}
        onSearch={setQ}
        loading={list.isFetching}
        placeholder={placeholder ?? (allowWalkIn ? WALK_IN_CUSTOMER_NAME : "Select customer…")}
        searchPlaceholder="Search name, phone or email…"
        emptyText="No customers found"
        selectedLabel={selectedLabel}
        disabled={disabled}
        className={className}
        size={size}
        invalid={invalid}
        icon={<User />}
        clearable={!allowWalkIn}
        contentClassName="min-w-[340px]"
        footer={
          allowCreate
            ? (close, query) => (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-primary"
                  onClick={() => {
                    setCreateName(query);
                    setCreateOpen(true);
                    close();
                  }}
                >
                  <Plus /> New customer{query ? ` “${query}”` : ""}
                </Button>
              )
            : undefined
        }
      />
      <QuickCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialName={createName}
        onCreated={(c) => onChange(c.id, c)}
      />
    </>
  );
}

/** Minimal create-customer dialog (name, phone, email). */
export function QuickCustomerDialog({
  open,
  onOpenChange,
  initialName = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialName?: string;
  onCreated: (c: Customer) => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  React.useEffect(() => {
    if (open) {
      const looksLikePhone = /^[+\d][\d\s-]{4,}$/.test(initialName.trim());
      setName(looksLikePhone ? "" : initialName);
      setPhone(looksLikePhone ? initialName.trim() : "");
      setEmail("");
    }
  }, [open, initialName]);

  const create = useApiMutation((body: Partial<CustomerInput>) => api.post<Customer>("/customers", body), {
    invalidate: ["/customers"],
    success: (c) => `Customer “${c.name}” added`,
    onSuccess: (c) => {
      onCreated(c);
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate({ name: name.trim(), phone: phone.trim() || null, email: email.trim() || null });
          }}
        >
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>Add the basics now — you can complete the profile later.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Name" htmlFor="qc-name" required>
              <Input id="qc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Phone" htmlFor="qc-phone">
              <Input id="qc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
            <Field label="Email" htmlFor="qc-email">
              <Input id="qc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
              Add customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
