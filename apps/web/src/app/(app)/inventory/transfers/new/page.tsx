"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SellableItem, StockTransfer, StockTransferInput } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field } from "@/components/form-field";
import { VariantPicker } from "@/components/variant-picker";
import { LocationSelect } from "@/components/entity-selects";
import { QtyInput } from "@/components/qty-input";
import { EmptyState } from "@/components/empty-state";
import { useBusinessToday } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { cn, formatQty } from "@/lib/utils";

interface Line {
  item: SellableItem;
  quantity: number;
}

export default function NewTransferPage() {
  const router = useRouter();
  const today = useBusinessToday();
  const { locationId: sessionLocation, activeLocations, business } = useSession();
  const [fromId, setFromId] = React.useState<string | undefined>(sessionLocation || undefined);
  const [toId, setToId] = React.useState<string | undefined>(activeLocations.find((l) => l.id !== sessionLocation)?.id);
  const [date, setDate] = React.useState(today);
  const [note, setNote] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);

  const add = (item: SellableItem) => {
    if (!item.trackInventory) return toast.error(`${item.displayName} doesn't track inventory`);
    setLines((ls) =>
      ls.some((l) => l.item.variantId === item.variantId)
        ? ls.map((l) => (l.item.variantId === item.variantId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...ls, { item, quantity: 1 }],
    );
  };

  const over = lines.filter((l) => !business.allowNegativeStock && l.quantity > l.item.stock);
  const units = lines.reduce((s, l) => s + l.quantity, 0);

  const save = useApiMutation((body: StockTransferInput) => api.post<StockTransfer>("/inventory/transfers", body), {
    invalidate: ["/inventory", "/products", "/reports"],
    success: (t) => `Transfer ${t.number} completed`,
    onSuccess: (t) => router.push(`/inventory/transfers/view?id=${t.id}`),
  });

  const submit = () => {
    if (!fromId || !toId) return toast.error("Choose both locations");
    if (fromId === toId) return toast.error("Choose two different locations");
    const valid = lines.filter((l) => l.quantity > 0);
    if (!valid.length) return toast.error("Add at least one item");
    save.mutate({
      fromLocationId: fromId,
      toLocationId: toId,
      date,
      note: note.trim() || null,
      lines: valid.map((l) => ({ variantId: l.item.variantId, quantity: l.quantity })),
    });
  };

  if (activeLocations.length < 2) {
    return (
      <>
        <PageHeader backHref="/inventory/transfers" title="New transfer" />
        <EmptyState icon={ArrowLeftRight} title="You have one location" description="Add another location in Settings to transfer stock between them." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        backHref="/inventory/transfers"
        breadcrumbs={[{ label: "Transfers", href: "/inventory/transfers" }, { label: "New" }]}
        title="New stock transfer"
        description="Stock leaves the source and arrives at the destination immediately."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Items" flush className="min-w-0 lg:col-span-2">
          <div className="border-b border-border/70 px-5 py-4">
            <VariantPicker
              key={fromId}
              onSelect={add}
              locationId={fromId}
              includeServices={false}
              autoFocus
              placeholder="Search or scan items at the source location…"
            />
          </div>
          {lines.length === 0 ? (
            <EmptyState compact icon={ArrowLeftRight} title="No items yet" description="Add the items you're sending." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Item</TableHead>
                  <TableHead align="right">Available</TableHead>
                  <TableHead align="right">Send</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const short = !business.allowNegativeStock && l.quantity > l.item.stock;
                  return (
                    <TableRow key={l.item.variantId} className="hover:bg-transparent">
                      <TableCell>
                        <p className="font-medium">
                          {l.item.productName}
                          {l.item.variantName && <span className="font-normal text-muted-foreground"> · {l.item.variantName}</span>}
                        </p>
                        <p className="font-mono text-[11.5px] text-muted-foreground">{l.item.sku ?? "—"}</p>
                      </TableCell>
                      <TableCell numeric className={cn(short ? "text-destructive" : "text-muted-foreground")}>
                        {formatQty(l.item.stock)}
                      </TableCell>
                      <TableCell className="w-40">
                        <QtyInput
                          size="sm"
                          steppers
                          min={0}
                          allowDecimal={l.item.allowDecimal}
                          value={l.quantity}
                          onChange={(v) => setLines((ls) => ls.map((x) => (x.item.variantId === l.item.variantId ? { ...x, quantity: v } : x)))}
                          wrapperClassName="justify-end"
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((x) => x.item.variantId !== l.item.variantId))} aria-label="Remove line">
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <div className="grid content-start gap-6">
          <SectionCard title="Route">
            <div className="grid gap-4">
              <Field label="From" required>
                <LocationSelect
                  value={fromId}
                  onChange={(v) => {
                    if (v !== fromId && lines.length) {
                      setLines([]);
                      toast.info("Lines cleared — availability differs per location");
                    }
                    setFromId(v);
                  }}
                />
              </Field>
              <div className="flex justify-center text-muted-foreground">
                <ArrowRight className="size-4 rotate-90" />
              </div>
              <Field label="To" required>
                <LocationSelect value={toId} onChange={setToId} excludeId={fromId} />
              </Field>
              <Field label="Date" htmlFor="tr-date">
                <Input id="tr-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Note" htmlFor="tr-note">
                <Textarea id="tr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </SectionCard>
          {over.length > 0 && (
            <p className="rounded-xl bg-destructive-soft px-4 py-3 text-[13px] text-destructive-soft-foreground">
              {over.length} item{over.length === 1 ? " exceeds" : "s exceed"} the stock available at the source.
            </p>
          )}
          <Button size="lg" onClick={submit} loading={save.isPending} disabled={lines.length === 0 || over.length > 0}>
            Transfer {units > 0 ? `${formatQty(units)} units` : ""}
          </Button>
        </div>
      </div>
    </>
  );
}
