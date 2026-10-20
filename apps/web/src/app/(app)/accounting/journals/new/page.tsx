"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { JournalEntry, JournalInput } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field } from "@/components/form-field";
import { AccountPicker } from "@/components/account-picker";
import { MoneyInput } from "@/components/money-input";
import { Money } from "@/components/money";
import { useBusinessToday } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";

interface Line {
  key: number;
  accountId: string | null;
  debit: number;
  credit: number;
  memo: string;
}
let k = 0;
const blank = (): Line => ({ key: k++, accountId: null, debit: 0, credit: 0, memo: "" });

export default function NewJournalPage() {
  const router = useRouter();
  const today = useBusinessToday();
  const [date, setDate] = React.useState(today);
  const [memo, setMemo] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>(() => [blank(), blank()]);
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  const diff = debit - credit;
  const used = lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
  const valid = !!memo.trim() && used.length >= 2 && debit === credit && debit > 0 && lines.every((l) => !(l.debit > 0 && l.credit > 0));

  const save = useApiMutation((body: JournalInput) => api.post<JournalEntry>("/accounting/journals", body), {
    invalidate: ["/accounting", "/reports"],
    success: (j) => `Entry ${j.number} posted`,
    onSuccess: (j) => router.push(`/accounting/journals/view?id=${j.id}`),
  });

  return (
    <>
      <PageHeader
        backHref="/accounting/journals"
        breadcrumbs={[{ label: "Journals", href: "/accounting/journals" }, { label: "New" }]}
        title="Manual journal"
        description="Adjustments that don't come from a sale, purchase or expense. Debits must equal credits."
      />
      <div className="grid max-w-5xl gap-6">
        <SectionCard>
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <Field label="Date" htmlFor="j-date"><Input id="j-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Memo" htmlFor="j-memo" required><Input id="j-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this entry for?" autoFocus /></Field>
          </div>
        </SectionCard>
        <SectionCard
          title="Lines"
          flush
          action={<Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}><Plus /> Add line</Button>}
        >
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Account</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead align="right" className="w-36">Debit</TableHead>
                  <TableHead align="right" className="w-36">Credit</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.key} className="hover:bg-transparent">
                    <TableCell className="min-w-64"><AccountPicker value={l.accountId} onChange={(id) => update(l.key, { accountId: id })} size="sm" /></TableCell>
                    <TableCell><Input className="h-8" value={l.memo} onChange={(e) => update(l.key, { memo: e.target.value })} /></TableCell>
                    <TableCell><MoneyInput hideSymbol className="h-8 text-right" value={l.debit} onChange={(v) => update(l.key, { debit: v, credit: v > 0 ? 0 : l.credit })} /></TableCell>
                    <TableCell><MoneyInput hideSymbol className="h-8 text-right" value={l.credit} onChange={(v) => update(l.key, { credit: v, debit: v > 0 ? 0 : l.debit })} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line"><Trash2 /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={2}>
                    {diff === 0 ? (debit > 0 ? <span className="text-success-soft-foreground">Balanced</span> : "Totals") : <span className="text-destructive">Out of balance by <Money value={Math.abs(diff)} /></span>}
                  </TableCell>
                  <TableCell numeric><Money value={debit} /></TableCell>
                  <TableCell numeric><Money value={credit} /></TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </SectionCard>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button
            loading={save.isPending}
            disabled={!valid}
            onClick={() => save.mutate({ date, memo: memo.trim(), lines: used.map((l) => ({ accountId: l.accountId!, debit: l.debit, credit: l.credit, memo: l.memo.trim() || null })) })}
          >
            Post entry
          </Button>
        </div>
      </div>
    </>
  );
}
