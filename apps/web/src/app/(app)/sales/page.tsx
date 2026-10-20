"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Receipt, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import type { Invoice, Paginated } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, type DateRange } from "@/components/filters";
import { LocationSelect, UserSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { PaymentStatusBadge, StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { downloadFile, formatDate, formatQty, formatTime, toCSV } from "@/lib/utils";

type InvoiceList = Paginated<Invoice> & { totals: { total: number; due: number } };

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <InvoicesPage />
    </React.Suspense>
  );
}

function InvoicesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const money = useMoney();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [paymentStatus, setPaymentStatus] = React.useState<string | undefined>(params.get("paymentStatus") ?? undefined);
  const [status, setStatus] = React.useState<string | undefined>(undefined);
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const [salespersonId, setSalespersonId] = React.useState<string | undefined>(undefined);
  const [exporting, setExporting] = React.useState(false);

  const filters = { q, ...range, paymentStatus, status, locationId, salespersonId, kind: "all" };
  const { data, isLoading, isFetching } = useApiQuery<InvoiceList>("/sales", { page, pageSize: 25, ...filters });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const filtered = !!(q || range.from || paymentStatus || status || locationId || salespersonId);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await api.get<InvoiceList>("/sales", { ...filters, page: 1, pageSize: 500 });
      downloadFile(
        "invoices.csv",
        toCSV([
          ["Number", "Date", "Customer", "Location", "Status", "Payment", "Items", "Net", "Tax", "Total", "Paid", "Due"],
          ...all.data.map((i) => [
            i.number,
            i.date,
            i.customerName ?? "Walk-in",
            i.locationName,
            i.status,
            i.paymentStatus,
            i.itemCount,
            money.toMajor(i.netTotal),
            money.toMajor(i.taxTotal),
            money.toMajor(i.total),
            money.toMajor(i.amountPaid),
            money.toMajor(i.amountDue),
          ]),
        ]),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<Invoice>[] = [
    {
      key: "number",
      header: "Invoice",
      cell: (i) => (
        <div>
          <p className="font-mono text-[12.5px] font-medium">{i.number}</p>
          <p className="text-xs text-muted-foreground md:hidden">{formatDate(i.date)}</p>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      hideBelow: "md",
      cell: (i) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(i.date)} · {formatTime(i.createdAt)}
        </span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (i) => (
        <span className="line-clamp-1">
          {i.customerName ?? <span className="text-muted-foreground">Walk-in</span>}
          {i.kind === "opening_balance" && (
            <Badge variant="outline" className="ml-2">
              Opening
            </Badge>
          )}
        </span>
      ),
    },
    { key: "items", header: "Items", numeric: true, hideBelow: "lg", cell: (i) => formatQty(i.itemCount) },
    {
      key: "status",
      header: "Status",
      cell: (i) => (i.status === "void" ? <StatusBadge>Void</StatusBadge> : <PaymentStatusBadge status={i.paymentStatus} />),
    },
    {
      key: "total",
      header: "Total",
      numeric: true,
      cell: (i) => <Money value={i.total} className={i.status === "void" ? "text-muted-foreground line-through" : "font-medium"} />,
    },
    {
      key: "due",
      header: "Due",
      numeric: true,
      hideBelow: "sm",
      cell: (i) => <Money value={i.status === "void" ? 0 : i.amountDue} dashZero className={i.amountDue > 0 ? "text-destructive" : undefined} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every sale, its payments and what's still owed."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} loading={exporting}>
              <Download /> Export
            </Button>
            {can("pos.sell") && (
              <Button asChild>
                <Link href="/pos">
                  <ShoppingCart /> New sale
                </Link>
              </Button>
            )}
          </>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/sales/view?id=${r.id}`)}
        rowClassName={(r) => (r.status === "void" ? "opacity-60" : undefined)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number or customer…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
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
            />
            <FilterSelect
              value={status}
              onChange={reset(setStatus)}
              allLabel="Any status"
              options={[
                { value: "completed", label: "Completed" },
                { value: "void", label: "Void" },
              ]}
              className="sm:w-36"
            />
            <LocationSelect value={locationId} onChange={reset(setLocationId)} allowAll className="sm:w-44" />
            <UserSelect value={salespersonId} onChange={reset(setSalespersonId)} allowAll allLabel="All salespeople" className="sm:w-44" />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        footer={
          data &&
          data.total > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={2} className="hidden md:table-cell">
                {data.total} invoices
              </TableCell>
              <TableCell className="md:hidden">{data.total} invoices</TableCell>
              <TableCell />
              <TableCell className="hidden lg:table-cell" />
              <TableCell />
              <TableCell numeric>
                <Money value={data.totals.total} />
              </TableCell>
              <TableCell numeric className="hidden sm:table-cell">
                <Money value={data.totals.due} />
              </TableCell>
            </TableRow>
          )
        }
        empty={
          <EmptyState
            icon={Receipt}
            title={filtered ? "No matching invoices" : "No invoices yet"}
            description={filtered ? "Try different filters." : "Sales rung up at the POS appear here."}
            action={
              !filtered && can("pos.sell") ? (
                <Button size="sm" asChild>
                  <Link href="/pos">Open the POS</Link>
                </Button>
              ) : undefined
            }
          />
        }
      />
    </>
  );
}
