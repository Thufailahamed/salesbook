"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, Lock, Vault } from "lucide-react";
import type { Paginated, Shift } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, type DateRange } from "@/components/filters";
import { LocationSelect, UserSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { ShiftStatusBadge } from "@/components/status-badge";
import { CashMovementDialog, CloseShiftDialog, OpenShiftDialog } from "@/components/shift-dialogs";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/section-card";
import { useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";

export default function RegistersPage() {
  const router = useRouter();
  const { can, locationId } = useSession();
  const [page, setPage] = React.useState(1);
  const [range, setRange] = React.useState<DateRange>({});
  const [status, setStatus] = React.useState<string | undefined>(undefined);
  const [loc, setLoc] = React.useState<string | undefined>(undefined);
  const [userId, setUserId] = React.useState<string | undefined>(undefined);
  const [openDlg, setOpenDlg] = React.useState(false);
  const [closeDlg, setCloseDlg] = React.useState(false);
  const [moveDlg, setMoveDlg] = React.useState(false);
  const current = useApiQuery<{ shift: Shift | null }>("/shifts/current");
  const { data, isLoading, isFetching } = useApiQuery<Paginated<Shift>>("/shifts", {
    page, pageSize: 25, ...range, status, locationId: loc, userId,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const shift = current.data?.shift;

  const columns: Column<Shift>[] = [
    { key: "number", header: "Shift", cell: (s) => <span className="font-mono text-[12.5px] font-medium">{s.number}</span> },
    { key: "who", header: "Cashier", cell: (s) => s.userName },
    { key: "loc", header: "Location", hideBelow: "md", cell: (s) => <span className="text-muted-foreground">{s.locationName}</span> },
    { key: "opened", header: "Opened", hideBelow: "sm", cell: (s) => <span className="text-muted-foreground">{formatDateTime(s.openedAt)}</span> },
    { key: "status", header: "Status", cell: (s) => <ShiftStatusBadge status={s.status} /> },
    { key: "expected", header: "Expected", numeric: true, hideBelow: "lg", cell: (s) => <Money value={s.expectedCash} /> },
    {
      key: "diff",
      header: "Over / short",
      numeric: true,
      cell: (s) => (s.difference === null ? <span className="text-muted-foreground">—</span> : <Money value={s.difference} tone="signed" dashZero />),
    },
  ];

  return (
    <>
      <PageHeader title="Cash registers" description="Open a shift, track the drawer and close with a count." />
      {can("registers.use") && (
        <SectionCard className="mb-6">
          {shift ? (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-3">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                </span>
                <div>
                  <p className="font-medium">
                    Shift {shift.number} <span className="text-muted-foreground">· {shift.locationName}</span>
                  </p>
                  <p className="text-[13px] text-muted-foreground">Open since {formatTime(shift.openedAt)}</p>
                </div>
              </div>
              <div>
                <p className="label-caps">Expected cash</p>
                <p className="figure text-2xl"><Money value={shift.expectedCash} /></p>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setMoveDlg(true)}><Banknote /> Cash in / out</Button>
                <Button variant="outline" asChild>
                  <Link href={`/registers/view?id=${shift.id}`}>Details <ArrowRight /></Link>
                </Button>
                <Button onClick={() => setCloseDlg(true)}><Lock /> Close shift</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">No open shift</p>
                <p className="text-[13px] text-muted-foreground">Open one to start taking cash payments.</p>
              </div>
              <Button onClick={() => setOpenDlg(true)}><Vault /> Open shift</Button>
            </div>
          )}
        </SectionCard>
      )}
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/registers/view?id=${r.id}`)}
        toolbar={
          <>
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <LocationSelect value={loc} onChange={reset(setLoc)} allowAll className="sm:w-44" />
            {can("registers.viewAll") && <UserSelect value={userId} onChange={reset(setUserId)} allowAll allLabel="All cashiers" className="sm:w-44" />}
            <FilterSelect
              value={status}
              onChange={reset(setStatus)}
              allLabel="Any status"
              options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }]}
              className="sm:w-36"
            />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        empty={<EmptyState icon={Vault} title="No shifts yet" description="Shifts you open and close appear here with their over/short." />}
      />
      <OpenShiftDialog open={openDlg} onOpenChange={setOpenDlg} locationId={locationId} onOpened={(s) => router.push(`/registers/view?id=${s.id}`)} />
      {shift && <CashMovementDialog open={moveDlg} onOpenChange={setMoveDlg} shiftId={shift.id} />}
      {shift && <CloseShiftDialog open={closeDlg} onOpenChange={setCloseDlg} shift={shift} onClosed={(r) => router.push(`/registers/view?id=${r.id}`)} />}
    </>
  );
}
