"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BellRing, HandCoins, Plus, Users, WalletCards } from "lucide-react";
import type { Customer, Paginated } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { FilterSelect, SearchInput } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { PageLoader } from "@/components/loading";
import { CustomerFormDialog } from "@/components/party-dialogs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { formatNumber, relativeTime } from "@/lib/utils";

type Row = Customer;
type CustomerList = Paginated<Customer> & { totals: { due: number; credit: number } };

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <CustomersPage />
    </React.Suspense>
  );
}

function CustomersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const money = useMoney();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [balance, setBalance] = React.useState<string | undefined>(params.get("balance") ?? undefined);
  const [status, setStatus] = React.useState<string | undefined>(undefined);
  const [sort, setSort] = React.useState<string | undefined>(balance === "due" ? "due" : undefined);
  const [createOpen, setCreateOpen] = React.useState(params.get("new") === "1");

  const { data, isLoading, isFetching } = useApiQuery<CustomerList>("/customers", {
    page,
    pageSize: 25,
    q,
    balance,
    status,
    sort,
    order: sort ? "desc" : undefined,
  });

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Customer",
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={c.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {c.name}
              {!c.isActive && <span className="ml-2 text-xs font-normal text-muted-foreground">archived</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{c.phone || c.email || "No contact details"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "tier",
      header: "Tier",
      hideBelow: "lg",
      cell: (c) =>
        c.priceTier === "wholesale" ? <Badge variant="info">Wholesale</Badge> : <span className="text-[13px] text-muted-foreground">Retail</span>,
    },
    {
      key: "last",
      header: "Last purchase",
      hideBelow: "md",
      cell: (c) => <span className="text-[13px] text-muted-foreground">{c.lastPurchaseAt ? relativeTime(c.lastPurchaseAt) : "Never"}</span>,
    },
    { key: "spent", header: "Total spent", numeric: true, hideBelow: "md", cell: (c) => <Money value={c.totalSpent} dashZero /> },
    {
      key: "due",
      header: "Owes you",
      numeric: true,
      cell: (c) => (c.dueBalance > 0 ? <Money value={c.dueBalance} className="font-semibold text-destructive" /> : <Money value={0} dashZero />),
    },
    {
      key: "credit",
      header: "Store credit",
      numeric: true,
      hideBelow: "sm",
      cell: (c) => <Money value={c.creditBalance} tone="positive" dashZero />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Accounts, credit balances and buying history."
        actions={
          <>
            {can("messaging.send") && (
              <Button variant="outline" asChild>
                <Link href="/customers/reminders">
                  <BellRing /> Overdue reminders
                </Link>
              </Button>
            )}
            {can("customers.manage") && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> New customer
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard size="sm" label="Customers" value={formatNumber(data?.total ?? 0)} icon={Users} tone="neutral" loading={isLoading} />
        <StatCard
          size="sm"
          label="Receivable from customers"
          value={money.format(data?.totals.due)}
          icon={HandCoins}
          tone="warning"
          loading={isLoading}
          href="/reports/receivables"
        />
        <StatCard size="sm" label="Store credit held" value={money.format(data?.totals.credit)} icon={WalletCards} tone="success" loading={isLoading} />
      </div>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/customers/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Search name, phone or email…"
            />
            <FilterSelect
              value={balance}
              onChange={(v) => {
                setBalance(v);
                setSort(v === "due" ? "due" : v === "credit" ? "credit" : undefined);
                setPage(1);
              }}
              allLabel="Any balance"
              options={[
                { value: "due", label: "Owes money" },
                { value: "credit", label: "Has store credit" },
              ]}
            />
            <FilterSelect
              value={sort}
              onChange={(v) => {
                setSort(v);
                setPage(1);
              }}
              allLabel="Sort: Name"
              options={[
                { value: "due", label: "Sort: Highest due" },
                { value: "spent", label: "Sort: Top spenders" },
                { value: "recent", label: "Sort: Recent buyers" },
                { value: "created", label: "Sort: Newest" },
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
                { value: "all", label: "All customers" },
              ]}
              className="sm:w-36"
            />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        empty={
          <EmptyState
            icon={Users}
            title={q || balance ? "No matching customers" : "No customers yet"}
            description={q || balance ? "Try a different search or filter." : "Add regulars to track credit, loyalty and purchase history."}
            action={
              !q && !balance && can("customers.manage") ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus /> Add customer
                </Button>
              ) : undefined
            }
          />
        }
      />

      <CustomerFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(c) => router.push(`/customers/view?id=${c.id}`)} />
    </>
  );
}
