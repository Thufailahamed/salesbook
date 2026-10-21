"use client";

import * as React from "react";
import { BadgePercent, Plus, Trash2 } from "lucide-react";
import { promoLabel, type Promotion, type PromotionInput, type PromotionKind, type PromotionStatus, type SellableItem } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { MoneyInput, PercentInput } from "@/components/money-input";
import { Field, FieldGrid, ToggleRow } from "@/components/form-field";
import { StatusBadge } from "@/components/status-badge";
import { VariantPicker } from "@/components/variant-picker";
import { useConfirm } from "@/components/confirm-dialog";
import { useBusinessToday } from "@/components/filters";
import { useMoney } from "@/hooks/use-money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const INVALIDATE = ["/promotions", "/products", "/products/sellable"];

const STATUS: Record<PromotionStatus, [React.ComponentProps<typeof StatusBadge>["variant"], string]> = {
  active: ["success", "Running"],
  scheduled: ["info", "Scheduled"],
  paused: ["neutral", "Paused"],
  expired: ["neutral", "Ended"],
};

export default function PromotionsPage() {
  const { can } = useSession();
  const money = useMoney();
  const [editing, setEditing] = React.useState<Promotion | "new" | null>(null);
  const { data, isLoading, isFetching } = useApiQuery<Promotion[]>("/promotions");
  const canManage = can("products.manage");

  const columns: Column<Promotion>[] = [
    { key: "name", header: "Offer", cell: (p) => <span className="font-medium">{p.name}</span> },
    { key: "item", header: "Item", cell: (p) => <span className="text-muted-foreground">{p.itemName}</span> },
    {
      key: "discount",
      header: "Discount",
      cell: (p) => <span className="font-medium">{promoLabel(p, (m) => money.format(m))}</span>,
    },
    {
      key: "period",
      header: "Period",
      hideBelow: "md",
      cell: (p) => (
        <span className="text-muted-foreground">
          {formatDate(p.startDate)} – {p.endDate ? formatDate(p.endDate) : "open-ended"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => {
        const [variant, label] = STATUS[p.status];
        return <StatusBadge variant={variant}>{label}</StatusBadge>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Time-limited offers. They apply automatically at the POS and are checked again at checkout."
        actions={
          canManage && (
            <Button onClick={() => setEditing("new")}>
              <Plus /> New promotion
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(p) => p.id}
        loading={isLoading || isFetching}
        onRowClick={canManage ? (p) => setEditing(p) : undefined}
        empty={
          <EmptyState
            icon={BadgePercent}
            title="No promotions yet"
            description="Schedule a discount or special price for an item, a weekend sale, or a clearance."
            action={canManage ? <Button size="sm" onClick={() => setEditing("new")}><Plus /> New promotion</Button> : undefined}
          />
        }
      />
      <PromotionDialog
        target={editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </>
  );
}

function PromotionDialog({ target, onOpenChange }: { target: Promotion | "new" | null; onOpenChange: (o: boolean) => void }) {
  const open = target !== null;
  const existing = target && target !== "new" ? target : null;
  const today = useBusinessToday();
  const confirm = useConfirm();
  const { format } = useMoney();
  const [name, setName] = React.useState("");
  const [item, setItem] = React.useState<{ productId: string; variantId: string | null; label: string } | null>(null);
  const [kind, setKind] = React.useState<PromotionKind>("percent");
  const [value, setValue] = React.useState(0);
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setItem({
        productId: existing.productId ?? "",
        variantId: existing.variantId,
        label: existing.itemName,
      });
      setKind(existing.kind);
      setValue(existing.value);
      setStartDate(existing.startDate);
      setEndDate(existing.endDate ?? "");
      setIsActive(existing.isActive);
    } else {
      setName("");
      setItem(null);
      setKind("percent");
      setValue(0);
      setStartDate(today);
      setEndDate("");
      setIsActive(true);
    }
  }, [open, existing?.id, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = (): PromotionInput => ({
    name: name.trim(),
    productId: item?.variantId ? null : (item?.productId ?? null),
    variantId: item?.variantId ?? null,
    kind,
    value,
    startDate,
    endDate: endDate || null,
    isActive,
  });

  const save = useApiMutation(
    (b: PromotionInput) => (existing ? api.put<Promotion>(`/promotions/${existing.id}`, b) : api.post<Promotion>("/promotions", b)),
    {
      invalidate: INVALIDATE,
      success: existing ? "Promotion updated" : "Promotion created",
      onSuccess: () => onOpenChange(false),
    },
  );
  const remove = useApiMutation((id: string) => api.del(`/promotions/${id}`), {
    invalidate: INVALIDATE,
    success: "Promotion deleted",
    onSuccess: () => onOpenChange(false),
  });

  const valid =
    !!name.trim() &&
    !!item &&
    !!startDate &&
    (kind === "percent" ? value > 0 && value <= 100 : value >= 0) &&
    (!endDate || endDate >= startDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate(body());
          }}
        >
          <DialogHeader>
            <DialogTitle>{existing ? "Edit promotion" : "New promotion"}</DialogTitle>
            <DialogDescription>The offer applies at the POS while it is running and active.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Offer name" htmlFor="pr-name" required>
              <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend sale, Clearance…" autoFocus={!existing} />
            </Field>
            <Field label="Item" required hint={item ? undefined : "Search and pick the product or variant"}>
              {item ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span className="truncate font-medium">{item.label}</span>
                  <Button type="button" variant="ghost" size="xs" onClick={() => setItem(null)}>Change</Button>
                </div>
              ) : (
                <VariantPicker
                  placeholder="Search products by name, SKU or barcode…"
                  includeServices={false}
                  onSelect={(s: SellableItem) => setItem({ productId: s.productId, variantId: s.variantId, label: s.displayName })}
                />
              )}
            </Field>
            <FieldGrid>
              <Field label="Discount type" required>
                <div className="grid grid-cols-2 gap-2">
                  {(["percent", "fixed_price"] as const).map((k) => (
                    <Button key={k} type="button" variant={kind === k ? "default" : "outline"} onClick={() => { setKind(k); setValue(0); }}>
                      {k === "percent" ? "% off" : "Special price"}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field label={kind === "percent" ? "Percent off" : "Special price"} required>
                {kind === "percent" ? (
                  <PercentInput value={value} onChange={(v) => setValue(v ?? 0)} />
                ) : (
                  <MoneyInput value={value} onChange={(v) => setValue(v ?? 0)} />
                )}
              </Field>
              <Field label="Starts" htmlFor="pr-start" required>
                <Input id="pr-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="Ends" htmlFor="pr-end" hint="Leave empty to run until stopped" error={endDate && endDate < startDate ? "Before the start date" : null}>
                <Input id="pr-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </FieldGrid>
            <ToggleRow title="Active" description={isActive ? "Applies at the POS during its dates." : "Paused: never applied."}>
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Active" />
            </ToggleRow>
            {value > 0 && item && (
              <p className="text-sm text-muted-foreground">
                {kind === "percent" ? `${item.label} sells at ${value}% off the usual price.` : `${item.label} sells at ${format(value)} while the offer runs.`}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="justify-between">
            {existing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                loading={remove.isPending}
                onClick={async () => {
                  if (await confirm({ title: `Delete ${existing.name}?`, description: "Sales go back to the normal price.", tone: "destructive", confirmText: "Delete" }))
                    remove.mutate(existing.id);
                }}
              >
                <Trash2 /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={!valid} loading={save.isPending}>{existing ? "Save" : "Create promotion"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
