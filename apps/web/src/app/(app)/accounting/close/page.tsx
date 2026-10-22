"use client";

import * as React from "react";
import { CalendarCheck, ClipboardCheck, Lock, Unlock, type LucideIcon } from "lucide-react";
import type { Business, BooksLockInput, CloseReview, CloseReviewInput, DepreciationInput } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { Field, FieldGrid } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { useBusinessToday } from "@/components/filters";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/section-card";
import { useMoney } from "@/hooks/use-money";
import { useApiMutation } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";

export default function PeriodClosePage() {
  const { can, business, refresh } = useSession();
  const manage = can("accounting.manage");
  const today = useBusinessToday();
  const closedThrough = business.booksClosedThrough;
  const [date, setDate] = React.useState("");
  const confirm = useConfirm();

  const lock = useApiMutation((body: BooksLockInput) => api.put<{ booksClosedThrough: string | null }>("/accounting/books-lock", body), {
    invalidate: ["/accounting", "/reports"],
    success: (_res, vars) => (vars.closedThrough ? `Books closed through ${vars.closedThrough}` : "Books reopened"),
    onSuccess: () => {
      setDate("");
      refresh();
    },
  });

  const [depDate, setDepDate] = React.useState(today);
  const [amount, setAmount] = React.useState(0);
  const [memo, setMemo] = React.useState("");
  const depreciate = useApiMutation((body: DepreciationInput) => api.post("/accounting/depreciation", body), {
    invalidate: ["/accounting", "/reports"],
    success: "Depreciation posted",
    onSuccess: () => {
      setAmount(0);
      setMemo("");
    },
  });

  const yesterday = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <>
      <PageHeader
        title="Period close"
        description="Lock past periods so their entries can't change, and post depreciation for fixed assets."
      />

      {/* Status hero: is the ledger locked, and through when. */}
      <section className="metal relative mb-6 overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              {closedThrough ? <Lock className="size-5 text-highlight" /> : <Unlock className="size-5 text-highlight" />}
            </span>
            <div>
              <p className="eyebrow text-white/50">{closedThrough ? "Books closed" : "Books open"}</p>
              <p className="figure mt-1.5 text-2xl text-gold sm:text-3xl">{closedThrough ?? "Nothing is locked"}</p>
            </div>
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-white/60">
            {closedThrough
              ? "Entries dated on or before this day are locked. Sales, purchases, payments and manual journals can't change."
              : "Every date is open. Close the books once a period is final so its numbers stay fixed."}
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ClosePanel step="01" icon={Lock} title="Close the books" description="Lock every entry on or before a date.">
          <div className="grid gap-5">
            {manage ? (
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (date) lock.mutate({ closedThrough: date });
                }}
              >
                <Field label="Close the books through" htmlFor="lock-date" hint={`Latest allowed: ${yesterday}`}>
                  <Input id="lock-date" type="date" value={date} max={yesterday} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!date} loading={lock.isPending}>
                    <Lock /> Close books
                  </Button>
                  {closedThrough && (
                    <Button
                      type="button"
                      variant="outline"
                      loading={lock.isPending}
                      onClick={async () => {
                        if (await confirm({ title: "Reopen the books?", description: `Entries dated ${closedThrough} and earlier can be changed again.`, tone: "destructive", confirmText: "Reopen" })) {
                          lock.mutate({ closedThrough: null });
                        }
                      }}
                    >
                      <Unlock /> Reopen books
                    </Button>
                  )}
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">You need accounting permission to change the lock.</p>
            )}
          </div>
        </ClosePanel>

        <ClosePanel
          step="02"
          icon={CalendarCheck}
          title="Record depreciation"
          description="Debits Depreciation Expense and credits Accumulated Depreciation. Both accounts are created if missing."
        >
          {manage ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (amount > 0 && memo.trim()) depreciate.mutate({ date: depDate, amount, memo: memo.trim() });
              }}
            >
              <FieldGrid>
                <Field label="Date" htmlFor="dep-date">
                  <Input id="dep-date" type="date" value={depDate} max={today} onChange={(e) => setDepDate(e.target.value)} />
                </Field>
                <Field label="Amount" required>
                  <MoneyInput value={amount} onChange={setAmount} />
                </Field>
              </FieldGrid>
              <Field label="Asset or period" htmlFor="dep-memo" required hint="For example: Shop fridges, March 2026">
                <Input id="dep-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
              </Field>
              <div>
                <Button type="submit" disabled={amount <= 0 || !memo.trim()} loading={depreciate.isPending}>
                  Post depreciation
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">You need accounting permission to post depreciation.</p>
          )}
        </ClosePanel>
      </div>

      <div className="mt-6">
        <CloseReviewCard />
      </div>
    </>
  );
}

const SEVERITY_BADGE = { high: "danger", medium: "warning", info: "neutral" } as const;
const SEVERITY_LABEL = { high: "Check first", medium: "Worth a look", info: "Note" } as const;

/** Read-only checks on the period before locking it. Nothing is changed by running it. */
function CloseReviewCard() {
  const money = useMoney();
  const review = useApiMutation((body: CloseReviewInput) => api.post<CloseReview>("/accounting/close-review", body), {
    errorToast: true,
  });
  const result = review.data;
  return (
    <SectionCard
      title="Review before closing"
      icon={ClipboardCheck}
      description="Looks for duplicate expenses, bank lines not in the books, unreconciled bank entries and old customer balances. Nothing is changed."
      action={
        <Button variant="outline" size="sm" loading={review.isPending} onClick={() => review.mutate({})}>
          <ClipboardCheck /> Run review
        </Button>
      }
    >
      {!result && !review.isPending && (
        <p className="text-sm text-muted-foreground">Run the review on the period since the last close, up to yesterday.</p>
      )}
      {result && (
        <>
          <p className="text-sm text-muted-foreground">
            Period {result.from} to {result.to}
          </p>
          {result.summary && (
            <div className="mt-3 rounded-xl bg-muted/50 p-4 text-[14px] leading-relaxed whitespace-pre-line">{result.summary}</div>
          )}
          {result.findings.length === 0 ? (
            <p className="mt-4 text-sm">Nothing to flag in this period.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {result.findings.map((f) => (
                <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{f.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{f.detail}</p>
                    {f.count > 0 && <p className="mt-1 text-xs text-muted-foreground">{f.count} item{f.count === 1 ? "" : "s"}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {f.amount !== undefined && <span className="text-sm tabular-nums">{money.format(money.toMinor(f.amount))}</span>}
                    <Badge variant={SEVERITY_BADGE[f.severity]}>{SEVERITY_LABEL[f.severity]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SectionCard>
  );
}

/** Numbered action panel used for each step on this page. */
function ClosePanel({
  step,
  icon: Icon,
  title,
  description,
  children,
}: {
  step: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-card p-6 shadow-card dark:shadow-[inset_0_0_0_1px_var(--border)]">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-primary">
          <Icon className="size-[19px]" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground">Step {step}</p>
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-6 border-t border-border/60 pt-6">{children}</div>
    </section>
  );
}
