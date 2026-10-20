"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PurchaseReturn } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { formatDate, formatDateTime, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <PurchaseReturnView />
    </React.Suspense>
  );
}

function PurchaseReturnView() {
  const id = useSearchParams().get("id");
  const money = useMoney();
  const { data: r, isLoading, error, refetch } = useApiQuery<PurchaseReturn>(id ? `/purchase-returns/${id}` : null);
  if (!id) return <ErrorState title="Nothing selected" message="No return selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !r) return <ErrorState message={error?.message ?? "Return not found"} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        backHref="/purchases/returns"
        breadcrumbs={[{ label: "Purchase returns", href: "/purchases/returns" }, { label: r.number }]}
        eyebrow="Debit note"
        title={<span className="font-mono tracking-tight">{r.number}</span>}
        badge={<Badge variant={r.settlement === "refund" ? "info" : "outline"}>{r.settlement === "refund" ? "Refunded" : "Credit"}</Badge>}
        description={`${r.supplierName ?? ""} · ${formatDate(r.date)}`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Returned items" flush className="min-w-0 lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Item</TableHead>
                <TableHead align="right">Qty</TableHead>
                <TableHead align="right" className="hidden sm:table-cell">
                  Unit cost
                </TableHead>
                <TableHead align="right" className="hidden sm:table-cell">
                  Tax
                </TableHead>
                <TableHead align="right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(r.lines ?? []).map((l) => (
                <TableRow key={l.id} className="hover:bg-transparent">
                  <TableCell>
                    <p className="font-medium">{l.name}</p>
                    {l.sku && <p className="font-mono text-[11.5px] text-muted-foreground">{l.sku}</p>}
                  </TableCell>
                  <TableCell numeric>{formatQty(l.quantity)}</TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    <Money value={l.unitCost} />
                  </TableCell>
                  <TableCell numeric className="hidden text-muted-foreground sm:table-cell">
                    <Money value={l.tax} />
                  </TableCell>
                  <TableCell numeric className="font-medium">
                    <Money value={l.total} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-border/70 px-6 py-4">
            <dl className="ml-auto grid max-w-xs gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Net</dt>
                <dd>
                  <Money value={r.netTotal} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd>
                  <Money value={r.taxTotal} />
                </dd>
              </div>
              <div className="rule-double-top mt-1 flex justify-between pt-2 font-display text-lg font-semibold">
                <dt>Total</dt>
                <dd className="figure">{money.format(r.total)}</dd>
              </div>
            </dl>
          </div>
        </SectionCard>
        <div className="grid content-start gap-6">
          <SectionCard title="Settlement">
            <KeyValue
              layout="inline"
              items={[
                { label: "Reduced the bill", value: <Money value={r.appliedToBill} dashZero /> },
                { label: "Kept as supplier credit", value: <Money value={r.toCredit} dashZero /> },
                { label: "Refunded to you", value: <Money value={r.refunded} dashZero /> },
              ]}
            />
          </SectionCard>
          <SectionCard title="Details">
            <KeyValue
              items={[
                {
                  label: "Purchase",
                  value: (
                    <Link href={`/purchases/view?id=${r.purchaseId}`} className="font-mono text-primary hover:underline">
                      {r.purchaseNumber}
                    </Link>
                  ),
                },
                {
                  label: "Supplier",
                  value: (
                    <Link href={`/suppliers/view?id=${r.supplierId}`} className="hover:underline">
                      {r.supplierName}
                    </Link>
                  ),
                },
                { label: "Location", value: r.locationName },
                { label: "Created by", value: r.createdByName },
                { label: "Created", value: formatDateTime(r.createdAt) },
                { label: "Note", value: r.note, hideEmpty: true },
              ]}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
