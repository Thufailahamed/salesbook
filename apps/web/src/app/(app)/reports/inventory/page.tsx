"use client";

import Link from "next/link";
import { Boxes, Tag, Wallet } from "lucide-react";
import type { InventoryValuationReport } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { DonutChart } from "@/components/charts/donut-chart";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";
import { formatQty } from "@/lib/utils";

export default function InventoryValuationPage() {
  const money = useMoney();
  return (
    <ReportPage<InventoryValuationReport>
      path="/reports/inventory-valuation"
      title="Inventory valuation"
      description="Stock on hand valued at average cost."
      controls={{ location: true }}
      csv={(r) => [
        ["Product", "Variant", "SKU", "Category", "Qty", "Unit cost", "Value", "Price", "Retail value"],
        ...r.rows.map((x) => [x.productName, x.variantName, x.sku, x.categoryName, x.quantity, money.toMajor(x.costPrice), money.toMajor(x.value), money.toMajor(x.price), money.toMajor(x.retailValue)]),
      ]}
    >
      {(r) => (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard variant="feature" label="Stock value (cost)" value={money.format(r.totalValue)} icon={Wallet} />
            <StatCard label="Retail value" value={money.format(r.totalRetailValue)} icon={Tag} tone="success" sublabel={`${money.formatCompact(r.totalRetailValue - r.totalValue)} potential margin`} />
            <StatCard label="Units on hand" value={formatQty(r.totalQuantity)} icon={Boxes} tone="info" />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard title="Value by category">
              {r.byCategory.length === 0 ? (
                <EmptyState compact title="No stock" />
              ) : (
                <DonutChart data={r.byCategory.map((c) => ({ name: c.name, value: c.value }))} valueFormatter={(v) => money.format(v)} centerValue={money.formatCompact(r.totalValue)} centerLabel="at cost" height={190} />
              )}
            </SectionCard>
            <SectionCard title="Categories" flush className="xl:col-span-2">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Category</TableHead><TableHead align="right">Qty</TableHead><TableHead align="right">Cost value</TableHead><TableHead align="right" className="hidden sm:table-cell">Retail value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.byCategory.map((c) => (
                    <TableRow key={c.name} className="hover:bg-transparent">
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell numeric>{formatQty(c.quantity)}</TableCell>
                      <TableCell numeric><Money value={c.value} /></TableCell>
                      <TableCell numeric className="hidden sm:table-cell"><Money value={c.retailValue} tone="muted" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          </div>
          <SectionCard title="Items" flush>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Item</TableHead>
                  <TableHead align="right">Qty</TableHead>
                  <TableHead align="right" className="hidden md:table-cell">Unit cost</TableHead>
                  <TableHead align="right">Value</TableHead>
                  <TableHead align="right" className="hidden md:table-cell">Retail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.rows.map((x) => (
                  <TableRow key={x.variantId + (x.locationId ?? "")} className="hover:bg-transparent">
                    <TableCell>
                      <Link href={`/products/view?id=${x.productId}`} className="font-medium hover:underline">
                        {x.productName}{x.variantName && <span className="font-normal text-muted-foreground"> · {x.variantName}</span>}
                      </Link>
                      <p className="font-mono text-[11.5px] text-muted-foreground">{x.sku ?? ""}</p>
                    </TableCell>
                    <TableCell numeric className={x.quantity < 0 ? "text-destructive" : undefined}>{formatQty(x.quantity)}</TableCell>
                    <TableCell numeric className="hidden md:table-cell"><Money value={x.costPrice} tone="muted" /></TableCell>
                    <TableCell numeric className="font-medium"><Money value={x.value} /></TableCell>
                    <TableCell numeric className="hidden md:table-cell"><Money value={x.retailValue} tone="muted" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell>Total</TableCell>
                  <TableCell numeric>{formatQty(r.totalQuantity)}</TableCell>
                  <TableCell className="hidden md:table-cell" />
                  <TableCell numeric><Money value={r.totalValue} /></TableCell>
                  <TableCell numeric className="hidden md:table-cell"><Money value={r.totalRetailValue} /></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </SectionCard>
        </div>
      )}
    </ReportPage>
  );
}
