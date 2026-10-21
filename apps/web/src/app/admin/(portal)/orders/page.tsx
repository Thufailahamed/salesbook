"use client";

import * as React from "react";
import Link from "next/link";
import { Receipt, Search } from "lucide-react";
import type { Paginated, PlatformOrder } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiQuery } from "@/hooks/use-api";
import { useDebounce } from "@/hooks/use-debounce";
import { ORDER_STATE, lkr } from "@/lib/platform";
import { formatDateTime } from "@/lib/utils";

export default function OrdersPage() {
  const [status, setStatus] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const dq = useDebounce(q);
  React.useEffect(() => setPage(1), [dq, status]);
  const { data, isLoading } = useApiQuery<Paginated<PlatformOrder>>("/platform/orders", { q: dq, status: status === "all" ? undefined : status, page, pageSize: 25 });
  const columns: Column<PlatformOrder>[] = [
    { key: "d", header: "Date", cell: (o) => <span className="text-[13px]">{formatDateTime(o.createdAt)}</span> },
    { key: "s", header: "Shop", cell: (o) => (o.businessId ? <Link className="font-medium hover:underline" href={`/admin/shops/view?id=${o.businessId}`}>{o.shopName}</Link> : <span className="font-medium">{o.shopName}</span>) },
    { key: "e", header: "Email", hideBelow: "md", cell: (o) => <span className="text-[13px] text-muted-foreground">{o.email}</span> },
    { key: "p", header: "Plan", hideBelow: "sm", cell: (o) => <span>{o.planName} <span className="text-xs text-muted-foreground">· {o.kind}</span></span> },
    { key: "a", header: "Amount", numeric: true, cell: (o) => lkr(o.amount) },
    { key: "st", header: "Status", cell: (o) => <span className="grid gap-0.5"><Badge variant={ORDER_STATE[o.status].variant}>{ORDER_STATE[o.status].label}</Badge>{o.failureMessage && <span className="max-w-56 truncate text-xs text-destructive" title={o.failureMessage}>{o.failureMessage}</span>}</span> },
  ];
  return (
    <>
      <PageHeader title="Payments" description="Plan purchases and renewals paid through payments.lk." />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading}
        pagination={data ? { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: setPage } : undefined}
        toolbar={
          <div className="flex w-full flex-wrap gap-2">
            <Input icon={<Search />} placeholder="Search shop or email…" value={q} onChange={(e) => setQ(e.target.value)} wrapperClassName="w-full sm:w-72" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(["paid", "pending", "failed", "expired"] as const).map((s) => <SelectItem key={s} value={s}>{ORDER_STATE[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
        empty={<EmptyState icon={Receipt} title="No payments yet" />}
      />
    </>
  );
}
