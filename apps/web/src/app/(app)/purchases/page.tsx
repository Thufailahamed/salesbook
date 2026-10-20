"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, ShoppingBag } from "lucide-react";
import type { Paginated, Purchase } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, type DateRange } from "@/components/filters";
import { LocationSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { PaymentStatusBadge, PurchaseStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { formatDate } from "@/lib/utils";

type PurchaseList = Paginated<Purchase> & { totals: { total: number; due: number } };

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <PurchasesPage />
    </React.Suspense>
  );
}

function PurchasesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [status, setStatus] = React.useState<string | undefined>(params.get("status") ?? undefined);
  const [paymentStatus, setPaymentStatus] = React.useState<string | undefined>(undefined);
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const { data, isLoading, isFetching } = useApiQuery<PurchaseList>("/purchases", {
    page,
    pageSize: 25,
    q,
    ...range,
    status,
    paymentStatus,
    locationId,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const filtered = !!(q || range.from || status || paymentStatus || locationId);

  const columns: Column<Purchase>[] = [
    { key: "number", header: "Purchase", cell: (p) => <span className="font-mono text-[12.5px] font-medium">{p.number}</span> },
    { key: "date", header: "Date", hideBelow: "sm", cell: (p) => <span className="text-muted-foreground">{formatDate(p.receivedDate ?? p.orderDate)}</span> },
    { key: "supplier", header: "Supplier", cell: (p) => <span className="line-clamp-1">{p.supplierName}</span> },
    { key: "ref", header: "Ref", hideBelow: "lg", cell: (p) => <span className="font-mono text-[12px] text-muted-foreground">{p.supplierRef ?? "—"}</span> },
    {
      key: "status",
      header: "Status",
      cell: (p) => (p.status === "received" ? <PaymentStatusBadge status={p.paymentStatus} /> : <PurchaseStatusBadge status={p.status} />),
    },
    { key: "total", header: "Total", numeric: true, cell: (p) => <Money value={p.total} className={p.status === "cancelled" ? "text-muted-foreground line-through" : "font-medium"} /> },
    {
      key: "due",
      header: "Due",
      numeric: true,
      hideBelow: "md",
      cell: (p) => <Money value={p.status === "received" ? p.amountDue : 0} dashZero className={p.amountDue > 0 ? "text-destructive" : undefined} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Purchase orders, goods received and supplier bills."
        actions={
          can("purchases.manage") && (
            <Button asChild>
              <Link href="/purchases/new">
                <Plus /> New purchase
              </Link>
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/purchases/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number, supplier or ref…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <FilterSelect
              value={status}
              onChange={reset(setStatus)}
              allLabel="All statuses"
              options={[
                { value: "ordered", label: "Ordered" },
                { value: "received", label: "Received" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              className="sm:w-36"
            />
            <FilterSelect
              value={paymentStatus}
              onChange={reset(setPaymentStatus)}
              allLabel="Any payment"
              options={[
                { value: "paid", label: "Paid" },
                { value: "partial", label: "Partially paid" },
                { value: "unpaid", label: "Unpaid" },
                { value: "due", label: "Has balance due" },
              ]}
              className="sm:w-40"
            />
            <LocationSelect value={locationId} onChange={reset(setLocationId)} allowAll className="sm:w-44" />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        footer={
          data &&
          data.total > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7}>
                <div className="flex justify-end gap-6">
                  <span className="font-normal text-muted-foreground">{data.total} purchases</span>
                  <span>
                    Total <Money value={data.totals.total} />
                  </span>
                  <span>
                    Due <Money value={data.totals.due} />
                  </span>
                </div>
              </TableCell>
            </TableRow>
          )
        }
        empty={
          <EmptyState
            icon={ShoppingBag}
            title={filtered ? "No matching purchases" : "No purchases yet"}
            description={filtered ? "Try different filters." : "Record stock you buy to keep costs and payables accurate."}
            action={
              !filtered && can("purchases.manage") ? (
                <Button size="sm" asChild>
                  <Link href="/purchases/new">
                    <Plus /> New purchase
                  </Link>
                </Button>
              ) : undefined
            }
          />
        }
      />
    </>
  );
}
