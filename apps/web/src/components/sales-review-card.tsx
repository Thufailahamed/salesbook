"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { SalesReview } from "@shopbooks/shared";
import { ReportSection } from "@/components/report-shell";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api";

/** Voids, refunds, big discounts and sales below cost for the period shown above. Rules only, nothing is changed. */
export function SalesReviewCard({ from, to }: { from: string; to: string }) {
  const review = useApiQuery<SalesReview>("/reports/sales-review", { from, to });
  const r = review.data;

  return (
    <ReportSection title="Sales to review" description="Voids, refunds, big discounts and sales below cost in this period." flush>
      {review.isLoading || !r ? (
        <div className="space-y-3 p-6">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
        </div>
      ) : (
        <div className="grid gap-4 p-6">
          {r.flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to review in this period.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border">
              {r.flags.map((f, i) => (
                <li key={`${f.kind}-${i}`}>
                  <Link href={f.href} className="flex items-start gap-4 px-4 py-3 transition-colors hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{f.title}</p>
                        <Badge variant={f.severity === "review" ? "danger" : "outline"}>
                          {f.severity === "review" ? "Review" : "Note"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{f.detail}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {r.summary && (
            <div className="flex gap-3 rounded-2xl bg-muted/50 p-4">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-foreground/90">{r.summary}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {r.invoices} sales · <Money value={r.netSales} /> net
          </p>
        </div>
      )}
    </ReportSection>
  );
}
