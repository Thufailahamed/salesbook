"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Gift,
  HandCoins,
  MoreHorizontal,
  Pencil,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Star,
  WalletCards,
} from "lucide-react";
import type { Customer, Invoice, Paginated, Payment, SaleReturn } from "@shopbooks/shared";
import { TENDER_LABELS } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { StatCard } from "@/components/stat-card";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PaymentStatusBadge, ActiveBadge, StatusBadge } from "@/components/status-badge";
import { StatementCard } from "@/components/statement-card";
import { useConfirm } from "@/components/confirm-dialog";
import { ApplyCreditDialog, CreditRefundDialog, CustomerFormDialog, PartyPaymentDialog } from "@/components/party-dialogs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatDate, formatNumber, relativeTime } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <CustomerView />
    </React.Suspense>
  );
}

function CustomerView() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const confirm = useConfirm();
  const money = useMoney();
  const { can, business } = useSession();
  const { data: c, isLoading, error, refetch } = useApiQuery<Customer>(id ? `/customers/${id}` : null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);

  const setActive = useApiMutation(
    (active: boolean) =>
      active ? api.put<Customer>(`/customers/${id}`, { ...toInput(c!), isActive: true }) : api.del(`/customers/${id}`),
    {
      invalidate: ["/customers"],
      success: (_, active) => (active ? "Customer restored" : "Customer archived"),
      // a customer without history is deleted outright, so leave the page
      onSuccess: (_, active) => {
        if (!active) router.push("/customers");
      },
    },
  );

  if (!id) return <ErrorState title="Nothing selected" message="No customer selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !c) return <ErrorState message={error?.message ?? "Customer not found"} onRetry={() => refetch()} />;

  const canPay = can("customers.payments");
  const contact = [c.phone, c.email].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        backHref="/customers"
        breadcrumbs={[{ label: "Customers", href: "/customers" }, { label: c.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={c.name} size="lg" />
            {c.name}
          </span>
        }
        badge={
          <>
            {!c.isActive && <ActiveBadge active={false} />}
            {c.priceTier === "wholesale" && <Badge variant="info">Wholesale</Badge>}
            {c.type === "business" && <Badge variant="outline">Business</Badge>}
          </>
        }
        description={contact || "No contact details"}
        actions={
          <>
            {can("pos.sell") && c.isActive && (
              <Button variant="outline" asChild>
                <Link href={`/pos?customerId=${c.id}`}>
                  <ShoppingCart /> New sale
                </Link>
              </Button>
            )}
            {canPay && c.dueBalance > 0 && (
              <Button onClick={() => setPayOpen(true)}>
                <HandCoins /> Receive payment
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {can("customers.manage") && (
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil /> Edit customer
                  </DropdownMenuItem>
                )}
                {canPay && (
                  <DropdownMenuItem onSelect={() => setPayOpen(true)}>
                    <HandCoins /> Receive advance payment
                  </DropdownMenuItem>
                )}
                {canPay && c.creditBalance > 0 && c.dueBalance > 0 && (
                  <DropdownMenuItem onSelect={() => setApplyOpen(true)}>
                    <WalletCards /> Apply store credit
                  </DropdownMenuItem>
                )}
                {canPay && c.creditBalance > 0 && (
                  <DropdownMenuItem onSelect={() => setRefundOpen(true)}>
                    <RotateCcw /> Refund store credit
                  </DropdownMenuItem>
                )}
                {can("customers.manage") && (
                  <>
                    <DropdownMenuSeparator />
                    {c.isActive ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={async () => {
                          const ok = await confirm({
                            title: `Archive ${c.name}?`,
                            description: "Archived customers are hidden from pickers. Their history is kept.",
                            tone: "destructive",
                            confirmText: "Archive",
                          });
                          if (ok) setActive.mutate(false);
                        }}
                      >
                        <Archive /> Archive
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => setActive.mutate(true)}>
                        <ArchiveRestore /> Restore
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Owes you"
          value={<span className={c.dueBalance > 0 ? "text-destructive" : undefined}>{money.format(c.dueBalance)}</span>}
          icon={HandCoins}
          tone={c.dueBalance > 0 ? "danger" : "neutral"}
          sublabel={c.allowCredit ? (c.creditLimit > 0 ? `limit ${money.format(c.creditLimit)}` : "no credit limit") : "credit sales off"}
        />
        <StatCard label="Store credit" value={money.format(c.creditBalance)} icon={WalletCards} tone="success" />
        <StatCard
          label="Lifetime spend"
          value={money.format(c.totalSpent)}
          icon={Receipt}
          tone="info"
          sublabel={`${formatNumber(c.invoiceCount)} invoices${c.lastPurchaseAt ? ` · last ${relativeTime(c.lastPurchaseAt)}` : ""}`}
        />
        <StatCard
          label="Loyalty points"
          value={formatNumber(c.loyaltyPoints)}
          icon={Star}
          tone="warning"
          sublabel={business.loyaltyEnabled ? `worth ${money.format(c.loyaltyPoints * business.loyaltyPointValue)}` : "loyalty is off"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Tabs defaultValue="invoices" variant="underline">
            <TabsList>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="statement">Statement</TabsTrigger>
              <TabsTrigger value="returns">Returns</TabsTrigger>
              {can("payments.view") && <TabsTrigger value="payments">Payments</TabsTrigger>}
            </TabsList>
            <TabsContent value="invoices">
              <CustomerInvoices customerId={c.id} />
            </TabsContent>
            <TabsContent value="statement">
              <StatementCard kind="customer" partyId={c.id} />
            </TabsContent>
            <TabsContent value="returns">
              <CustomerReturns customerId={c.id} />
            </TabsContent>
            {can("payments.view") && (
              <TabsContent value="payments">
                <CustomerPayments customerId={c.id} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title="Details">
            <KeyValue
              items={[
                { label: "Phone", value: c.phone },
                { label: "Email", value: c.email },
                { label: "Address", value: c.address ? <span className="whitespace-pre-line">{c.address}</span> : null },
                { label: "Tax number", value: c.taxNumber, hideEmpty: true },
                { label: "Birthday", value: c.birthday ? formatDate(c.birthday, { month: "long", day: "numeric" }) : null, hideEmpty: true },
                { label: "Customer since", value: formatDate(c.createdAt) },
                { label: "Notes", value: c.notes ? <span className="whitespace-pre-line">{c.notes}</span> : null, hideEmpty: true },
              ]}
            />
          </SectionCard>
          <SectionCard title="Credit terms">
            <KeyValue
              layout="inline"
              items={[
                { label: "Sales on credit", value: c.allowCredit ? "Allowed" : "Not allowed" },
                { label: "Credit limit", value: c.creditLimit > 0 ? <Money value={c.creditLimit} /> : "No limit" },
                {
                  label: "Available credit",
                  value:
                    c.allowCredit && c.creditLimit > 0 ? <Money value={Math.max(0, c.creditLimit - c.dueBalance)} /> : c.allowCredit ? "Unlimited" : "—",
                },
                { label: "Price tier", value: c.priceTier === "wholesale" ? "Wholesale" : "Retail" },
              ]}
            />
          </SectionCard>
          {c.creditBalance > 0 && c.dueBalance > 0 && canPay && (
            <div className="rounded-2xl border border-highlight/40 bg-highlight-soft/50 p-4 text-[13px]">
              <p className="font-medium text-foreground">This customer has both credit and a balance due.</p>
              <p className="mt-1 text-muted-foreground">Apply the store credit to their open invoices to tidy up the account.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setApplyOpen(true)}>
                <Gift /> Apply <Money value={Math.min(c.creditBalance, c.dueBalance)} />
              </Button>
            </div>
          )}
        </div>
      </div>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={c} />
      <PartyPaymentDialog open={payOpen} onOpenChange={setPayOpen} kind="customer" partyId={c.id} partyName={c.name} balance={c.dueBalance} />
      <ApplyCreditDialog open={applyOpen} onOpenChange={setApplyOpen} kind="customer" partyId={c.id} credit={c.creditBalance} />
      <CreditRefundDialog open={refundOpen} onOpenChange={setRefundOpen} kind="customer" partyId={c.id} credit={c.creditBalance} />
    </>
  );
}

function toInput(c: Customer) {
  return {
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    taxNumber: c.taxNumber,
    type: c.type,
    priceTier: c.priceTier,
    allowCredit: c.allowCredit,
    creditLimit: c.creditLimit,
    birthday: c.birthday,
    notes: c.notes,
  };
}

function CustomerInvoices({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<Invoice>>("/sales", { customerId, page, pageSize: 10, kind: "all" });
  const columns: Column<Invoice>[] = [
    { key: "number", header: "Invoice", cell: (r) => <span className="font-mono text-[12.5px] font-medium">{r.number}</span> },
    { key: "date", header: "Date", cell: (r) => <span className="text-muted-foreground">{formatDate(r.date)}</span> },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        r.status === "void" ? <StatusBadge>Void</StatusBadge> : r.kind === "opening_balance" ? <Badge variant="outline">Opening</Badge> : <PaymentStatusBadge status={r.paymentStatus} />,
    },
    { key: "total", header: "Total", numeric: true, cell: (r) => <Money value={r.total} /> },
    { key: "due", header: "Due", numeric: true, cell: (r) => <Money value={r.status === "void" ? 0 : r.amountDue} dashZero /> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={data?.data}
      rowKey={(r) => r.id}
      loading={isLoading || isFetching}
      skeletonRows={5}
      onRowClick={(r) => router.push(`/sales/view?id=${r.id}`)}
      pagination={{ page, pageSize: 10, total: data?.total ?? 0, onPageChange: setPage }}
      empty={<EmptyState compact icon={Receipt} title="No invoices yet" />}
    />
  );
}

function CustomerReturns({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<SaleReturn>>("/returns", { customerId, page, pageSize: 10 });
  const columns: Column<SaleReturn>[] = [
    { key: "number", header: "Return", cell: (r) => <span className="font-mono text-[12.5px] font-medium">{r.number}</span> },
    { key: "inv", header: "Invoice", cell: (r) => <span className="font-mono text-[12.5px] text-muted-foreground">{r.invoiceNumber}</span> },
    { key: "date", header: "Date", hideBelow: "sm", cell: (r) => <span className="text-muted-foreground">{formatDate(r.date)}</span> },
    { key: "total", header: "Total", numeric: true, cell: (r) => <Money value={r.total} /> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={data?.data}
      rowKey={(r) => r.id}
      loading={isLoading || isFetching}
      skeletonRows={4}
      onRowClick={(r) => router.push(`/sales/returns/view?id=${r.id}`)}
      pagination={{ page, pageSize: 10, total: data?.total ?? 0, onPageChange: setPage }}
      empty={<EmptyState compact icon={RotateCcw} title="No returns" />}
    />
  );
}

function CustomerPayments({ customerId }: { customerId: string }) {
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<Payment>>("/payments", {
    partyType: "customer",
    partyId: customerId,
    page,
    pageSize: 10,
  });
  const columns: Column<Payment>[] = [
    { key: "number", header: "Payment", cell: (r) => <span className="font-mono text-[12.5px] font-medium">{r.number}</span> },
    { key: "date", header: "Date", cell: (r) => <span className="text-muted-foreground">{formatDate(r.date)}</span> },
    {
      key: "method",
      header: "Method",
      hideBelow: "sm",
      cell: (r) => (
        <span className={r.status === "void" ? "text-muted-foreground line-through" : undefined}>
          {r.methodName ?? TENDER_LABELS[r.tender]}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      cell: (r) => <Money value={r.direction === "in" ? r.amount : -r.amount} tone="signed" />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={data?.data}
      rowKey={(r) => r.id}
      loading={isLoading || isFetching}
      skeletonRows={4}
      pagination={{ page, pageSize: 10, total: data?.total ?? 0, onPageChange: setPage }}
      empty={<EmptyState compact icon={HandCoins} title="No payments yet" />}
    />
  );
}
