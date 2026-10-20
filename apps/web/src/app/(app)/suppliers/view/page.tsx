"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, MoreHorizontal, PackageMinus, Pencil, RotateCcw, ShoppingBag, Wallet, WalletCards } from "lucide-react";
import type { Paginated, Purchase, PurchaseReturn, Supplier } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { StatCard } from "@/components/stat-card";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { ActiveBadge, PaymentStatusBadge, PurchaseStatusBadge } from "@/components/status-badge";
import { StatementCard } from "@/components/statement-card";
import { useConfirm } from "@/components/confirm-dialog";
import { ApplyCreditDialog, CreditRefundDialog, PartyPaymentDialog, SupplierFormDialog } from "@/components/party-dialogs";
import { Avatar } from "@/components/ui/avatar";
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
import { formatDate, relativeTime } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <SupplierView />
    </React.Suspense>
  );
}

function SupplierView() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const confirm = useConfirm();
  const money = useMoney();
  const { can } = useSession();
  const { data: s, isLoading, error, refetch } = useApiQuery<Supplier>(id ? `/suppliers/${id}` : null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);

  const setActive = useApiMutation(
    (active: boolean) =>
      active
        ? api.put<Supplier>(`/suppliers/${id}`, {
            name: s!.name,
            contactName: s!.contactName,
            phone: s!.phone,
            email: s!.email,
            address: s!.address,
            taxNumber: s!.taxNumber,
            paymentTermsDays: s!.paymentTermsDays,
            notes: s!.notes,
            isActive: true,
          })
        : api.del(`/suppliers/${id}`),
    {
      invalidate: ["/suppliers"],
      success: (_, active) => (active ? "Supplier restored" : "Supplier archived"),
      onSuccess: (_, active) => {
        if (!active) router.push("/suppliers");
      },
    },
  );

  if (!id) return <ErrorState message="No supplier selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !s) return <ErrorState message={error?.message ?? "Supplier not found"} onRetry={() => refetch()} />;

  const canManage = can("suppliers.manage");

  return (
    <>
      <PageHeader
        backHref="/suppliers"
        breadcrumbs={[{ label: "Suppliers", href: "/suppliers" }, { label: s.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={s.name} size="lg" square />
            {s.name}
          </span>
        }
        badge={!s.isActive ? <ActiveBadge active={false} /> : undefined}
        description={[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "No contact details"}
        actions={
          <>
            {can("purchases.manage") && s.isActive && (
              <Button variant="outline" asChild>
                <Link href={`/purchases/new?supplierId=${s.id}`}>
                  <ShoppingBag /> New purchase
                </Link>
              </Button>
            )}
            {canManage && s.dueBalance > 0 && (
              <Button onClick={() => setPayOpen(true)}>
                <Wallet /> Pay supplier
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {canManage && (
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil /> Edit supplier
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem onSelect={() => setPayOpen(true)}>
                    <Wallet /> Pay in advance
                  </DropdownMenuItem>
                )}
                {canManage && s.creditBalance > 0 && s.dueBalance > 0 && (
                  <DropdownMenuItem onSelect={() => setApplyOpen(true)}>
                    <WalletCards /> Apply supplier credit
                  </DropdownMenuItem>
                )}
                {canManage && s.creditBalance > 0 && (
                  <DropdownMenuItem onSelect={() => setRefundOpen(true)}>
                    <RotateCcw /> Receive refund
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuSeparator />
                    {s.isActive ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={async () => {
                          const ok = await confirm({
                            title: `Archive ${s.name}?`,
                            description: "Archived suppliers are hidden from pickers. Their history is kept.",
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

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard
          label="You owe"
          value={<span className={s.dueBalance > 0 ? "text-destructive" : undefined}>{money.format(s.dueBalance)}</span>}
          icon={Wallet}
          tone={s.dueBalance > 0 ? "danger" : "neutral"}
          sublabel={s.paymentTermsDays ? `terms: net ${s.paymentTermsDays} days` : "terms: on receipt"}
        />
        <StatCard label="Credit with supplier" value={money.format(s.creditBalance)} icon={WalletCards} tone="success" sublabel="advances & returns" />
        <StatCard
          label="Total purchased"
          value={money.format(s.totalPurchased)}
          icon={ShoppingBag}
          tone="info"
          sublabel={s.lastPurchaseAt ? `last ${relativeTime(s.lastPurchaseAt)}` : "no purchases yet"}
          className="col-span-2 xl:col-span-1"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Tabs defaultValue="purchases" variant="underline">
            <TabsList>
              <TabsTrigger value="purchases">Purchases</TabsTrigger>
              <TabsTrigger value="statement">Statement</TabsTrigger>
              <TabsTrigger value="returns">Returns</TabsTrigger>
            </TabsList>
            <TabsContent value="purchases">
              <SupplierPurchases supplierId={s.id} />
            </TabsContent>
            <TabsContent value="statement">
              <StatementCard kind="supplier" partyId={s.id} />
            </TabsContent>
            <TabsContent value="returns">
              <SupplierReturns supplierId={s.id} />
            </TabsContent>
          </Tabs>
        </div>
        <div className="grid content-start gap-6">
          <SectionCard title="Details">
            <KeyValue
              items={[
                { label: "Contact person", value: s.contactName },
                { label: "Phone", value: s.phone },
                { label: "Email", value: s.email },
                { label: "Address", value: s.address ? <span className="whitespace-pre-line">{s.address}</span> : null },
                { label: "Tax number", value: s.taxNumber, hideEmpty: true },
                { label: "Payment terms", value: s.paymentTermsDays ? `Net ${s.paymentTermsDays} days` : "Due on receipt" },
                { label: "Supplier since", value: formatDate(s.createdAt) },
                { label: "Notes", value: s.notes ? <span className="whitespace-pre-line">{s.notes}</span> : null, hideEmpty: true },
              ]}
            />
          </SectionCard>
        </div>
      </div>

      <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} supplier={s} />
      <PartyPaymentDialog open={payOpen} onOpenChange={setPayOpen} kind="supplier" partyId={s.id} partyName={s.name} balance={s.dueBalance} />
      <ApplyCreditDialog open={applyOpen} onOpenChange={setApplyOpen} kind="supplier" partyId={s.id} credit={s.creditBalance} />
      <CreditRefundDialog open={refundOpen} onOpenChange={setRefundOpen} kind="supplier" partyId={s.id} credit={s.creditBalance} />
    </>
  );
}

function SupplierPurchases({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<Purchase>>("/purchases", { supplierId, page, pageSize: 10 });
  const columns: Column<Purchase>[] = [
    { key: "number", header: "Purchase", cell: (r) => <span className="font-mono text-[12.5px] font-medium">{r.number}</span> },
    { key: "date", header: "Date", cell: (r) => <span className="text-muted-foreground">{formatDate(r.receivedDate ?? r.orderDate)}</span> },
    {
      key: "status",
      header: "Status",
      cell: (r) => (r.status === "received" ? <PaymentStatusBadge status={r.paymentStatus} /> : <PurchaseStatusBadge status={r.status} />),
    },
    { key: "total", header: "Total", numeric: true, cell: (r) => <Money value={r.total} /> },
    { key: "due", header: "Due", numeric: true, cell: (r) => <Money value={r.status === "received" ? r.amountDue : 0} dashZero /> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={data?.data}
      rowKey={(r) => r.id}
      loading={isLoading || isFetching}
      skeletonRows={5}
      onRowClick={(r) => router.push(`/purchases/view?id=${r.id}`)}
      pagination={{ page, pageSize: 10, total: data?.total ?? 0, onPageChange: setPage }}
      empty={<EmptyState compact icon={ShoppingBag} title="No purchases yet" />}
    />
  );
}

function SupplierReturns({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<PurchaseReturn>>("/purchase-returns", { supplierId, page, pageSize: 10 });
  const columns: Column<PurchaseReturn>[] = [
    { key: "number", header: "Debit note", cell: (r) => <span className="font-mono text-[12.5px] font-medium">{r.number}</span> },
    { key: "po", header: "Purchase", cell: (r) => <span className="font-mono text-[12.5px] text-muted-foreground">{r.purchaseNumber}</span> },
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
      onRowClick={(r) => router.push(`/purchases/returns/view?id=${r.id}`)}
      pagination={{ page, pageSize: 10, total: data?.total ?? 0, onPageChange: setPage }}
      empty={<EmptyState compact icon={PackageMinus} title="No purchase returns" />}
    />
  );
}
