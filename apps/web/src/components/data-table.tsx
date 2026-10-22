"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { cn, formatNumber } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Money/qty column: right aligned + tabular numbers */
  numeric?: boolean;
  className?: string;
  headerClassName?: string;
  width?: string | number;
  /** Hide on small screens */
  hideBelow?: "sm" | "md" | "lg";
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  /** EmptyState (or any node) when there are no rows */
  empty?: React.ReactNode;
  /** Rendered above the table (search, filters) */
  toolbar?: React.ReactNode;
  pagination?: PaginationState;
  /** <TableRow> elements rendered in <tfoot> (totals) */
  footer?: React.ReactNode;
  /** Render without the surrounding card */
  bare?: boolean;
  className?: string;
  skeletonRows?: number;
  rowClassName?: (row: T) => string | undefined;
  stickyHeader?: boolean;
}

const hideClass = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/**
 * Generic table with loading skeleton, empty state, row click and pagination.
 *   <DataTable columns={cols} rows={data?.data} rowKey={(r) => r.id} loading={isLoading}
 *     onRowClick={(r) => router.push(`/sales/view?id=${r.id}`)}
 *     pagination={{ page, pageSize, total: data?.total ?? 0, onPageChange: setPage }} toolbar={<SearchInput …/>} />
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  onRowClick,
  empty,
  toolbar,
  pagination,
  footer,
  bare,
  className,
  skeletonRows = 8,
  rowClassName,
  stickyHeader,
}: DataTableProps<T>) {
  const showSkeleton = loading && (!rows || rows.length === 0);
  const isEmpty = !loading && (!rows || rows.length === 0);

  const table = (
    <>
      {toolbar && (
        <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/25 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
          {toolbar}
        </div>
      )}
      {isEmpty ? (
        <div>{empty ?? <EmptyState compact title="Nothing here yet" description="No records match your filters." />}</div>
      ) : (
        <Table className={cn(loading && rows && rows.length > 0 && "opacity-60 transition-opacity")}>
          <TableHeader sticky={stickyHeader}>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  align={c.numeric ? "right" : c.align}
                  className={cn(c.hideBelow && hideClass[c.hideBelow], c.headerClassName)}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                    {columns.map((c, ci) => (
                      <TableCell key={c.key} className={cn(c.hideBelow && hideClass[c.hideBelow])}>
                        <Skeleton
                          className={cn("h-4", c.numeric ? "ml-auto w-16" : ci === 0 ? "w-32" : "w-20")}
                          style={{ opacity: 1 - i * 0.08 }}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows!.map((row, i) => (
                  <TableRow
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
                  >
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        align={c.align}
                        numeric={c.numeric}
                        className={cn(c.hideBelow && hideClass[c.hideBelow], c.className)}
                      >
                        {c.cell(row, i)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
          {footer && !showSkeleton && <TableFooter>{footer}</TableFooter>}
        </Table>
      )}
      {pagination && !isEmpty && <Pagination {...pagination} />}
    </>
  );

  if (bare) return <div className={className}>{table}</div>;
  return (
    <div className={cn("overflow-hidden rounded-3xl bg-card shadow-card dark:shadow-[inset_0_0_0_1px_var(--border)]", className)}>{table}</div>
  );
}

/** "Showing 1–25 of 230" + page controls. */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationState) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const nums = React.useMemo(() => {
    const out: (number | "…")[] = [];
    const add = (n: number | "…") => out.push(n);
    if (pages <= 7) {
      for (let i = 1; i <= pages; i++) add(i);
    } else {
      add(1);
      if (page > 3) add("…");
      for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) add(i);
      if (page < pages - 2) add("…");
      add(pages);
    }
    return out;
  }, [page, pages]);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 bg-muted/25 px-4 py-3 text-[13px] sm:flex-row sm:px-5">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="num">
          Showing <span className="font-medium text-foreground">{formatNumber(from)}</span>–
          <span className="font-medium text-foreground">{formatNumber(to)}</span> of{" "}
          <span className="font-medium text-foreground">{formatNumber(total)}</span>
        </span>
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger size="sm" className="w-[88px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          {nums.map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1.5 text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={n}
                onClick={() => onPageChange(n)}
                className={cn(
                  "num inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] font-medium transition-colors",
                  n === page ? "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border-strong),var(--shadow-xs)]" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {n}
              </button>
            ),
          )}
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
