"use client";

import { Sparkles, TrendingDown } from "lucide-react";
import type { CashForecast } from "@shopbooks/shared";
import { ReportSection } from "@/components/report-shell";
import { Money } from "@/components/money";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { formatDate } from "@/lib/utils";

/** Four-week cash forecast from open invoices and bills by due date, plus typical sales and spending. */
export function CashForecastCard() {
  const forecast = useApiQuery<CashForecast>("/reports/cash-forecast");
  const f = forecast.data;

  return (
    <ReportSection
      title="Next four weeks"
      description="From open invoices and bills by due date, plus typical sales and spending. Overdue items land in week 1."
      flush
    >
      {forecast.isLoading || !f ? (
        <div className="space-y-3 p-6">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-5 w-4/6" />
        </div>
      ) : (
        <div className="grid gap-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <p className="eyebrow">Cash and bank today</p>
              <p className="font-display mt-2 text-2xl font-semibold tabular-nums">
                <Money value={f.openingCash} />
              </p>
            </div>
            <div className="rounded-2xl border p-4">
              <p className="eyebrow flex items-center gap-1.5">
                <TrendingDown className="size-3.5" /> Lowest point
              </p>
              <p
                className={`font-display mt-2 text-2xl font-semibold tabular-nums ${f.lowest.amount < 0 ? "text-destructive" : ""}`}
              >
                <Money value={f.lowest.amount} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Week of {formatDate(f.lowest.from)}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Week</TableHead>
                  <TableHead align="right">Money in</TableHead>
                  <TableHead align="right">Money out</TableHead>
                  <TableHead align="right">Cash at end</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {f.weeks.map((w, i) => (
                  <TableRow key={w.from}>
                    <TableCell className="text-muted-foreground">
                      Week {i + 1} · {formatDate(w.from)} – {formatDate(w.to)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      <Money value={w.collections + w.salesReceipts} />
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      <Money value={w.bills + w.expenses} />
                    </TableCell>
                    <TableCell align="right" className={`tabular-nums font-medium ${w.endingCash < 0 ? "text-destructive" : ""}`}>
                      <Money value={w.endingCash} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {f.summary && (
            <div className="flex gap-3 rounded-2xl bg-muted/50 p-4">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-foreground/90">{f.summary}</p>
            </div>
          )}
        </div>
      )}
    </ReportSection>
  );
}
