"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Banknote, Lock, Printer } from "lucide-react";
import type { ShiftReport } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { StatCard } from "@/components/stat-card";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { Money } from "@/components/money";
import { ShiftStatusBadge } from "@/components/status-badge";
import { CashMovementDialog, CloseShiftDialog } from "@/components/shift-dialogs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { formatDateTime, formatNumber, formatTime } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <ShiftView />
    </React.Suspense>
  );
}

function ShiftView() {
  const id = useSearchParams().get("id");
  const money = useMoney();
  const { user, can } = useSession();
  const { data: s, isLoading, error, refetch } = useApiQuery<ShiftReport>(id ? `/shifts/${id}` : null);
  const [closeDlg, setCloseDlg] = React.useState(false);
  const [moveDlg, setMoveDlg] = React.useState(false);
  if (!id) return <ErrorState message="No shift selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !s) return <ErrorState message={error?.message ?? "Shift not found"} onRetry={() => refetch()} />;

  const open = s.status === "open";
  const mine = s.userId === user.id || can("registers.viewAll");
  return (
    <>
      <PageHeader
        backHref="/registers"
        breadcrumbs={[{ label: "Registers", href: "/registers" }, { label: s.number }]}
        eyebrow={open ? "X-report" : "Z-report"}
        title={<span className="font-mono tracking-tight">{s.number}</span>}
        badge={<ShiftStatusBadge status={s.status} />}
        description={`${s.userName} · ${s.locationName} · ${formatDateTime(s.openedAt)}${s.closedAt ? ` → ${formatTime(s.closedAt)}` : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.open(`/print/shift?id=${s.id}&autoprint=1`, "_blank")}>
              <Printer /> Print
            </Button>
            {open && mine && (
              <>
                <Button variant="outline" onClick={() => setMoveDlg(true)}><Banknote /> Cash in / out</Button>
                <Button onClick={() => setCloseDlg(true)}><Lock /> Close shift</Button>
              </>
            )}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Sales" value={money.format(s.salesTotal)} sublabel={`${formatNumber(s.invoiceCount)} invoices`} />
        <StatCard label="Returns" value={money.format(s.returnsTotal)} tone="warning" sublabel={`${formatNumber(s.returnsCount)} returns`} />
        <StatCard label="Expected cash" value={money.format(s.expectedCash)} tone="info" />
        <StatCard
          label={s.difference === null ? "Counted" : s.difference >= 0 ? "Over" : "Short"}
          value={s.difference === null ? "—" : <span className={s.difference < 0 ? "text-destructive" : undefined}>{money.format(s.difference)}</span>}
          tone={s.difference && s.difference < 0 ? "danger" : "success"}
          sublabel={s.countedCash !== null ? `counted ${money.format(s.countedCash)}` : "shift still open"}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
          <SectionCard title="By payment method" flush>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Method</TableHead>
                  <TableHead align="right">Collected</TableHead>
                  <TableHead align="right">Refunded</TableHead>
                  <TableHead align="right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.byMethod.map((m) => (
                  <TableRow key={`${m.methodId}-${m.name}`} className="hover:bg-transparent">
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell numeric><Money value={m.collected} /></TableCell>
                    <TableCell numeric><Money value={m.refunded} dashZero /></TableCell>
                    <TableCell numeric className="font-medium"><Money value={m.collected - m.refunded} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
          <SectionCard title="Cash in / out" flush>
            {s.movements.length === 0 ? (
              <p className="px-6 py-5 text-[13px] text-muted-foreground">No pay-ins or pay-outs.</p>
            ) : (
              <Table>
                <TableBody>
                  {s.movements.map((m) => (
                    <TableRow key={m.id} className="hover:bg-transparent">
                      <TableCell>
                        <p className="font-medium">{m.reason}</p>
                        <p className="text-xs text-muted-foreground">{[m.accountName, m.userName, formatTime(m.createdAt)].filter(Boolean).join(" · ")}</p>
                      </TableCell>
                      <TableCell numeric><Money value={m.type === "pay_in" ? m.amount : -m.amount} tone="signed" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>
        <SectionCard title="Cash drawer" className="self-start">
          <KeyValue
            layout="inline"
            items={[
              { label: "Opening float", value: <Money value={s.openingFloat} /> },
              { label: "Cash sales", value: <Money value={s.cashSales} /> },
              { label: "Cash refunds", value: <Money value={-s.cashRefunds} dashZero /> },
              { label: "Pay-ins", value: <Money value={s.payIns} dashZero /> },
              { label: "Pay-outs", value: <Money value={-s.payOuts} dashZero /> },
              { label: "Expected", value: <Money value={s.expectedCash} className="font-semibold" /> },
              ...(s.countedCash !== null ? [{ label: "Counted", value: <Money value={s.countedCash} /> }] : []),
              { label: "Discounts given", value: <Money value={s.discountTotal} dashZero /> },
              { label: "Tax collected", value: <Money value={s.taxTotal} /> },
            ]}
          />
          {(s.note || s.closingNote) && (
            <p className="mt-4 text-[13px] text-muted-foreground">{[s.note, s.closingNote].filter(Boolean).join(" · ")}</p>
          )}
        </SectionCard>
      </div>
      {open && mine && (
        <>
          <CashMovementDialog open={moveDlg} onOpenChange={setMoveDlg} shiftId={s.id} />
          <CloseShiftDialog open={closeDlg} onOpenChange={setCloseDlg} shift={s} />
        </>
      )}
    </>
  );
}
