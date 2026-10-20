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
import { downloadFile, toCSV } from "@/lib/utils";

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
        <div className="no-print flex flex-wrap items-center gap-2">
          {controls.range && <DateRangePicker value={range} onChange={(r) => setRange(r.from ? r : presetRange("month", today))} allowAll={false} />}
          {controls.asOf && (
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              As of
              <Input type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value || today)} className="w-40" />
            </label>
          )}
          {controls.location && activeLocations.length > 1 && <LocationSelect value={locationId} onChange={setLocationId} allowAll className="w-48" />}
        </div>
      </PageHeader>
      {error && !data ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="grid gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : (
        children(data, { from: range.from, to: range.to, asOf })
      )}
    </>
  );
}
