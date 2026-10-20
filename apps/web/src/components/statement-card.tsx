"use client";

import * as React from "react";
import Link from "next/link";
import { Printer, ScrollText } from "lucide-react";
import type { Statement } from "@shopbooks/shared";
import { SectionCard } from "@/components/section-card";
import { DateRangePicker, useBusinessToday, type DateRange } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api";
import { docHref } from "@/lib/links";
import { formatDate, withQuery } from "@/lib/utils";

/** Account statement with a date range, opening/closing balance and running balance. */
export function StatementCard({ kind, partyId }: { kind: "customer" | "supplier"; partyId: string }) {
  const today = useBusinessToday();
  const [range, setRange] = React.useState<DateRange>({ from: `${today.slice(0, 4)}-01-01`, to: today });
  const path = `/${kind === "customer" ? "customers" : "suppliers"}/${partyId}/statement`;
  const { data, isLoading } = useApiQuery<Statement>(path, { from: range.from, to: range.to });

  return (
    <SectionCard
      title="Statement"
      description={
        kind === "customer" ? "Positive balance = the customer owes you" : "Positive balance = you owe the supplier"
      }
      flush
      action={
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} allowAll={false} align="end" />
          <Button variant="outline" size="icon" asChild>
            <Link
              href={withQuery("/print/statement", { kind, id: partyId, from: range.from, to: range.to })}
              target="_blank"
              aria-label="Print statement"
            >
              <Printer />
            </Link>
          </Button>
        </div>
      }
    >
      {isLoading || !data ? (
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Date</TableHead>
              <TableHead>Details</TableHead>
              <TableHead align="right">{kind === "customer" ? "Charges" : "Bills"}</TableHead>
              <TableHead align="right">{kind === "customer" ? "Payments" : "Paid"}</TableHead>
              <TableHead align="right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-muted-foreground">{formatDate(data.from)}</TableCell>
              <TableCell className="font-medium" colSpan={3}>
                Opening balance
              </TableCell>
              <TableCell numeric className="font-medium">
                <Money value={data.openingBalance} />
              </TableCell>
            </TableRow>
            {data.entries.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5}>
                  <EmptyState compact icon={ScrollText} title="No activity in this period" />
                </TableCell>
              </TableRow>
            ) : (
              data.entries.map((e, i) => {
                const href = docHref(e.refType, e.refId);
                return (
                  <TableRow key={`${e.createdAt}-${i}`}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(e.date)}</TableCell>
                    <TableCell>
                      <p className="text-sm">{e.description}</p>
                      {e.number &&
                        (href ? (
                          <Link href={href} className="font-mono text-[11.5px] text-primary hover:underline">
                            {e.number}
                          </Link>
                        ) : (
                          <span className="font-mono text-[11.5px] text-muted-foreground">{e.number}</span>
                        ))}
                    </TableCell>
                    <TableCell numeric>
                      <Money value={e.debit} dashZero />
                    </TableCell>
                    <TableCell numeric>
                      <Money value={e.credit} dashZero />
                    </TableCell>
                    <TableCell numeric className="font-medium">
                      <Money value={e.balance} tone="auto" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={2}>Closing balance · {formatDate(data.to)}</TableCell>
              <TableCell numeric>
                <Money value={data.totalDebit} />
              </TableCell>
              <TableCell numeric>
                <Money value={data.totalCredit} />
              </TableCell>
              <TableCell numeric>
                <Money value={data.closingBalance} tone="auto" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </SectionCard>
  );
}
