"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { PublicOrderStatus } from "@shopbooks/shared";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/loading";
import { usePageTitle } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api";

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <Complete />
    </React.Suspense>
  );
}

/** Landing page after the payments.lk checkout. The shop is created by the webhook, so poll until the order is paid. */
function Complete() {
  usePageTitle("Finishing your order");
  const order = useSearchParams().get("order");
  const { data } = useApiQuery<PublicOrderStatus>(order ? `/public/orders/${order}` : null, undefined, {
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "pending" ? false : 2000),
  });
  const status = data?.status ?? "pending";
  const view =
    status === "paid"
      ? { Icon: CheckCircle2, tone: "text-success", title: "Payment received — your shop is ready", text: "Sign in with the email and password you chose to start setting up your products.", cta: "Sign in" }
      : status === "pending"
        ? { Icon: Clock, tone: "text-warning", title: "Confirming your payment…", text: "This usually takes a few seconds. Keep this page open — we'll update it as soon as payments.lk confirms.", cta: null }
        : { Icon: XCircle, tone: "text-destructive", title: status === "expired" ? "Checkout expired" : "Payment didn't go through", text: data?.failureMessage ?? "You haven't been charged for a shop. You can try again.", cta: "Try again" };
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[420px] text-center">
        <view.Icon className={`mx-auto mb-5 size-14 ${view.tone}`} strokeWidth={1.5} />
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">{view.title}</h1>
        <p className="mt-2 mb-6 text-[14px] text-muted-foreground">{order ? view.text : "No order selected."}</p>
        {view.cta && (
          <Button asChild size="lg"><Link href={status === "paid" ? "/login" : "/signup"}>{view.cta}</Link></Button>
        )}
      </div>
    </div>
  );
}
