"use client";

import * as React from "react";
import { Boxes, PackageX, Wallet } from "lucide-react";
import type { DeadStockReport } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { FilterSelect } from "@/components/filters";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";
import { formatDate, formatQty } from "@/lib/utils";

const WINDOWS = [
  { value: "30", label: "No sale in 30 days" },
  { value: "60", label: "No sale in 60 days" },
  { value: "90", label: "No sale in 90 days" },
  { value: "180", label: "No sale in 6 months" },
];

export default function DeadStockPage() {
  const money = useMoney();
  const [days, setDays] = React.useState("60");
  return (
    <ReportPage<DeadStockReport>
      path="/reports/dead-stock"
      title="Dead & slow stock"
      description="Items sitting on the shelf that have not sold recently. Consider discounting or returning them to the supplier."
      controls={{ location: true }}
      extraQuery={{ days: Number(days) }}
      csv={(r) => [
        ["Item", "SKU", "Category", "Qty", "Value at cost", "Last sold"],
        ...r.rows.map((x) => [x.displayName, x.sku, x.categoryName, x.quantity, money.toMajor(x.value), x.lastSoldOn]),
      ]}
      actions={<FilterSelect value={days} onChange={(v) => setDays(v ?? "60")} required options={WINDOWS} className="sm:w-48" />}
    >
      {(r) => (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard variant="feature" label="Tied up in slow stock" value={money.format(r.totalValue)} icon={Wallet} />
            <StatCard label="Items" value={r.rows.length} icon={PackageX} tone="warning" />
            <StatCard label="Units" value={formatQty(r.totalQuantity)} icon={Boxes} tone="info" />
          </div>
          <SectionCard title="Items" flush>
            {r.rows.length === 0 ? (
              <EmptyState compact title="Nothing is standing still" description={`Every item in stock has sold in the last ${r.days} days.`} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead>Last sold</TableHead>
                    <TableHead align="right">Qty</TableHead>
                    <TableHead align="right">Value at cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.rows.map((x) => (
                    <TableRow key={x.variantId} className="hover:bg-transparent">
                      <TableCell>
                        <span className="font-medium">{x.displayName}</span>
                        <p className="font-mono text-[11.5px] text-muted-foreground">{x.sku ?? ""}</p>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{x.categoryName ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{x.lastSoldOn ? formatDate(x.lastSoldOn) : <span className="text-warning">Never sold</span>}</TableCell>
                      <TableCell numeric>{formatQty(x.quantity)}</TableCell>
                      <TableCell numeric><Money value={x.value} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell>Total</TableCell>
                    <TableCell className="hidden md:table-cell" />
                    <TableCell />
                    <TableCell numeric>{formatQty(r.totalQuantity)}</TableCell>
                    <TableCell numeric><Money value={r.totalValue} /></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </SectionCard>
        </div>
      )}
    </ReportPage>
  );
}
