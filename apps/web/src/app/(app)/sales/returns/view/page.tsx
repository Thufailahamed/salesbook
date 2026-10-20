"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Printer, Receipt } from "lucide-react";
import type { SaleReturn } from "@shopbooks/shared";
import { TENDER_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { formatDate, formatDateTime, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <ReturnView />
    </React.Suspense>
  );
}

function ReturnView() {
  const id = useSearchParams().get("id");
  const money = useMoney();
  const { data: r, isLoading, error, refetch } = useApiQuery<SaleReturn>(id ? `/returns/${id}` : null);
  if (!id) return <ErrorState message="No return selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !r) return <ErrorState message={error?.message ?? "Return not found"} onRetry={() => refetch()} />;

  const settlement = [
    { label: "Reduced the invoice balance", value: r.appliedToInvoice },
    { label: "Applied to exchange", value: r.appliedToExchange },
    { label: "Added to store credit", value: r.toStoreCredit },
    { label: "Refunded", value: r.refunded },
  ].filter((s) => s.value > 0);

  return (
    <>
      <PageHeader
        backHref="/sales/returns"
        breadcrumbs={[{ label: "Returns", href: "/sales/returns" }, { label: r.number }]}
        eyebrow="Credit note"
        title={<span className="font-mono tracking-tight">{r.number}</span>}
        description={`${formatDate(r.date)} · ${r.locationName ?? ""}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.open(`/print/return?id=${r.id}&format=receipt&autoprint=1`, "_blank")}>
              <Receipt /> Receipt
            </Button>
            <Button variant="outline" onClick={() => window.open(`/print/return?id=${r.id}&autoprint=1`, "_blank")}>
              <Printer /> Credit note
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <SectionCard title="Returned items" flush>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Item</TableHead>
                  <TableHead align="right">Qty</TableHead>
                  <TableHead align="right" className="hidden sm:table-cell">
                    Tax
                  </TableHead>
                  <TableHead align="right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(r.lines ?? []).map((l) => (
                  <TableRow key={l.id} className="hover:bg-transparent">
                    <TableCell>
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.sku ? `${l.sku} · ` : ""}
                        {l.variantId ? (
                          l.restock ? (
                            "Back in stock"
                          ) : (
                            <span className="text-warning">Written off (damaged)</span>
                          )
                        ) : (
                          "Not a stock item"
                        )}
                      </p>
                    </TableCell>
                    <TableCell numeric>{formatQty(l.quantity)}</TableCell>
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
                  <dt>Total credit</dt>
                  <dd className="figure">{money.format(r.total)}</dd>
                </div>
              </dl>
            </div>
          </SectionCard>
          {(r.payments ?? []).length > 0 && (
            <SectionCard title="Refunds & applications" flush>
              <Table>
                <TableBody>
                  {r.payments!.map((p) => (
                    <TableRow key={p.id} className="hover:bg-transparent">
                      <TableCell>
                        <p className="font-medium">
                          {p.methodName ?? TENDER_LABELS[p.tender]}
                          {p.status === "void" && (
                            <Badge variant="neutral" className="ml-2">
                              Void
                            </Badge>
                          )}
                        </p>
                        <p className="font-mono text-[11.5px] text-muted-foreground">{p.number}</p>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDateTime(p.createdAt)}</TableCell>
                      <TableCell numeric>
                        <Money value={p.direction === "out" ? -p.amount : p.amount} tone="signed" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          )}
        </div>
        <div className="grid content-start gap-6">
          <SectionCard title="Settlement">
            <KeyValue layout="inline" items={settlement.map((s) => ({ label: s.label, value: <Money value={s.value} /> }))} />
          </SectionCard>
          <SectionCard title="Details">
            <KeyValue
              items={[
                {
                  label: "Original invoice",
                  value: (
                    <Link href={`/sales/view?id=${r.invoiceId}`} className="font-mono text-primary hover:underline">
                      {r.invoiceNumber}
                    </Link>
                  ),
                },
                {
                  label: "Exchange invoice",
                  value: r.exchangeInvoiceId ? (
                    <Link href={`/sales/view?id=${r.exchangeInvoiceId}`} className="font-mono text-primary hover:underline">
                      {r.exchangeInvoiceNumber}
                    </Link>
                  ) : null,
                  hideEmpty: true,
                },
                {
                  label: "Customer",
                  value: r.customerId ? (
                    <Link href={`/customers/view?id=${r.customerId}`} className="hover:underline">
                      {r.customerName}
                    </Link>
                  ) : (
                    "Walk-in customer"
                  ),
                },
                { label: "Reason", value: r.reason, hideEmpty: true },
                { label: "Processed by", value: r.createdByName },
                { label: "Created", value: formatDateTime(r.createdAt) },
              ]}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
