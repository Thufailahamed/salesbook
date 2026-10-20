"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Truck, WalletCards, Wallet } from "lucide-react";
import type { Paginated, Supplier } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { FilterSelect, SearchInput } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { SupplierFormDialog } from "@/components/party-dialogs";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { formatNumber, relativeTime } from "@/lib/utils";

type SupplierList = Paginated<Supplier> & { totals: { due: number; credit: number } };

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <SuppliersPage />
    </React.Suspense>
  );
}

function SuppliersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const money = useMoney();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [balance, setBalance] = React.useState<string | undefined>(params.get("balance") ?? undefined);
  const [status, setStatus] = React.useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = React.useState(params.get("new") === "1");

  const sort = balance === "due" ? "due" : balance === "credit" ? "credit" : undefined;
  const { data, isLoading, isFetching } = useApiQuery<SupplierList>("/suppliers", {
    page,
    pageSize: 25,
    q,
    balance,
    status,
    sort,
    order: sort ? "desc" : undefined,
  });

  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: "Supplier",
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={s.name} size="sm" square />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {s.name}
              {!s.isActive && <span className="ml-2 text-xs font-normal text-muted-foreground">archived</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{[s.contactName, s.phone || s.email].filter(Boolean).join(" · ") || "No contact details"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "terms",
      header: "Terms",
      hideBelow: "lg",
      cell: (s) => <span className="text-[13px] text-muted-foreground">{s.paymentTermsDays ? `Net ${s.paymentTermsDays}` : "On receipt"}</span>,
    },
    {
      key: "last",
      header: "Last purchase",
      hideBelow: "md",
      cell: (s) => <span className="text-[13px] text-muted-foreground">{s.lastPurchaseAt ? relativeTime(s.lastPurchaseAt) : "Never"}</span>,
    },
    { key: "purchased", header: "Purchased", numeric: true, hideBelow: "md", cell: (s) => <Money value={s.totalPurchased} dashZero /> },
    {
      key: "due",
      header: "You owe",
      numeric: true,
      cell: (s) => (s.dueBalance > 0 ? <Money value={s.dueBalance} className="font-semibold text-destructive" /> : <Money value={0} dashZero />),
    },
    { key: "credit", header: "Credit", numeric: true, hideBelow: "sm", cell: (s) => <Money value={s.creditBalance} tone="positive" dashZero /> },
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Vendors, bills you owe and credits they hold for you."
        actions={
          can("suppliers.manage") && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New supplier
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard size="sm" label="Suppliers" value={formatNumber(data?.total ?? 0)} icon={Truck} tone="neutral" loading={isLoading} />
        <StatCard size="sm" label="Payable to suppliers" value={money.format(data?.totals.due)} icon={Wallet} tone="danger" loading={isLoading} href="/reports/payables" />
        <StatCard size="sm" label="Supplier credit" value={money.format(data?.totals.credit)} icon={WalletCards} tone="success" loading={isLoading} />
      </div>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/suppliers/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Search suppliers…"
            />
            <FilterSelect
              value={balance}
              onChange={(v) => {
                setBalance(v);
                setPage(1);
              }}
              allLabel="Any balance"
              options={[
                { value: "due", label: "You owe them" },
                { value: "credit", label: "They owe you credit" },
              ]}
            />
            <FilterSelect
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              allLabel="Active"
              options={[
                { value: "archived", label: "Archived" },
                { value: "all", label: "All suppliers" },
              ]}
              className="sm:w-36"
            />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        empty={
          <EmptyState
            icon={Truck}
            title={q || balance ? "No matching suppliers" : "No suppliers yet"}
            description={q || balance ? "Try a different search or filter." : "Add the vendors you buy stock from to record purchases and bills."}
            action={
              !q && !balance && can("suppliers.manage") ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus /> Add supplier
                </Button>
              ) : undefined
            }
          />
        }
      />

      <SupplierFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(s) => router.push(`/suppliers/view?id=${s.id}`)} />
    </>
  );
}
