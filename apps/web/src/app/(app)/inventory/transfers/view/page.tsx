"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { StockTransfer } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { formatDate, formatDateTime, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <TransferView />
    </React.Suspense>
  );
}

function TransferView() {
  const id = useSearchParams().get("id");
  const { data: t, isLoading, error, refetch } = useApiQuery<StockTransfer>(id ? `/inventory/transfers/${id}` : null);
  if (!id) return <ErrorState title="Nothing selected" message="No transfer selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !t) return <ErrorState message={error?.message ?? "Transfer not found"} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        backHref="/inventory/transfers"
        breadcrumbs={[{ label: "Transfers", href: "/inventory/transfers" }, { label: t.number }]}
        eyebrow="Stock transfer"
        title={t.number}
        description={
          <span className="flex items-center gap-2">
            {t.fromLocationName} <ArrowRight className="size-3.5" /> {t.toLocationName} · {formatDate(t.date)}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Items" flush className="lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead align="right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(t.lines ?? []).map((l) => (
                <TableRow key={l.id} className="hover:bg-transparent">
                  <TableCell className="font-medium">
                    {l.productName}
                    {l.variantName && <span className="font-normal text-muted-foreground"> · {l.variantName}</span>}
                  </TableCell>
                  <TableCell className="font-mono text-[12.5px] text-muted-foreground">{l.sku ?? "—"}</TableCell>
                  <TableCell numeric className="font-semibold">
                    {formatQty(l.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={2}>{t.itemCount} items</TableCell>
                <TableCell numeric>{formatQty(t.totalQuantity)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </SectionCard>
        <SectionCard title="Details" className="self-start">
          <KeyValue
            items={[
              { label: "From", value: t.fromLocationName },
              { label: "To", value: t.toLocationName },
              { label: "Date", value: formatDate(t.date) },
              { label: "Created by", value: t.createdByName },
              { label: "Created at", value: formatDateTime(t.createdAt) },
              { label: "Note", value: t.note, hideEmpty: true },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
