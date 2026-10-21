"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Store } from "lucide-react";
import type { Paginated, PlatformShop } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageLoader } from "@/components/loading";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiQuery } from "@/hooks/use-api";
import { useDebounce } from "@/hooks/use-debounce";
import { SUB_STATE } from "@/lib/platform";
import { formatDate } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <Shops />
    </React.Suspense>
  );
}

function Shops() {
  const router = useRouter();
  const [status, setStatus] = React.useState(useSearchParams().get("status") ?? "all");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const dq = useDebounce(q);
  React.useEffect(() => setPage(1), [dq, status]);
  const { data, isLoading } = useApiQuery<Paginated<PlatformShop>>("/platform/shops", { q: dq, status: status === "all" ? undefined : status, page, pageSize: 25 });

  const columns: Column<PlatformShop>[] = [
    { key: "n", header: "Shop", cell: (s) => <span className="block"><span className="block font-medium">{s.name}</span><span className="block text-xs text-muted-foreground">{s.email ?? "—"}</span></span> },
    { key: "p", header: "Plan", hideBelow: "sm", cell: (s) => s.planName ?? <span className="text-muted-foreground">No plan</span> },
    { key: "s", header: "Status", cell: (s) => <Badge variant={SUB_STATE[s.subscription.state].variant} dot>{SUB_STATE[s.subscription.state].label}</Badge> },
    { key: "e", header: "Renews / ends", hideBelow: "md", cell: (s) => (s.subscriptionEndsAt ? formatDate(s.subscriptionEndsAt) : "—") },
    { key: "u", header: "Users", numeric: true, hideBelow: "md", cell: (s) => s.userCount },
    { key: "c", header: "Joined", hideBelow: "lg", cell: (s) => formatDate(s.createdAt) },
  ];
  return (
    <>
      <PageHeader title="Shops" description="Every business using the system." />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => router.push(`/admin/shops/view?id=${r.id}`)}
        pagination={data ? { page: data.page, pageSize: data.pageSize, total: data.total, onPageChange: setPage } : undefined}
        toolbar={
          <div className="flex w-full flex-wrap gap-2">
            <Input icon={<Search />} placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} wrapperClassName="w-full sm:w-72" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shops</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        empty={<EmptyState icon={Store} title="No shops found" />}
      />
    </>
  );
}
