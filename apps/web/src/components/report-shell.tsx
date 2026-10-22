"use client";

import * as React from "react";
import { Download, Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker, presetRange, useBusinessToday, type DateRange } from "@/components/filters";
import { LocationSelect } from "@/components/entity-selects";
import { ErrorState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { cn, downloadFile, toCSV } from "@/lib/utils";

/**
 * Panel used by every report body: borderless soft card, display title, optional footer.
 * `flush` removes body padding for tables that run edge to edge.
 */
export function ReportSection({
  title,
  description,
  action,
  flush,
  footer,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  flush?: boolean;
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const hasHeader = title || description || action;
  return (
    <section className={cn("overflow-hidden rounded-3xl bg-card shadow-card", className)}>
      {hasHeader && (
        <header className={cn("flex items-start justify-between gap-4 px-6 pt-5", flush ? "border-b border-border/60 pb-4" : "pb-4")}>
          <div className="min-w-0">
            {title && <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn(!flush && "px-6 pb-6")}>{children}</div>
      {footer && <footer className="border-t border-border/60 bg-muted/35 px-6 py-4">{footer}</footer>}
    </section>
  );
}

export interface ReportControls {
  /** Period range (from/to) */
  range?: boolean;
  /** Single "as of" date */
  asOf?: boolean;
  location?: boolean;
  /** Default preset key for the range (see DATE_PRESETS) */
  preset?: string;
}

/**
 * Standard report page: header with period / as-of / location controls, loading + error states, print and CSV.
 *   <ReportPage<ProfitLossReport> path="/reports/profit-loss" title="Profit & loss" controls={{ range: true, location: true }}
 *      csv={(r) => [["Account","Amount"], …]}>{(r) => …}</ReportPage>
 */
export function ReportPage<T>({
  path,
  title,
  description,
  controls,
  extraQuery,
  csv,
  csvName,
  children,
  actions,
}: {
  path: string;
  title: string;
  description?: string;
  controls: ReportControls;
  extraQuery?: Record<string, string | number | undefined>;
  csv?: (data: T) => (string | number | null | undefined)[][];
  csvName?: string;
  children: (data: T, ctx: { from?: string; to?: string; asOf?: string }) => React.ReactNode;
  actions?: React.ReactNode;
}) {
  const today = useBusinessToday();
  const { activeLocations } = useSession();
  const [range, setRange] = React.useState<DateRange>(() => presetRange(controls.preset ?? "month", today));
  const [asOf, setAsOf] = React.useState(today);
  const [locationId, setLocationId] = React.useState<string | undefined>(undefined);
  const query = {
    ...(controls.range ? { from: range.from, to: range.to } : {}),
    ...(controls.asOf ? { asOf } : {}),
    ...(controls.location ? { locationId } : {}),
    ...extraQuery,
  };
  const { data, isLoading, error, refetch } = useApiQuery<T>(path, query);

  return (
    <>
      <PageHeader
        backHref="/reports"
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: title }]}
        title={title}
        description={description}
        actions={
          <>
            {actions}
            {csv && data && (
              <Button variant="outline" onClick={() => downloadFile(`${csvName ?? title.toLowerCase().replace(/\W+/g, "-")}.csv`, toCSV(csv(data)))}>
                <Download /> <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()} className="no-print">
              <Printer /> <span className="hidden sm:inline">Print</span>
            </Button>
          </>
        }
      >
        <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl bg-card p-2 shadow-card">
          {controls.range && <DateRangePicker value={range} onChange={(r) => setRange(r.from ? r : presetRange("month", today))} allowAll={false} />}
          {controls.asOf && (
            <label className="flex items-center gap-2 pl-2 text-[13px] text-muted-foreground">
              <span className="label-caps">As of</span>
              <Input type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value || today)} className="w-40" />
            </label>
          )}
          {controls.location && activeLocations.length > 1 && <LocationSelect value={locationId} onChange={setLocationId} allowAll className="w-48" />}
        </div>
      </PageHeader>
      {error && !data ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-3xl" />
        </div>
      ) : (
        children(data, { from: range.from, to: range.to, asOf })
      )}
    </>
  );
}
