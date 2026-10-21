"use client";

import * as React from "react";
import { CalendarClock, PackageX, Timer } from "lucide-react";
import type { ExpiryReport } from "@shopbooks/shared";
import { ReportPage } from "@/components/report-shell";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { FilterSelect } from "@/components/filters";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";
import { formatDate, formatQty } from "@/lib/utils";

const WINDOWS = [
  { value: "7", label: "Next 7 days" },
  { value: "30", label: "Next 30 days" },
  { value: "60", label: "Next 60 days" },
  { value: "90", label: "Next 90 days" },
];

export default function ExpiryReportPage() {
  const money = useMoney();
  const [days, setDays] = React.useState("30");
  return (
    <ReportPage<ExpiryReport>
      path="/reports/expiry"
      title="Expiry & shelf life"
      description="Stock that has passed its date or is about to. Write expired stock off before it is sold."
      controls={{ location: true }}
      extraQuery={{ days: Number(days) }}
      csv={(r) => [
        ["Item", "SKU", "Location", "Expiry date", "Days left", "Qty", "Value", "Status"],
        ...r.rows.map((x) => [x.displayName, x.sku, x.locationName, x.expiryDate, x.daysLeft, x.quantity, money.toMajor(x.value), x.status]),
      ]}
      actions={<FilterSelect value={days} onChange={(v) => setDays(v ?? "30")} required options={WINDOWS} className="sm:w-40" />}
    >
      {(r) => (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard variant="feature" label="Already expired" value={money.format(r.expiredValue)} icon={PackageX} sublabel={`${r.expiredCount} batch${r.expiredCount === 1 ? "" : "es"} to write off`} />
            <StatCard label={`Expiring in ${r.days} days`} value={money.format(r.expiringValue)} icon={Timer} tone="warning" sublabel={`${r.expiringCount} batch${r.expiringCount === 1 ? "" : "es"}`} />
            <StatCard label="As of" value={formatDate(r.asOf)} icon={CalendarClock} tone="info" />
          </div>
          <SectionCard title="Batches" flush>
            {r.rows.length === 0 ? (
              <EmptyState compact title="Nothing expiring" description={`No stock with an expiry date within ${r.days} days.`} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead align="right">Qty</TableHead>
                    <TableHead align="right">Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.rows.map((x) => (
                    <TableRow key={`${x.variantId}|${x.locationId}|${x.expiryDate}`} className="hover:bg-transparent">
                      <TableCell>
                        <span className="font-medium">{x.displayName}</span>
                        <p className="font-mono text-[11.5px] text-muted-foreground">{x.sku ?? ""}</p>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{x.locationName}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(x.expiryDate)}</TableCell>
                      <TableCell numeric>{formatQty(x.quantity)}</TableCell>
                      <TableCell numeric><Money value={x.value} /></TableCell>
                      <TableCell>
                        {x.status === "expired" ? (
                          <StatusBadge variant="danger">Expired {Math.abs(x.daysLeft)}d ago</StatusBadge>
                        ) : (
                          <StatusBadge variant="warning">{x.daysLeft === 0 ? "Today" : `${x.daysLeft} days left`}</StatusBadge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>
      )}
    </ReportPage>
  );
}
