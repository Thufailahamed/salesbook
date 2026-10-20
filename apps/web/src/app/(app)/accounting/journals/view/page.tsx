"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Undo2 } from "lucide-react";
import type { JournalEntry } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";
import { Money } from "@/components/money";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { docHref } from "@/lib/links";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <JournalView />
    </React.Suspense>
  );
}

function JournalView() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const confirm = useConfirm();
  const { can } = useSession();
  const { data: j, isLoading, error, refetch } = useApiQuery<JournalEntry>(id ? `/accounting/journals/${id}` : null);
  const reverse = useApiMutation(() => api.post<JournalEntry>(`/accounting/journals/${id}/reverse`), {
    invalidate: ["/accounting", "/reports"],
    success: (r) => `Reversed by ${r.number}`,
    onSuccess: (r) => router.push(`/accounting/journals/view?id=${r.id}`),
  });
  if (!id) return <ErrorState message="No entry selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !j) return <ErrorState message={error?.message ?? "Entry not found"} onRetry={() => refetch()} />;

  const lines = j.lines ?? [];
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  const source = docHref(j.sourceType, j.sourceId);
  const canReverse = can("accounting.manage") && (j.sourceType === "manual" || j.sourceType === "transfer") && !j.reversedById && !j.reversalOfId;

  return (
    <>
      <PageHeader
        backHref="/accounting/journals"
        breadcrumbs={[{ label: "Journals", href: "/accounting/journals" }, { label: j.number }]}
        eyebrow="Journal entry"
        title={<span className="font-mono tracking-tight">{j.number}</span>}
        badge={j.reversedById ? <Badge variant="neutral">Reversed</Badge> : j.reversalOfId ? <Badge variant="warning">Reversal</Badge> : undefined}
        description={`${formatDate(j.date)} · ${j.memo}`}
        actions={
          canReverse && (
            <Button
              variant="outline"
              onClick={async () => {
                if (await confirm({ title: `Reverse ${j.number}?`, description: "A mirror entry with debits and credits swapped is posted today.", confirmText: "Reverse" })) reverse.mutate();
              }}
              loading={reverse.isPending}
            >
              <Undo2 /> Reverse
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Lines" flush className="min-w-0 lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Account</TableHead>
                <TableHead align="right">Debit</TableHead>
                <TableHead align="right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id} className="hover:bg-transparent">
                  <TableCell>
                    <Link href={`/accounting/ledger?accountId=${l.accountId}`} className="font-medium hover:underline">
                      <span className="mr-2 font-mono text-[12px] text-muted-foreground">{l.accountCode}</span>
                      {l.accountName}
                    </Link>
                    {(l.memo || l.partyName) && <p className="text-xs text-muted-foreground">{[l.partyName, l.memo].filter(Boolean).join(" · ")}</p>}
                  </TableCell>
                  <TableCell numeric><Money value={l.debit} dashZero /></TableCell>
                  <TableCell numeric><Money value={l.credit} dashZero /></TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell>Total</TableCell>
                <TableCell numeric><Money value={debit} /></TableCell>
                <TableCell numeric><Money value={credit} /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </SectionCard>
        <SectionCard title="Details" className="self-start">
          <KeyValue
            items={[
              { label: "Date", value: formatDate(j.date) },
              { label: "Memo", value: j.memo },
              {
                label: "Source",
                value: source ? (
                  <Link href={source} className="text-primary hover:underline">{j.sourceNumber ?? j.sourceType}</Link>
                ) : (
                  j.sourceNumber ?? j.sourceType.replace(/_/g, " ")
                ),
              },
              { label: "Posted by", value: j.createdByName, hideEmpty: true },
              { label: "Posted at", value: formatDateTime(j.createdAt) },
              {
                label: "Reverses",
                value: j.reversalOfId ? <Link href={`/accounting/journals/view?id=${j.reversalOfId}`} className="text-primary hover:underline">View original</Link> : null,
                hideEmpty: true,
              },
              {
                label: "Reversed by",
                value: j.reversedById ? <Link href={`/accounting/journals/view?id=${j.reversedById}`} className="text-primary hover:underline">View reversal</Link> : null,
                hideEmpty: true,
              },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
