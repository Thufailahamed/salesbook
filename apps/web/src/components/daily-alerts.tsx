"use client";

import Link from "next/link";
import { ArrowRight, BellRing, CircleCheck } from "lucide-react";
import type { DailyAlert } from "@shopbooks/shared";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api";
import { cn } from "@/lib/utils";

/** What needs attention today: overdue money, bills due soon and low stock. Rules only, nothing is changed here. */
export function DailyAlerts() {
  const alerts = useApiQuery<DailyAlert[]>("/alerts");

  return (
    <SectionCard title="Needs attention" icon={BellRing} description="From the books as of today." flush>
      {alerts.isLoading || !alerts.data ? (
        <div className="space-y-3 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : alerts.data.length === 0 ? (
        <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <CircleCheck className="size-5 text-success" /> Nothing needs attention today.
        </div>
      ) : (
        <ul className="divide-y">
          {alerts.data.map((a) => (
            <li key={a.kind}>
              <Link href={a.href} className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50">
                <span
                  className={cn("size-2.5 shrink-0 rounded-full", a.severity === "urgent" ? "bg-destructive" : "bg-warning")}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    <Badge variant={a.severity === "urgent" ? "danger" : "outline"}>
                      {a.severity === "urgent" ? "Overdue" : "Soon"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{a.detail}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
