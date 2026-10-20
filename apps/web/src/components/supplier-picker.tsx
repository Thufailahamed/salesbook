"use client";

import * as React from "react";
import { Plus, Truck } from "lucide-react";
import type { Paginated, Supplier, SupplierInput } from "@shopbooks/shared";
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

export interface SupplierPickerProps {
  value: string | null | undefined;
  onChange: (supplierId: string | null, supplier: Supplier | null) => void;
  allowCreate?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
  invalid?: boolean;
  id?: string;
}

/** Async supplier search with balances and quick-create. */
export function SupplierPicker({
  value,
  onChange,
  allowCreate = true,
  placeholder = "Select supplier…",
  disabled,
  className,
  size,
  invalid,
  id,
}: SupplierPickerProps) {
  const money = useMoney();
  const [q, setQ] = React.useState("");
  const dq = useDebounce(q, 250);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const list = useApiQuery<Paginated<Supplier>>("/suppliers", { q: dq, pageSize: 20, status: "active" });
  const selected = useApiQuery<Supplier>(value ? `/suppliers/${value}` : null, undefined, { staleTime: 60_000 });

  const options: ComboboxOption<Supplier>[] = React.useMemo(
    () =>
      (list.data?.data ?? []).map((s) => ({
        value: s.id,
        label: s.name,
        data: s,
        render: (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar name={s.name} size="xs" square />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">{s.contactName || s.phone || s.email || "—"}</p>
            </div>
            <div className="shrink-0 text-right text-[11.5px] leading-tight">
              {s.dueBalance > 0 && <p className="num font-medium text-destructive">Owe {money.format(s.dueBalance)}</p>}
              {s.creditBalance > 0 && <p className="num font-medium text-success-soft-foreground">Credit {money.format(s.creditBalance)}</p>}
            </div>
          </div>
        ),
      })),
    [list.data, money],
  );

  return (
    <>
      <Combobox<Supplier>
        id={id}
        value={value ?? null}
        onChange={(v, opt) => onChange(v, opt?.data ?? null)}
        options={options}
        onSearch={setQ}
        loading={list.isFetching}
        placeholder={placeholder}
        searchPlaceholder="Search suppliers…"
        emptyText="No suppliers found"
        selectedLabel={value ? selected.data?.name ?? "Loading…" : undefined}
        disabled={disabled}
        className={className}
        size={size}
        invalid={invalid}
        icon={<Truck />}
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
                  <Plus /> New supplier{query ? ` “${query}”` : ""}
                </Button>
              )
            : undefined
        }
      />
      <QuickSupplierDialog open={createOpen} onOpenChange={setCreateOpen} initialName={createName} onCreated={(s) => onChange(s.id, s)} />
    </>
  );
}

export function QuickSupplierDialog({
  open,
  onOpenChange,
  initialName = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialName?: string;
  onCreated: (s: Supplier) => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [phone, setPhone] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setName(initialName);
      setPhone("");
      setContactName("");
    }
  }, [open, initialName]);
  const create = useApiMutation((body: Partial<SupplierInput>) => api.post<Supplier>("/suppliers", body), {
    invalidate: ["/suppliers"],
    success: (s) => `Supplier “${s.name}” added`,
    onSuccess: (s) => {
      onCreated(s);
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
            create.mutate({ name: name.trim(), phone: phone.trim() || null, contactName: contactName.trim() || null });
          }}
        >
          <DialogHeader>
            <DialogTitle>New supplier</DialogTitle>
            <DialogDescription>Add a vendor you buy stock from.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Business name" htmlFor="qs-name" required>
              <Input id="qs-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Contact person" htmlFor="qs-contact">
              <Input id="qs-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="qs-phone">
              <Input id="qs-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
              Add supplier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
