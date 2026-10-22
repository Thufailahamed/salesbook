"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, HandCoins, Receipt, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import type { Invoice, Paginated } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, type DateRange } from "@/components/filters";
import { LocationSelect, UserSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { StatCard } from "@/components/stat-card";
import { PaymentStatusBadge, StatusBadge } from "@/components/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { cn, downloadFile, formatDate, formatQty, formatTime, toCSV } from "@/lib/utils";

type InvoiceList = Paginated<Invoice> & { totals: { total: number; due: number } };

const PAYMENT_TABS = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partially paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "due", label: "Balance due" },
];

/** Grid shared by the column labels and every invoice row, so they line up on desktop. */
const ROW_GRID = "grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)]";

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <InvoicesPage />
    </React.Suspense>
  );
}

function InvoicesPage() {
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

  const totals = data?.totals;

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
              <Button variant="brand" asChild>
                <Link href="/pos">
                  <ShoppingCart /> New sale
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* Headline numbers for whatever the filters currently show. */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard
          variant="feature"
          className="col-span-2 md:col-span-1"
          label="Sales in view"
          icon={Receipt}
          value={money.format(totals?.total ?? 0)}
          sublabel={data ? `${data.total} ${data.total === 1 ? "invoice" : "invoices"} matching filters` : undefined}
          loading={!data}
        />
        <StatCard
          label="Still to collect"
          icon={HandCoins}
          tone={totals && totals.due > 0 ? "danger" : "success"}
          value={money.format(totals?.due ?? 0)}
          sublabel="Balance due on these invoices"
          loading={!data}
        />
        <StatCard label="Invoices" icon={ShoppingCart} value={String(data?.total ?? 0)} sublabel="Across all pages" loading={!data} />
      </div>

      <section className="overflow-hidden rounded-3xl bg-card shadow-card">
        {/* Filters */}
        <div className="grid gap-3 border-b border-border/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[16rem] flex-1">
              <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number or customer…" />
            </div>
            <div className="flex flex-wrap gap-2">
              <DateRangePicker value={range} onChange={reset(setRange)} />
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
            </div>
          </div>
          <div className="-mx-1 overflow-x-auto px-1">
            <ToggleGroup
              type="single"
              value={paymentStatus ?? "all"}
              onValueChange={(v) => {
                if (v) reset(setPaymentStatus)(v === "all" ? undefined : v);
              }}
              className="w-max"
            >
              {PAYMENT_TABS.map((t) => (
                <ToggleGroupItem key={t.value} value={t.value} className="px-3.5">
                  {t.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        {/* Column labels (desktop) */}
        <div className={cn("hidden items-center gap-4 border-b border-border/60 bg-muted/35 px-6 py-3 sm:grid", ROW_GRID)}>
          <span aria-hidden />
          <span className="label-caps text-muted-foreground">Invoice</span>
          <span className="label-caps text-muted-foreground">Date</span>
          <span className="label-caps text-muted-foreground">Status</span>
          <span className="label-caps text-right text-muted-foreground">Total</span>
        </div>

        {/* Rows */}
        {isLoading || !data ? (
          <ul className="divide-y divide-border/60">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="hidden h-3.5 w-24 sm:block" />
                <Skeleton className="h-3.5 w-20" />
              </li>
            ))}
          </ul>
        ) : data.data.length === 0 ? (
          <div className="px-6 py-10">
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
          </div>
        ) : (
          <ul className={cn("divide-y divide-border/60 transition-opacity", isFetching && "opacity-60")}>
            {data.data.map((i) => (
              <InvoiceRow key={i.id} invoice={i} />
            ))}
          </ul>
        )}

        {data && data.total > 0 && (
          <div className="border-t border-border/60 bg-muted/35">
            <Pagination page={page} pageSize={25} total={data.total} onPageChange={setPage} />
          </div>
        )}
      </section>
    </>
  );
}

function InvoiceRow({ invoice: i }: { invoice: Invoice }) {
  const voided = i.status === "void";
  const due = voided ? 0 : i.amountDue;
  const statusBadge = voided ? <StatusBadge>Void</StatusBadge> : <PaymentStatusBadge status={i.paymentStatus} />;

  return (
    <li>
      <Link
        href={`/sales/view?id=${i.id}`}
        className={cn(
          "grid items-center gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-muted/50 sm:px-6",
          ROW_GRID,
          voided && "opacity-60",
        )}
      >
        <Avatar name={i.customerName ?? "Walk-in"} />

        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold tracking-tight">{i.number}</span>
            {i.kind === "opening_balance" && (
              <Badge variant="outline" className="shrink-0">
                Opening
              </Badge>
            )}
          </p>
          <p className={cn("truncate text-[13px]", i.customerName ? "text-foreground/80" : "text-muted-foreground")}>
            {i.customerName ?? "Walk-in customer"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-muted-foreground sm:hidden">
            <span className="num">{formatDate(i.date)}</span>
            <span aria-hidden>·</span>
            <span className="num">{formatQty(i.itemCount)} items</span>
            <span className="ml-auto">{statusBadge}</span>
          </div>
        </div>

        <div className="hidden min-w-0 sm:block">
          <p className="num text-[13px]">{formatDate(i.date)}</p>
          <p className="num text-[12px] text-muted-foreground">
            {formatTime(i.createdAt)} · {formatQty(i.itemCount)} {i.itemCount === 1 ? "item" : "items"}
          </p>
        </div>

        <div className="hidden sm:block">{statusBadge}</div>

        <div className="text-right">
          <Money value={i.total} className={cn("figure text-[15px] font-semibold", voided && "text-muted-foreground line-through")} />
          {due > 0 && (
            <p className="num text-[12px] font-medium text-destructive">
              Due <Money value={due} />
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
