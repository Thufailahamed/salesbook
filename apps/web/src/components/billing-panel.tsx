"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BillingInfo, PurchaseResult } from "@shopbooks/shared";
import { SectionCard } from "@/components/section-card";
import { PageLoader } from "@/components/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { ORDER_STATE, SUB_STATE, lkr, periodLabel } from "@/lib/platform";
import { formatDate } from "@/lib/utils";

/** Current plan, expiry, and renew / switch-plan checkout via payments.lk. Also used on the "expired" lock screen. */
export function BillingPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const params = useSearchParams();
  const { data, refetch } = useApiQuery<BillingInfo>("/billing");
  const returned = params.get("order");

  // Back from payments.lk: the webhook may land a moment after the redirect.
  React.useEffect(() => {
    if (!returned) return;
    toast.success("Payment submitted — updating your subscription…");
    const refresh = () => { refetch(); qc.invalidateQueries({ queryKey: ["/auth/me"] }); };
    const timers = [2000, 5000, 10000, 20000].map((ms) => setTimeout(refresh, ms));
    return () => timers.forEach(clearTimeout);
  }, [returned, refetch, qc]);

  const renew = useApiMutation((planId: string) => api.post<PurchaseResult>("/billing/renew", { planId, returnOrigin: window.location.origin }), {
    onSuccess: (r) => { window.location.href = r.url; },
  });
  if (!data) return <PageLoader />;
  const sub = data.subscription;
  const st = SUB_STATE[sub.state];

  return (
    <div className="grid gap-6">
      <SectionCard title="Your subscription" action={<Badge variant={st.variant} dot>{st.label}</Badge>}>
        <p className="text-[14px]">
          {sub.planName ? <>You&apos;re on the <b>{sub.planName}</b> plan.</> : "Your shop isn't on a paid plan."}{" "}
          {sub.endsAt && (sub.state === "expired" ? <>It ended on <b>{formatDate(sub.endsAt)}</b>.</> : <>It runs until <b>{formatDate(sub.endsAt)}</b> ({sub.daysLeft} days left).</>)}
        </p>
      </SectionCard>
      {data.paymentEnabled && data.plans.length > 0 && (
        <SectionCard title={sub.state === "expired" ? "Renew to keep using ShopBooks" : "Renew or change plan"} description="Time you buy now is added to what you have left.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.plans.map((p) => (
              <div key={p.id} className="flex flex-col rounded-xl border border-border p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg font-semibold">{p.name}</span>
                  {p.id === sub.planId && <Badge variant="primary">Current</Badge>}
                </div>
                <p className="num mt-1 text-xl font-semibold">{lkr(p.priceCents)} <span className="text-xs font-normal text-muted-foreground">/ {periodLabel(p.periodDays)}</span></p>
                {p.description && <p className="mt-1 text-[13px] text-muted-foreground">{p.description}</p>}
                <p className="mt-2 mb-4 text-xs text-muted-foreground">{p.maxUsers || "Unlimited"} users · {p.maxLocations || "Unlimited"} locations</p>
                <Button className="mt-auto" disabled={!canManage} loading={renew.isPending && renew.variables === p.id} onClick={() => renew.mutate(p.id)}>
                  {p.id === sub.planId ? "Renew" : "Switch & pay"}
                </Button>
              </div>
            ))}
          </div>
          {!canManage && <p className="mt-3 text-[13px] text-muted-foreground">Ask the shop owner to renew.</p>}
        </SectionCard>
      )}
      {data.orders.length > 0 && (
        <SectionCard title="Payment history" flush>
          <ul className="divide-y divide-border">
            {data.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-6 py-3 text-[13px]">
                <span><span className="block font-medium">{o.planName} · {o.kind}</span><span className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</span></span>
                <span className="flex items-center gap-2"><span className="num">{lkr(o.amount)}</span><Badge variant={ORDER_STATE[o.status].variant}>{ORDER_STATE[o.status].label}</Badge></span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
void useSession;
