"use client";

import * as React from "react";
import type { ReturnableLine } from "@shopbooks/shared";
import { proportionalLine } from "@shopbooks/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QtyInput } from "@/components/qty-input";
import { Money } from "@/components/money";
import { cn, formatQty } from "@/lib/utils";

export type ReturnPicks = Record<string, { quantity: number; restock: boolean }>;

/** Line credit for a partial return (exact remainder when returning everything left). */
export function lineCredit(l: ReturnableLine, quantity: number): number {
  if (quantity <= 0) return 0;
  if (Math.abs(quantity - l.returnableQuantity) < 1e-9) {
    const already = proportionalLine(l, l.quantityReturned);
    return l.net - already.net + (l.tax - already.tax);
  }
  return proportionalLine(l, quantity).total;
}

/**
 * Table of an invoice's returnable lines with quantity + restock controls.
 *   <ReturnLinesPicker lines={returnable} picks={picks} onChange={setPicks} />
 */
export function ReturnLinesPicker({
  lines,
  picks,
  onChange,
}: {
  lines: ReturnableLine[];
  picks: ReturnPicks;
  onChange: (p: ReturnPicks) => void;
}) {
  const set = (id: string, patch: Partial<{ quantity: number; restock: boolean }>) =>
    onChange({ ...picks, [id]: { quantity: picks[id]?.quantity ?? 0, restock: picks[id]?.restock ?? true, ...patch } });
  const allOn = lines.length > 0 && lines.every((l) => (picks[l.id]?.quantity ?? 0) === l.returnableQuantity);

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="w-8">
            <Checkbox
              checked={allOn}
              onCheckedChange={(v) =>
                onChange(Object.fromEntries(lines.map((l) => [l.id, { quantity: v ? l.returnableQuantity : 0, restock: picks[l.id]?.restock ?? true }])))
              }
              aria-label="Return everything"
            />
          </TableHead>
          <TableHead>Item</TableHead>
          <TableHead align="right" className="hidden sm:table-cell">
            Sold
          </TableHead>
          <TableHead align="right">Return</TableHead>
          <TableHead align="center" className="hidden sm:table-cell">
            Restock
          </TableHead>
          <TableHead align="right">Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) => {
          const pick = picks[l.id] ?? { quantity: 0, restock: true };
          const disabled = l.returnableQuantity <= 0;
          return (
            <TableRow key={l.id} className={cn("hover:bg-transparent", disabled && "opacity-50")}>
              <TableCell>
                <Checkbox
                  checked={pick.quantity > 0}
                  disabled={disabled}
                  onCheckedChange={(v) => set(l.id, { quantity: v ? l.returnableQuantity : 0 })}
                  aria-label={`Return ${l.name}`}
                />
              </TableCell>
              <TableCell>
                <p className="font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground">
                  <Money value={l.total} /> for {formatQty(l.quantity)}
                  {l.quantityReturned > 0 && <> · {formatQty(l.quantityReturned)} already returned</>}
                </p>
              </TableCell>
              <TableCell numeric className="hidden text-muted-foreground sm:table-cell">
                {formatQty(l.quantity)}
              </TableCell>
              <TableCell className="w-36">
                <QtyInput
                  size="sm"
                  steppers
                  min={0}
                  max={l.returnableQuantity}
                  allowDecimal={!Number.isInteger(l.quantity)}
                  disabled={disabled}
                  value={pick.quantity}
                  onChange={(v) => set(l.id, { quantity: Math.min(v, l.returnableQuantity) })}
                  wrapperClassName="justify-end"
                />
              </TableCell>
              <TableCell align="center" className="hidden sm:table-cell">
                {l.variantId ? (
                  <Checkbox checked={pick.restock} disabled={disabled} onCheckedChange={(v) => set(l.id, { restock: !!v })} aria-label="Return to stock" />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell numeric className="font-medium">
                <Money value={lineCredit(l, pick.quantity)} dashZero />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
