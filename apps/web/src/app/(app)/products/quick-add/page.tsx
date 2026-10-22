"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import type { ProductInput } from "@shopbooks/shared";
import { BarcodeInput } from "@/components/barcode-input";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { invalidatePaths } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";

interface Row {
  id: number;
  name: string;
  barcode: string;
  /** Minor units */
  price: number;
}

const START_ROWS = 5;
let nextId = 0;
const blankRow = (): Row => ({ id: ++nextId, name: "", barcode: "", price: 0 });

export default function QuickAddPage() {
  const { can, taxRates, locationId } = useSession();
  const money = useMoney();
  const qc = useQueryClient();
  const [rows, setRows] = React.useState<Row[]>(() => Array.from({ length: START_ROWS }, blankRow));
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name: string; message: string }[]>([]);

  const filled = rows.filter((r) => r.name.trim() || r.price > 0);
  const ready = rows.filter((r) => r.name.trim() && r.price > 0);
  const incomplete = filled.length - ready.length;

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // A new row's name box doesn't exist until React renders it, so focus it after the render.
  const focusAfterRender = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (focusAfterRender.current === null) return;
    document.getElementById(`quick-name-${focusAfterRender.current}`)?.focus();
    focusAfterRender.current = null;
  }, [rows]);

  /** Enter in the price column adds a row below and moves the cursor there. */
  const addRowAfter = (id: number) => {
    const row = blankRow();
    setRows((rs) => {
      const i = rs.findIndex((r) => r.id === id);
      const next = [...rs];
      next.splice(i + 1, 0, row);
      return next;
    });
    focusAfterRender.current = row.id;
  };

  /** Pasting several lines (name, tab, price, tab, barcode — copied from a spreadsheet) fills rows from the focused one. */
  const onPaste = (id: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t]/.test(text)) return;
    e.preventDefault();
    const parsed = text
      .split(/\r?\n/)
      .map((line) => line.split("\t"))
      .filter((cells) => cells[0]?.trim())
      .map((cells) => ({
        name: cells[0]!.trim(),
        price: money.toMinor(Number((cells[1] ?? "").replace(/,/g, "")) || 0),
        barcode: (cells[2] ?? "").trim(),
      }));
    setRows((rs) => {
      const i = rs.findIndex((r) => r.id === id);
      const created = parsed.map((p) => ({ ...blankRow(), ...p }));
      const next = [...rs];
      next.splice(i, 1, ...created);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setErrors([]);
    const tax = taxRates.find((t) => t.isDefault) ?? null;
    const failed: { name: string; message: string }[] = [];
    const done = new Set<number>();
    for (const r of ready) {
      const body: ProductInput = {
        name: r.name.trim(),
        description: null,
        type: "standard",
        categoryId: null,
        brandId: null,
        unitId: null,
        taxRateId: tax?.id ?? null,
        trackInventory: false,
        imageUrl: null,
        tags: null,
        isActive: true,
        hasVariants: false,
        options: [],
        variants: [
          {
            name: "",
            options: {},
            sku: null,
            barcode: r.barcode.trim() || null,
            price: r.price,
            wholesalePrice: null,
            costPrice: 0,
            mrp: null,
            reorderLevel: null,
            isActive: true,
          },
        ],
      };
      try {
        await api.post("/products", body);
        done.add(r.id);
      } catch (err) {
        failed.push({ name: r.name.trim(), message: err instanceof Error ? err.message : "Could not save" });
      }
    }
    setRows((rs) => {
      const kept = rs.filter((r) => !done.has(r.id));
      return kept.length ? kept : [blankRow()];
    });
    setErrors(failed);
    setSaving(false);
    if (done.size) {
      toast.success(`${done.size} product${done.size === 1 ? "" : "s"} added`);
      await invalidatePaths(qc, ["/products", "/inventory", "/reports"]);
    }
  };

  return (
    <>
      <PageHeader
        title="Quick add"
        description="Type a name, scan the barcode if it has one, and enter a price; press Enter for the next row, then save them all at once. Products are created as untracked, so add stock or details later."
        actions={
          <Button variant="outline" asChild>
            <Link href="/products/import">Import from CSV</Link>
          </Button>
        }
      />
      <SectionCard
        title="Products"
        icon={Zap}
        flush
        action={<span className="text-[13px] text-muted-foreground">{ready.length} ready{incomplete > 0 && `, ${incomplete} incomplete`}</span>}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setRows((rs) => [...rs, blankRow()])}>
              <Plus /> Add row
            </Button>
            <Button onClick={save} loading={saving} disabled={ready.length === 0 || !can("products.manage") || !locationId}>
              Save {ready.length || ""} product{ready.length === 1 ? "" : "s"}
            </Button>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-64">Barcode</TableHead>
              <TableHead className="w-56" align="right">Price</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id} className="hover:bg-transparent">
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <Input
                    id={`quick-name-${r.id}`}
                    value={r.name}
                    placeholder="Product name"
                    onChange={(e) => update(r.id, { name: e.target.value })}
                    onPaste={(e) => onPaste(r.id, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        document.getElementById(`quick-price-${r.id}`)?.focus();
                      }
                    }}
                  />
                </TableCell>
                <TableCell>
                  <div
                    onKeyDown={(e) => {
                      // a scanner ends with Enter → move on to the price
                      if (e.key === "Enter") {
                        e.preventDefault();
                        document.getElementById(`quick-price-${r.id}`)?.focus();
                      }
                    }}
                  >
                    <BarcodeInput compact value={r.barcode} onChange={(v) => update(r.id, { barcode: v })} />
                  </div>
                </TableCell>
                <TableCell>
                  <MoneyInput
                    id={`quick-price-${r.id}`}
                    value={r.price}
                    onChange={(v) => update(r.id, { price: v })}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRowAfter(r.id);
                      }
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove row"
                    onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : [blankRow()]))}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {errors.length > 0 && (
          <div className="border-t border-border p-4 text-[13px] text-destructive">
            <p className="mb-1 font-medium">{errors.length} could not be saved (kept in the list):</p>
            <ul className="list-disc pl-5">
              {errors.map((e, i) => (
                <li key={i}>{e.name}: {e.message}</li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>
    </>
  );
}
