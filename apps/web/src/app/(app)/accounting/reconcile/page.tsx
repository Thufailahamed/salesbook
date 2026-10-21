"use client";

import * as React from "react";
import { CheckCheck, FileUp, Landmark, Undo2, Wand2 } from "lucide-react";
import type { BankMatchResult, BankStatementView, Reconciliation, ReconciliationInput, ReconciliationView } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { EmptyState } from "@/components/empty-state";
import { Field, FieldGrid } from "@/components/form-field";
import { AccountPicker } from "@/components/account-picker";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { useBusinessToday } from "@/components/filters";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMoney } from "@/hooks/use-money";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { parseStatementCSV, type StatementRow } from "@/lib/bank-statement";

export default function ReconcilePage() {
  const { can } = useSession();
  const manage = can("accounting.manage");
  const money = useMoney();
  const today = useBusinessToday();
  const confirm = useConfirm();
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [statementDate, setStatementDate] = React.useState("");
  const [statementBalance, setStatementBalance] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const date = statementDate || today;
  const { data, isLoading, isFetching } = useApiQuery<ReconciliationView>(
    accountId ? "/accounting/reconciliation" : null,
    { accountId: accountId ?? undefined, statementDate: date },
  );
  const statement = useApiQuery<BankStatementView>(accountId ? "/accounting/bank-statements" : null, { accountId: accountId ?? undefined });

  // Lines already matched to the bank statement start ticked. A refetch alone keeps the current ticks.
  const matchedKey = (data?.uncleared ?? []).filter((l) => l.matched).map((l) => l.lineId).join(",");
  React.useEffect(() => {
    setSelected(new Set(matchedKey ? matchedKey.split(",") : []));
  }, [accountId, date, matchedKey]);

  const selectedTotal = React.useMemo(
    () => (data?.uncleared ?? []).filter((l) => selected.has(l.lineId)).reduce((s, l) => s + l.amount, 0),
    [data, selected],
  );
  const clearedNow = (data?.clearedBalance ?? 0) + selectedTotal;
  const difference = statementBalance - clearedNow;
  const canFinish = !!data && accountId !== null && difference === 0 && manage;

  const finish = useApiMutation((body: ReconciliationInput) => api.post("/accounting/reconciliations", body), {
    invalidate: ["/accounting"],
    success: "Reconciliation saved",
    onSuccess: () => {
      setSelected(new Set());
      setStatementBalance(0);
    },
  });
  const undo = useApiMutation((id: string) => api.del(`/accounting/reconciliations/${id}`), {
    invalidate: ["/accounting"],
    success: "Reconciliation undone",
  });
  const importRows = useApiMutation((rows: StatementRow[]) => api.post("/accounting/bank-statements", { accountId, rows }), {
    invalidate: ["/accounting"],
    success: (_r, rows) => `Imported ${rows.length} statement lines`,
  });
  const match = useApiMutation((body: { accountId: string }) => api.post<BankMatchResult>("/accounting/bank-statements/match", body), {
    invalidate: ["/accounting"],
    success: (r) => `${r.matched} matched · ${r.unmatched} not in the books`,
  });
  const clearStatement = useApiMutation((id: string) => api.del(`/accounting/bank-statements?accountId=${id}`), {
    invalidate: ["/accounting"],
    success: "Unmatched statement lines removed",
  });

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const latest: Reconciliation | undefined = data?.history[0];

  return (
    <>
      <PageHeader
        title="Bank reconciliation"
        description="Match the ledger to a bank or cash statement. Tick the entries that appear on the statement; the cleared balance must equal the statement balance."
      />
      <SectionCard title="Statement" icon={Landmark} className="mb-6">
        <FieldGrid>
          <Field label="Account" required>
            <AccountPicker value={accountId} onChange={(id) => setAccountId(id)} types={["asset"]} subtypes={["cash", "bank"]} />
          </Field>
          <Field label="Statement date" htmlFor="rec-date">
            <Input id="rec-date" type="date" value={date} max={today} onChange={(e) => setStatementDate(e.target.value)} />
          </Field>
          <Field label="Statement ending balance" required>
            <MoneyInput value={statementBalance} onChange={setStatementBalance} allowNegative />
          </Field>
        </FieldGrid>
      </SectionCard>

      {!accountId ? (
        <EmptyState icon={Landmark} title="Choose a cash or bank account" description="Its uncleared entries will appear here." />
      ) : isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : data ? (
        <div className="grid gap-6">
          {manage && (
            <BankStatementCard
              accountId={accountId}
              statement={statement.data}
              onRows={(rows) => importRows.mutate(rows)}
              importing={importRows.isPending}
              onMatch={() => match.mutate({ accountId })}
              matching={match.isPending}
              onClear={async () => {
                if (await confirm({ title: "Remove unmatched statement lines?", description: "Matched lines are kept. You can import the statement again afterwards.", tone: "destructive", confirmText: "Remove" })) {
                  clearStatement.mutate(accountId);
                }
              }}
              money={money}
            />
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <SectionCard
              title="Uncleared entries"
              description={`Dated on or before ${date}`}
              flush
              action={
                data.uncleared.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(selected.size === data.uncleared.length ? new Set() : new Set(data.uncleared.map((l) => l.lineId)))}
                  >
                    {selected.size === data.uncleared.length ? "Clear selection" : "Select all"}
                  </Button>
                ) : undefined
              }
            >
              {data.uncleared.length === 0 ? (
                <EmptyState compact title="Nothing left to clear" description="Every entry up to this date is reconciled." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-10" />
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead className="w-28">Entry</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead align="right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.uncleared.map((l) => (
                      <TableRow key={l.lineId}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(l.lineId)}
                            onCheckedChange={(v) => toggle(l.lineId, v === true)}
                            aria-label={`Clear ${l.entryNumber}`}
                          />
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">{l.date}</TableCell>
                        <TableCell className="font-mono text-[12.5px]">
                          {l.entryNumber}
                          {l.matched && <Badge variant="success" className="ml-2">On statement</Badge>}
                        </TableCell>
                        <TableCell className="max-w-0 truncate">{l.memo}</TableCell>
                        <TableCell numeric>
                          <Money value={l.amount} tone="signed" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>

            <div className="grid content-start gap-6">
              <SectionCard title="Balance check" icon={CheckCheck} className={isFetching ? "opacity-70" : undefined}>
                <dl className="grid gap-3 text-[14px]">
                  <Row label="Statement balance" value={statementBalance} />
                  <Row label="Cleared before" value={data.clearedBalance} />
                  <Row label="Ticked now" value={selectedTotal} signed />
                  <div className="border-t pt-3">
                    <Row label="Difference" value={difference} strong />
                  </div>
                </dl>
                <p className="mt-3 text-[13px] text-muted-foreground">
                  {difference === 0 ? "The cleared balance matches the statement." : "Tick entries until the difference is zero."}
                </p>
                {manage && (
                  <Button
                    className="mt-4 w-full"
                    disabled={!canFinish}
                    loading={finish.isPending}
                    onClick={() =>
                      finish.mutate({
                        accountId: accountId!,
                        statementDate: date,
                        statementBalance,
                        lineIds: [...selected],
                      })
                    }
                  >
                    Finish reconciliation
                  </Button>
                )}
              </SectionCard>

              <SectionCard title="Previous reconciliations" flush>
                {data.history.length === 0 ? (
                  <EmptyState compact title="None yet" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Statement</TableHead>
                        <TableHead align="right">Balance</TableHead>
                        <TableHead align="right">Lines</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.history.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.statementDate}</TableCell>
                          <TableCell numeric>
                            <Money value={r.statementBalance} />
                          </TableCell>
                          <TableCell numeric>{r.lineCount}</TableCell>
                          <TableCell>
                            {manage && latest?.id === r.id && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Undo this reconciliation"
                                title="Undo this reconciliation"
                                loading={undo.isPending}
                                onClick={async () => {
                                  if (await confirm({ title: "Undo this reconciliation?", description: `The ${r.lineCount} entries it cleared become uncleared again.`, tone: "destructive", confirmText: "Undo" })) {
                                    undo.mutate(r.id);
                                  }
                                }}
                              >
                                <Undo2 />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </SectionCard>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BankStatementCard({
  accountId,
  statement,
  onRows,
  importing,
  onMatch,
  matching,
  onClear,
  money,
}: {
  accountId: string;
  statement: BankStatementView | undefined;
  onRows: (rows: StatementRow[]) => void;
  importing: boolean;
  onMatch: () => void;
  matching: boolean;
  onClear: () => void;
  money: ReturnType<typeof useMoney>;
}) {
  const [pending, setPending] = React.useState<{ rows: StatementRow[]; skipped: number; error: string | null } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const rows = statement?.rows ?? [];
  const unmatched = rows.filter((r) => !r.matched).length;
  return (
    <SectionCard
      title="Bank statement"
      icon={FileUp}
      description="Import the statement export (CSV), then match its lines to the books. Matching only pre-ticks entries. You still check the balance below."
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp /> Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={onMatch} loading={matching} disabled={unmatched === 0}>
            <Wand2 /> Auto-match
          </Button>
          {rows.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}>Clear unmatched</Button>
          )}
        </div>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        data-account={accountId}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const parsed = parseStatementCSV(await file.text(), money.toMinor);
          setPending(parsed.error ? { rows: [], skipped: 0, error: parsed.error } : { ...parsed });
        }}
      />
      {pending && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-[13px]">
          {pending.error ? (
            <span className="text-destructive">{pending.error}</span>
          ) : (
            <>
              <span>
                {pending.rows.length} lines ready to import
                {pending.skipped > 0 && `, ${pending.skipped} skipped (unreadable date or amount)`}.
              </span>
              <Button
                size="sm"
                loading={importing}
                disabled={pending.rows.length === 0}
                onClick={() => {
                  onRows(pending.rows);
                  setPending(null);
                }}
              >
                Import {pending.rows.length} lines
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Dismiss</Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No statement imported for this account yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead align="right">Amount</TableHead>
              <TableHead className="w-40">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-[13px] text-muted-foreground">{r.date}</TableCell>
                <TableCell className="max-w-0 truncate">{r.description}</TableCell>
                <TableCell numeric><Money value={r.amount} tone="signed" /></TableCell>
                <TableCell>
                  {r.matched ? <Badge variant="success">Matched</Badge> : <Badge variant="warning">Not in the books</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

function Row({ label, value, signed, strong }: { label: string; value: number; signed?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd>
        <Money value={value} tone={signed ? "signed" : "default"} className={strong ? "font-semibold" : undefined} />
      </dd>
    </div>
  );
}
