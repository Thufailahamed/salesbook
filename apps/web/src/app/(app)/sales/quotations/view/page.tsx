"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, MoreHorizontal, Pencil, Printer, Send, ShoppingCart, Trash2, X } from "lucide-react";
import type { Quotation, QuotationStatus } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { Money } from "@/components/money";
import { QuotationStatusBadge } from "@/components/status-badge";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatQty } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <QuotationView />
    </React.Suspense>
  );
}

function QuotationView() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const confirm = useConfirm();
  const money = useMoney();
  const { can } = useSession();
  const { data: q, isLoading, error, refetch } = useApiQuery<Quotation>(id ? `/quotations/${id}` : null);

  const setStatus = useApiMutation((status: QuotationStatus) => api.patch<Quotation>(`/quotations/${id}/status`, { status }), {
    invalidate: ["/quotations"],
    success: (r) => `Marked ${r.status}`,
  });
  const remove = useApiMutation(() => api.del(`/quotations/${id}`), {
    invalidate: ["/quotations"],
    success: "Quotation deleted",
    onSuccess: () => router.push("/sales/quotations"),
  });

  if (!id) return <ErrorState message="No quotation selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !q) return <ErrorState message={error?.message ?? "Quotation not found"} onRetry={() => refetch()} />;

  const manage = can("quotations.manage");
  const converted = q.status === "converted";

  return (
    <>
      <PageHeader
        backHref="/sales/quotations"
        breadcrumbs={[{ label: "Quotations", href: "/sales/quotations" }, { label: q.number }]}
        eyebrow="Quotation"
        title={<span className="font-mono tracking-tight">{q.number}</span>}
        badge={<QuotationStatusBadge status={q.status} />}
        description={`${q.customerName ?? "No customer"} · ${formatDate(q.date)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.open(`/print/quotation?id=${q.id}&autoprint=1`, "_blank")}>
              <Printer /> Print
            </Button>
            {converted && q.convertedInvoiceId ? (
              <Button asChild>
                <Link href={`/sales/view?id=${q.convertedInvoiceId}`}>View invoice</Link>
              </Button>
            ) : (
              can("pos.sell") && (
                <Button asChild>
                  <Link href={`/pos?quotationId=${q.id}`}>
                    <ShoppingCart /> Convert to sale
                  </Link>
                </Button>
              )
            )}
            {manage && !converted && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem asChild>
                    <Link href={`/sales/quotations/new?id=${q.id}`}>
                      <Pencil /> Edit
                    </Link>
                  </DropdownMenuItem>
                  {q.status !== "sent" && (
                    <DropdownMenuItem onSelect={() => setStatus.mutate("sent")}>
                      <Send /> Mark as sent
                    </DropdownMenuItem>
                  )}
                  {q.status !== "accepted" && (
                    <DropdownMenuItem onSelect={() => setStatus.mutate("accepted")}>
                      <Check /> Mark accepted
                    </DropdownMenuItem>
                  )}
                  {q.status !== "declined" && (
                    <DropdownMenuItem onSelect={() => setStatus.mutate("declined")}>
                      <X /> Mark declined
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={async () => {
                      if (await confirm({ title: `Delete ${q.number}?`, tone: "destructive", confirmText: "Delete" })) remove.mutate();
                    }}
                  >
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Items" flush className="min-w-0 lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Item</TableHead>
                <TableHead align="right">Qty</TableHead>
                <TableHead align="right" className="hidden sm:table-cell">
                  Price
                </TableHead>
                <TableHead align="right" className="hidden md:table-cell">
                  Discount
                </TableHead>
                <TableHead align="right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.lines ?? []).map((l) => (
                <TableRow key={l.id} className="hover:bg-transparent">
                  <TableCell>
                    <p className="font-medium">{l.name}</p>
                    {l.sku && <p className="font-mono text-[11.5px] text-muted-foreground">{l.sku}</p>}
                  </TableCell>
                  <TableCell numeric>{formatQty(l.quantity)}</TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    <Money value={l.unitPrice} />
                  </TableCell>
                  <TableCell numeric className="hidden md:table-cell">
                    <Money value={l.lineDiscount + l.docDiscount} dashZero />
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
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>
                  <Money value={q.subtotal} />
                </dd>
              </div>
              {q.discountTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discounts</dt>
                  <dd>
                    <Money value={-q.discountTotal} />
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax{q.taxInclusive ? " (included)" : ""}</dt>
                <dd>
                  <Money value={q.taxTotal} />
                </dd>
              </div>
              {q.shipping > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Charges</dt>
                  <dd>
                    <Money value={q.shipping} />
                  </dd>
                </div>
              )}
              <div className="rule-double-top mt-1 flex justify-between pt-2 font-display text-lg font-semibold">
                <dt>Total</dt>
                <dd className="figure">{money.format(q.total)}</dd>
              </div>
            </dl>
          </div>
        </SectionCard>
        <div className="grid content-start gap-6">
          <SectionCard title="Details">
            <KeyValue
              items={[
                {
                  label: "Customer",
                  value: q.customerId ? (
                    <Link href={`/customers/view?id=${q.customerId}`} className="hover:underline">
                      {q.customerName}
                    </Link>
                  ) : (
                    q.customerName
                  ),
                },
                { label: "Phone", value: q.customerPhone, hideEmpty: true },
                { label: "Location", value: q.locationName },
                { label: "Date", value: formatDate(q.date) },
                { label: "Valid until", value: q.validUntil ? formatDate(q.validUntil) : "No expiry" },
                { label: "Prepared by", value: q.createdByName },
                { label: "Created", value: formatDateTime(q.createdAt) },
              ]}
            />
          </SectionCard>
          {(q.notes || q.terms) && (
            <SectionCard title="Notes & terms">
              <KeyValue
                items={[
                  { label: "Notes", value: q.notes ? <span className="whitespace-pre-line">{q.notes}</span> : null, hideEmpty: true },
                  { label: "Terms", value: q.terms ? <span className="whitespace-pre-line">{q.terms}</span> : null, hideEmpty: true },
                ]}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </>
  );
}
