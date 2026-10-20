"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageMinus, Plus } from "lucide-react";
import type { Paginated, PurchaseReturn } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, SearchInput, type DateRange } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { formatDate } from "@/lib/utils";

type ReturnList = Paginated<PurchaseReturn> & { totals: { total: number } };

export default function PurchaseReturnsPage() {
  const router = useRouter();
  const { can } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const { data, isLoading, isFetching } = useApiQuery<ReturnList>("/purchase-returns", { page, pageSize: 25, q, ...range });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const columns: Column<PurchaseReturn>[] = [
    { key: "number", header: "Debit note", cell: (r) => <span className="font-mono text-[12.5px] font-medium">{r.number}</span> },
    { key: "date", header: "Date", hideBelow: "sm", cell: (r) => <span className="text-muted-foreground">{formatDate(r.date)}</span> },
    { key: "supplier", header: "Supplier", cell: (r) => r.supplierName },
    { key: "po", header: "Purchase", hideBelow: "md", cell: (r) => <span className="font-mono text-[12.5px] text-muted-foreground">{r.purchaseNumber}</span> },
    {
      key: "settlement",
      header: "Settlement",
      hideBelow: "lg",
      cell: (r) => <Badge variant={r.settlement === "refund" ? "info" : "outline"}>{r.settlement === "refund" ? "Refund" : "Credit"}</Badge>,
    },
    { key: "total", header: "Total", numeric: true, cell: (r) => <Money value={r.total} className="font-medium" /> },
  ];

  return (
    <>
      <PageHeader
        title="Purchase returns"
        description="Debit notes for goods sent back to suppliers."
        actions={
          can("purchases.manage") && (
            <Button asChild>
              <Link href="/purchases/returns/new">
                <Plus /> New return
              </Link>
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => router.push(`/purchases/returns/view?id=${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search number or supplier…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        footer={
          data &&
          data.total > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="text-right">
                <span className="mr-4 font-normal text-muted-foreground">{data.total} returns</span>
                <Money value={data.totals.total} />
              </TableCell>
            </TableRow>
          )
        }
        empty={<EmptyState icon={PackageMinus} title="No purchase returns" description="Return damaged or wrong goods to a supplier from the purchase page." />}
      />
    </>
  );
}
