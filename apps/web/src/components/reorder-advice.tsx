"use client";

import * as React from "react";
import { PackageCheck } from "lucide-react";
import type { ReorderAdvice } from "@shopbooks/shared";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatQty } from "@/lib/utils";

/** What to reorder, from sales over the last 30 days. Runs on demand and changes nothing. */
export function ReorderAdviceCard({ locationId }: { locationId?: string }) {
  const { can } = useSession();
  const advice = useApiMutation((loc: string | undefined) => api.post<ReorderAdvice>("/ai/reorder-advice", { locationId: loc }), {
    errorToast: true,
  });
  const result = advice.data;
  if (!can("reports.view")) return null;

  return (
    <SectionCard
      title="Reorder advice"
      icon={PackageCheck}
      description="Items with less than 14 days of stock left at their recent sales rate, plus stock with no sales in 30 days. Nothing is ordered automatically."
      action={
        <Button variant="outline" size="sm" loading={advice.isPending} onClick={() => advice.mutate(locationId)}>
          <PackageCheck /> Check stock
        </Button>
      }
    >
      {!result && !advice.isPending && <p className="text-sm text-muted-foreground">Check what needs ordering for this location.</p>}
      {result && (
        <>
          {result.summary && (
            <div className="mb-4 rounded-xl bg-muted/50 p-4 text-[14px] leading-relaxed whitespace-pre-line">{result.summary}</div>
          )}
          {result.items.length === 0 ? (
            <p className="text-sm">Nothing needs ordering right now.</p>
          ) : (
            <ul className="grid gap-2">
              {result.items.map((i) => (
                <li key={i.variantId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatQty(i.onHand)} on hand · sold {formatQty(i.soldLast30)} in 30 days
                      {i.daysLeft !== null ? ` · about ${i.daysLeft} days left` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm tabular-nums">Order {formatQty(i.suggestedQty)}</span>
                    <Badge variant={i.status === "out" ? "danger" : "warning"}>{i.status === "out" ? "Out of stock" : "Low"}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {result.totalFlagged > result.items.length && (
            <p className="mt-3 text-xs text-muted-foreground">Showing {result.items.length} of {result.totalFlagged} items.</p>
          )}
          {result.deadStock.count > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {result.deadStock.count} item{result.deadStock.count === 1 ? "" : "s"} with stock and no sales in 30 days.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}
