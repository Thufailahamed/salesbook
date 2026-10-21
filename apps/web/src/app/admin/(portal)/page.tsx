"use client";

import Link from "next/link";
import { CircleDollarSign, Clock, Store, Users } from "lucide-react";
import type { PlatformStats } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { SectionCard } from "@/components/section-card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { useApiQuery } from "@/hooks/use-api";
import { ORDER_STATE, SUB_STATE, lkr } from "@/lib/platform";
import { formatDate, relativeTime } from "@/lib/utils";

export default function AdminOverview() {
  const { data, isLoading } = useApiQuery<PlatformStats>("/platform/stats");
  return (
    <>
      <PageHeader title="Platform overview" description="Every shop on the system, and the money coming in from plan sales." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard variant="feature" label="Revenue (30 days)" icon={CircleDollarSign} loading={isLoading} value={lkr(data?.revenue.last30Days)} sublabel={`${lkr(data?.revenue.total)} all time · ${data?.revenue.orders ?? 0} orders`} />
        <StatCard label="Shops" icon={Store} loading={isLoading} value={data?.shops.total ?? 0} sublabel={`${data?.shops.newThisMonth ?? 0} new this month`} href="/admin/shops" />
        <StatCard label="Needs attention" icon={Clock} tone={data && data.shops.expired + data.shops.suspended > 0 ? "danger" : "neutral"} loading={isLoading} value={(data?.shops.expired ?? 0) + (data?.shops.suspended ?? 0)} sublabel={`${data?.shops.expired ?? 0} expired · ${data?.shops.suspended ?? 0} suspended`} href="/admin/shops?status=expired" />
        <StatCard label="Users" icon={Users} loading={isLoading} value={data?.users ?? 0} sublabel={`${data?.pendingOrders ?? 0} checkouts awaiting payment`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Newest shops" action={<Link className="text-[13px] font-medium text-primary hover:underline" href="/admin/shops">View all</Link>} flush>
          {data?.recentShops.length === 0 ? <EmptyState compact icon={Store} title="No shops yet" /> : (
            <ul className="divide-y divide-border">
              {data?.recentShops.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/shops/view?id=${s.id}`} className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-muted/40">
                    <span className="min-w-0"><span className="block truncate text-[14px] font-medium">{s.name}</span><span className="block truncate text-xs text-muted-foreground">{s.planName ?? "No plan"} · joined {relativeTime(s.createdAt)}</span></span>
                    <Badge variant={SUB_STATE[s.subscription.state].variant} dot>{SUB_STATE[s.subscription.state].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Recent payments" action={<Link className="text-[13px] font-medium text-primary hover:underline" href="/admin/orders">View all</Link>} flush>
          {data?.recentOrders.length === 0 ? <EmptyState compact icon={CircleDollarSign} title="No payments yet" /> : (
            <ul className="divide-y divide-border">
              {data?.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <span className="min-w-0"><span className="block truncate text-[14px] font-medium">{o.shopName}</span><span className="block truncate text-xs text-muted-foreground">{o.planName} · {o.kind} · {formatDate(o.createdAt)}</span></span>
                  <span className="flex items-center gap-3"><span className="num text-[14px] font-medium">{lkr(o.amount)}</span><Badge variant={ORDER_STATE[o.status].variant}>{ORDER_STATE[o.status].label}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
