"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Ban } from "lucide-react";
import type { Paginated, Payment, PaymentSource } from "@shopbooks/shared";
import { TENDER_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, type DateRange } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { KeyValue } from "@/components/key-value";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { docHref } from "@/lib/links";
import { formatDate, formatDateTime } from "@/lib/utils";

type PaymentList = Paginated<Payment> & { totals: { in: number; out: number } };

const SOURCE_LABELS: Record<PaymentSource, string> = {
  sale: "Sale",
  invoice_payment: "Invoice payment",
  customer_payment: "Customer payment",
  sale_refund: "Refund",
  store_credit_refund: "Store credit payout",
  purchase: "Purchase",
  supplier_payment: "Supplier payment",
  supplier_refund: "Supplier refund",
  gift_card_sale: "Gift card sale",
};
const VOIDABLE: PaymentSource[] = ["customer_payment", "invoice_payment", "store_credit_refund", "supplier_payment", "supplier_refund"];

export default function PaymentsPage() {
  const money = useMoney();
  const { paymentMethods } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [direction, setDirection] = React.useState<string | undefined>(undefined);
  const [partyType, setPartyType] = React.useState<string | undefined>(undefined);
  const [methodId, setMethodId] = React.useState<string | undefined>(undefined);
  const [selected, setSelected] = React.useState<Payment | null>(null);
  const { data, isLoading, isFetching } = useApiQuery<PaymentList>("/payments", {
    page,
    pageSize: 50,
    q,
    ...range,
    direction,
    partyType,
    methodId,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<Payment>[] = [
    {
      key: "number",
      header: "Payment",
      cell: (p) => (
        <div className="flex items-center gap-2.5">
          <span className={p.direction === "in" ? "text-success" : "text-destructive"}>
            {p.direction === "in" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
          </span>
          <div>
            <p className="font-mono text-[12.5px] font-medium">{p.number}</p>
            <p className="text-xs text-muted-foreground">{SOURCE_LABELS[p.source]}</p>
          </div>
        </div>
      ),
    },
    { key: "date", header: "Date", hideBelow: "sm", cell: (p) => <span className="text-muted-foreground">{formatDate(p.date)}</span> },
    { key: "party", header: "Party", cell: (p) => p.partyName ?? <span className="text-muted-foreground">—</span> },
    {
      key: "method",
      header: "Method",
      hideBelow: "md",
      cell: (p) => (
        <span className="text-[13px]">
          {p.methodName ?? TENDER_LABELS[p.tender]}
          {p.reference && <span className="ml-1 font-mono text-[11.5px] text-muted-foreground">{p.reference}</span>}
        </span>
      ),
    },
    {
      key: "status",
      header: "",
      hideBelow: "lg",
      width: 80,
      cell: (p) => (p.status === "void" ? <Badge variant="neutral">Void</Badge> : null),
    },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      cell: (p) => (
        <Money
          value={p.direction === "in" ? p.amount : -p.amount}
          tone={p.status === "void" ? "muted" : "signed"}
          className={p.status === "void" ? "line-through" : "font-medium"}
        />
      ),
    },
  ];

  const t = data?.totals;
  return (
    <>
      <PageHeader title="Payments" description="Every receipt and payment — from sales, customers, suppliers and refunds." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard size="sm" label="Money in" value={money.format(t?.in)} icon={ArrowDownLeft} tone="success" loading={isLoading} />
        <StatCard size="sm" label="Money out" value={money.format(t?.out)} icon={ArrowUpRight} tone="danger" loading={isLoading} />
        <StatCard
          size="sm"
          label="Net"
          value={<span className={t && t.in - t.out < 0 ? "text-destructive" : undefined}>{money.format(t ? t.in - t.out : 0)}</span>}
          icon={ArrowRightLeft}
          tone="neutral"
          loading={isLoading}
        />
      </div>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={setSelected}
        rowClassName={(p) => (p.status === "void" ? "opacity-60" : undefined)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number, party or reference…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <FilterSelect
              value={direction}
              onChange={reset(setDirection)}
              allLabel="In & out"
              options={[
                { value: "in", label: "Money in" },
                { value: "out", label: "Money out" },
              ]}
              className="sm:w-36"
            />
            <FilterSelect
              value={partyType}
              onChange={reset(setPartyType)}
              allLabel="All parties"
              options={[
                { value: "customer", label: "Customers" },
                { value: "supplier", label: "Suppliers" },
                { value: "none", label: "Walk-in / none" },
              ]}
              className="sm:w-40"
            />
            <FilterSelect
              value={methodId}
              onChange={reset(setMethodId)}
              allLabel="All methods"
              options={paymentMethods.map((m) => ({ value: m.id, label: m.name }))}
              className="sm:w-40"
            />
          </>
        }
        pagination={{ page, pageSize: 50, total: data?.total ?? 0, onPageChange: setPage }}
        empty={<EmptyState icon={ArrowRightLeft} title="No payments" description="Payments appear here as you sell, collect and pay bills." />}
      />
      <PaymentSheet payment={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}

function PaymentSheet({ payment, onOpenChange }: { payment: Payment | null; onOpenChange: (o: boolean) => void }) {
  const confirm = useConfirm();
  const { can } = useSession();
  const p = payment;
  const voidIt = useApiMutation((reason: string) => api.post<Payment>(`/payments/${p!.id}/void`, { reason }), {
    invalidate: ["/payments", "/customers", "/suppliers", "/sales", "/purchases", "/reports", "/accounting"],
    success: "Payment voided",
    onSuccess: () => onOpenChange(false),
  });
  const canVoid =
    !!p && p.status !== "void" && VOIDABLE.includes(p.source) && (p.partyType === "supplier" ? can("suppliers.manage") : can("sales.void"));
  const partyHref = p?.partyId ? docHref(p.partyType, p.partyId) : null;

  return (
    <Sheet open={!!p} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        {p && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">{p.number}</SheetTitle>
            </SheetHeader>
            <SheetBody className="grid content-start gap-6">
              <div>
                <p className="label-caps">{p.direction === "in" ? "Received" : "Paid out"}</p>
                <p className="figure mt-1 text-4xl">
                  <Money value={p.amount} />
                </p>
                {p.status === "void" && (
                  <Badge variant="danger" className="mt-2">
                    Void
                  </Badge>
                )}
              </div>
              <KeyValue
                items={[
                  { label: "Type", value: SOURCE_LABELS[p.source] },
                  { label: "Date", value: formatDateTime(p.createdAt) },
                  {
                    label: "Party",
                    value: partyHref ? (
                      <Link href={partyHref} className="text-primary hover:underline">
                        {p.partyName}
                      </Link>
                    ) : (
                      p.partyName ?? "—"
                    ),
                  },
                  { label: "Method", value: p.methodName ?? TENDER_LABELS[p.tender] },
                  { label: "Reference", value: p.reference ?? p.giftCardCode, hideEmpty: true },
                  { label: "Points", value: p.points, hideEmpty: true },
                  { label: "Cash tendered", value: p.tendered && p.tendered !== p.amount ? <Money value={p.tendered} /> : null, hideEmpty: true },
                  { label: "Change", value: p.change ? <Money value={p.change} /> : null, hideEmpty: true },
                  { label: "Recorded by", value: p.createdByName },
                  { label: "Note", value: p.note, hideEmpty: true },
                ]}
              />
              {p.allocations.length > 0 && (
                <div>
                  <p className="label-caps mb-2">Applied to</p>
                  <ul className="divide-y divide-border/70 rounded-xl border border-border">
                    {p.allocations.map((a) => {
                      const href = docHref(a.docType, a.docId);
                      return (
                        <li key={`${a.docType}-${a.docId}`} className="flex items-center justify-between px-3 py-2 text-sm">
                          {href ? (
                            <Link href={href} className="font-mono text-[12.5px] text-primary hover:underline">
                              {a.docNumber}
                            </Link>
                          ) : (
                            <span className="font-mono text-[12.5px]">{a.docNumber}</span>
                          )}
                          <Money value={a.amount} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </SheetBody>
            {canVoid && (
              <SheetFooter>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={async () => {
                    const reason = await confirm({
                      title: `Void ${p.number}?`,
                      description: "The payment is reversed and the documents it settled become due again.",
                      tone: "destructive",
                      requireReason: true,
                      confirmText: "Void payment",
                    });
                    if (typeof reason === "string") voidIt.mutate(reason);
                  }}
                >
                  <Ban /> Void payment
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
