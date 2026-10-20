"use client";

import * as React from "react";
import type { Category, ProductSalesRow } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { SectionCard } from "@/components/section-card";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { FilterSelect } from "@/components/filters";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { cn, formatPercent, formatQty } from "@/lib/utils";

export default function ProductsReportPage() {
  const money = useMoney();
  const categories = useApiQuery<Category[]>("/categories", undefined, { staleTime: 60_000 });
  const [categoryId, setCategoryId] = React.useState<string | undefined>(undefined);
  const [limit, setLimit] = React.useState("50");
  return (
    <ReportPage<ProductSalesRow[]>
      path="/reports/products"
      title="Product performance"
      description="What sells, what it earns."
      controls={{ range: true, location: true }}
      extraQuery={{ categoryId, limit: Number(limit) }}
      csv={(rows) => [
        ["Product", "SKU", "Category", "Qty sold", "Returned", "Net sales", "Cost", "Profit", "Margin %"],
        ...rows.map((p) => [p.name, p.sku, p.categoryName, p.quantity, p.returnedQuantity, money.toMajor(p.netSales), money.toMajor(p.cost), money.toMajor(p.profit), p.margin]),
      ]}
      actions={
        <>
          <FilterSelect value={categoryId} onChange={setCategoryId} allLabel="All categories" options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect value={limit} onChange={(v) => setLimit(v ?? "50")} required options={[{ value: "20", label: "Top 20" }, { value: "50", label: "Top 50" }, { value: "200", label: "Top 200" }]} className="sm:w-28" />
        </>
      }
    >
      {(rows) => {
        const total = rows.reduce((a, p) => ({ q: a.q + p.quantity, s: a.s + p.netSales, c: a.c + p.cost, p: a.p + p.profit }), { q: 0, s: 0, c: 0, p: 0 });
        return (
          <div className="grid gap-6">
            <SectionCard title="Products" description="Ranked by net sales" flush>
              {rows.length === 0 ? (
                <EmptyState compact title="No product sales in this period" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Product</TableHead>
                      <TableHead className="hidden md:table-cell">Category</TableHead>
                      <TableHead align="right">Qty</TableHead>
                      <TableHead align="right">Net sales</TableHead>
                      <TableHead align="right" className="hidden lg:table-cell">Cost</TableHead>
                      <TableHead align="right">Profit</TableHead>
                      <TableHead align="right" className="hidden sm:table-cell">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p, i) => (
                      <TableRow key={(p.variantId ?? p.name) + i} className="hover:bg-transparent">
                        <TableCell>
                          <p className="font-medium">{p.name}</p>
                          <p className="font-mono text-[11.5px] text-muted-foreground">{p.sku ?? ""}</p>
                        </TableCell>
                        <TableCell className="hidden text-[13px] text-muted-foreground md:table-cell">{p.categoryName ?? "—"}</TableCell>
                        <TableCell numeric>
                          {formatQty(p.quantity)}
                          {p.returnedQuantity > 0 && <span className="block text-[11px] text-warning">−{formatQty(p.returnedQuantity)} returned</span>}
                        </TableCell>
                        <TableCell numeric className="font-medium"><Money value={p.netSales} /></TableCell>
                        <TableCell numeric className="hidden lg:table-cell"><Money value={p.cost} tone="muted" /></TableCell>
                        <TableCell numeric><Money value={p.profit} tone="auto" /></TableCell>
                        <TableCell numeric className={cn("hidden sm:table-cell", p.margin < 0 && "text-destructive")}>{formatPercent(p.margin)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={2} className="hidden md:table-cell">Total</TableCell>
                      <TableCell className="md:hidden">Total</TableCell>
                      <TableCell numeric>{formatQty(total.q)}</TableCell>
                      <TableCell numeric><Money value={total.s} /></TableCell>
                      <TableCell numeric className="hidden lg:table-cell"><Money value={total.c} /></TableCell>
                      <TableCell numeric><Money value={total.p} /></TableCell>
                      <TableCell numeric className="hidden sm:table-cell">{formatPercent(total.s ? (total.p / total.s) * 100 : 0)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </SectionCard>
          </div>
        );
      }}
    </ReportPage>
  );
}
