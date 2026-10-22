"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { StockTransfer } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { DocPanel } from "@/components/doc-detail";
import { KeyValue } from "@/components/key-value";
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

  const lines = t.lines ?? [];

  return (
    <>
      <PageHeader
        backHref="/inventory/transfers"
        breadcrumbs={[{ label: "Transfers", href: "/inventory/transfers" }, { label: t.number }]}
        eyebrow="Stock transfer"
        title={<span className="font-mono tracking-tight">{t.number}</span>}
        description={formatDate(t.date)}
      />

      {/* Route: where the stock left and where it landed. */}
      <section className="metal relative mb-6 overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
          <div className="min-w-0">
            <p className="eyebrow text-white/50">From</p>
            <p className="font-display mt-2 truncate text-2xl font-semibold tracking-[-0.02em]">{t.fromLocationName}</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="flex size-12 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10">
              <ArrowRight className="size-5 text-highlight" />
            </span>
            <p className="figure text-xl text-gold">{formatQty(t.totalQuantity)}</p>
            <p className="num text-[12px] text-white/50">
              {t.itemCount} {t.itemCount === 1 ? "item" : "items"}
            </p>
          </div>
          <div className="min-w-0 sm:text-right">
            <p className="eyebrow text-white/50">To</p>
            <p className="font-display mt-2 truncate text-2xl font-semibold tracking-[-0.02em]">{t.toLocationName}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <DocPanel
          title="Items"
          aside={<span className="label-caps text-muted-foreground">{lines.length} lines</span>}
          flush
          className="lg:col-span-2"
        >
          <ul className="divide-y divide-border/60">
            {lines.map((l) => (
              <li key={l.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-6 py-4">
                <span className="num flex size-11 items-center justify-center rounded-xl bg-muted font-display text-[15px] font-semibold">
                  {formatQty(l.quantity)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {l.productName}
                    {l.variantName && <span className="font-normal text-muted-foreground"> · {l.variantName}</span>}
                  </p>
                  <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">{l.sku ?? "—"}</p>
                </div>
              </li>
            ))}
          </ul>
        </DocPanel>

        <DocPanel title="Details" className="self-start">
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
        </DocPanel>
      </div>
    </>
  );
}
