"use client";

import * as React from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import type { AuditLog, Paginated } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, type DateRange } from "@/components/filters";
import { UserSelect } from "@/components/entity-selects";
import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useApiQuery } from "@/hooks/use-api";
import { docHref } from "@/lib/links";
import { formatDateTime, relativeTime } from "@/lib/utils";

const ENTITIES = ["invoice", "sale_return", "purchase", "purchase_return", "payment", "expense", "customer", "supplier", "product", "adjustment", "transfer", "shift", "journal", "user", "settings"];

export default function AuditPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [userId, setUserId] = React.useState<string | undefined>(undefined);
  const [entityType, setEntityType] = React.useState<string | undefined>(undefined);
  const { data, isLoading, isFetching } = useApiQuery<Paginated<AuditLog>>("/audit-logs", { page, pageSize: 50, q, ...range, userId, entityType });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const columns: Column<AuditLog>[] = [
    {
      key: "when",
      header: "When",
      cell: (a) => (
        <div className="whitespace-nowrap">
          <p>{relativeTime(a.createdAt)}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "user",
      header: "User",
      hideBelow: "sm",
      cell: (a) => (
        <span className="flex items-center gap-2">
          <Avatar name={a.userName} size="xs" />
          {a.userName ?? "System"}
        </span>
      ),
    },
    {
      key: "summary",
      header: "Activity",
      cell: (a) => {
        const href = docHref(a.entityType, a.entityId);
        return (
          <div className="min-w-0">
            {href ? <Link href={href} className="hover:underline">{a.summary}</Link> : a.summary}
          </div>
        );
      },
    },
    { key: "action", header: "Action", hideBelow: "md", cell: (a) => <Badge variant="outline" className="font-mono">{a.action}</Badge> },
  ];
  return (
    <>
      <PageHeader title="Audit log" description="A tamper-evident trail of who did what." />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search activity…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
            <UserSelect value={userId} onChange={reset(setUserId)} allowAll className="sm:w-44" />
            <FilterSelect value={entityType} onChange={reset(setEntityType)} allLabel="All records" options={ENTITIES.map((e) => ({ value: e, label: e.replace(/_/g, " ") }))} className="sm:w-40" />
          </>
        }
        pagination={{ page, pageSize: 50, total: data?.total ?? 0, onPageChange: setPage }}
        empty={<EmptyState icon={ScrollText} title="No activity" description="Actions across the system are recorded here." />}
      />
    </>
  );
}
