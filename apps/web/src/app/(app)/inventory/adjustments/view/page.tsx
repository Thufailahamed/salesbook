"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { StockAdjustment } from "@shopbooks/shared";
import { ADJUSTMENT_REASON_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { cn, formatDate, formatDateTime, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <AdjustmentView />
    </React.Suspense>
  );
}

function AdjustmentView() {
  const id = useSearchParams().get("id");
  const { data: a, isLoading, error, refetch } = useApiQuery<StockAdjustment>(id ? `/inventory/adjustments/${id}` : null);
  if (!id) return <ErrorState message="No adjustment selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !a) return <ErrorState message={error?.message ?? "Adjustment not found"} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        backHref="/inventory/adjustments"
        breadcrumbs={[{ label: "Adjustments", href: "/inventory/adjustments" }, { label: a.number }]}
        eyebrow="Stock adjustment"
        title={a.number}
        badge={<Badge variant="outline">{ADJUSTMENT_REASON_LABELS[a.reason]}</Badge>}
        description={`${a.locationName} · ${formatDate(a.date)}`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Lines" flush className="lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Item</TableHead>
                <TableHead align="right">Before</TableHead>
                <TableHead align="right">Change</TableHead>
                <TableHead align="right">After</TableHead>
                <TableHead align="right" className="hidden sm:table-cell">
                  Unit cost
                </TableHead>
                <TableHead align="right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(a.lines ?? []).map((l) => (
                <TableRow key={l.id} className="hover:bg-transparent">
                  <TableCell>
                    <p className="font-medium">
                      {l.productName}
                      {l.variantName && <span className="font-normal text-muted-foreground"> · {l.variantName}</span>}
                    </p>
                    <p className="font-mono text-[11.5px] text-muted-foreground">{l.sku ?? "—"}</p>
                  </TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    {formatQty(l.quantityBefore)}
                  </TableCell>
                  <TableCell numeric className={cn("font-semibold", l.quantity < 0 ? "text-destructive" : "text-success-soft-foreground")}>
                    {l.quantity > 0 ? "+" : ""}
                    {formatQty(l.quantity)}
                  </TableCell>
                  <TableCell numeric>{formatQty(l.quantityBefore + l.quantity)}</TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    <Money value={l.unitCost} tone="muted" />
                  </TableCell>
                  <TableCell numeric>
                    <Money value={l.value} tone="signed" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="hidden sm:table-cell" />
                <TableCell numeric>
                  <Money value={a.totalValue} tone="signed" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </SectionCard>
        <SectionCard title="Details" className="self-start">
          <KeyValue
            items={[
              { label: "Reason", value: ADJUSTMENT_REASON_LABELS[a.reason] },
              { label: "Location", value: a.locationName },
              { label: "Date", value: formatDate(a.date) },
              { label: "Posted by", value: a.createdByName },
              { label: "Posted at", value: formatDateTime(a.createdAt) },
              { label: "Note", value: a.note ? <span className="whitespace-pre-line">{a.note}</span> : null, hideEmpty: true },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
