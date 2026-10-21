"use client";

import * as React from "react";
import { CalendarCheck, Lock, Unlock } from "lucide-react";
import type { Business, BooksLockInput, DepreciationInput } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field, FieldGrid } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { useBusinessToday } from "@/components/filters";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Books closed through"
          icon={closedThrough ? Lock : Unlock}
          description="Entries dated on or before this day are locked, including sales, purchases, payments and manual journals."
        >
          <div className="grid gap-5">
            <div className="flex items-center gap-3">
              {closedThrough ? (
                <>
                  <Badge variant="warning">Closed</Badge>
                  <span className="figure text-lg font-semibold">{closedThrough}</span>
                </>
              ) : (
                <Badge variant="neutral">Open · nothing is locked</Badge>
              )}
            </div>
            {manage && (
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
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Record depreciation"
          icon={CalendarCheck}
          description="Charges depreciation for fixed assets: debits Depreciation Expense and credits Accumulated Depreciation (both accounts are created if missing)."
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
        </SectionCard>
      </div>
    </>
  );
}
