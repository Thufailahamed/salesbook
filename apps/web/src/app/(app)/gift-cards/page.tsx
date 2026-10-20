"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Ban, Gift, Plus } from "lucide-react";
import type { GiftCard, GiftCardInput, Paginated } from "@shopbooks/shared";
import { GIFT_CARD_STATUSES } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { FilterSelect, SearchInput, useBusinessToday } from "@/components/filters";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { KeyValue } from "@/components/key-value";
import { PageLoader } from "@/components/loading";
import { Field, FieldGrid, ToggleRow } from "@/components/form-field";
import { CustomerPicker } from "@/components/customer-picker";
import { PaymentMethodSelect } from "@/components/entity-selects";
import { GiftCardStatusBadge } from "@/components/status-badge";
import { useConfirm } from "@/components/confirm-dialog";
import { useDefaultMethodId } from "@/components/party-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const INVALIDATE = ["/gift-cards", "/payments", "/reports", "/accounting", "/shifts"];
const TX_LABEL = { issue: "Issued", redeem: "Redeemed", void: "Voided", refund: "Refunded" } as const;

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <GiftCardsPage />
    </React.Suspense>
  );
}

function GiftCardsPage() {
  const params = useSearchParams();
  const { can } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(params.get("id"));
  const { data, isLoading, isFetching } = useApiQuery<Paginated<GiftCard>>("/gift-cards", { page, pageSize: 25, q, status });

  const columns: Column<GiftCard>[] = [
    { key: "code", header: "Code", cell: (c) => <span className="font-mono text-[12.5px] font-medium">{c.code}</span> },
    { key: "customer", header: "Customer", hideBelow: "md", cell: (c) => c.customerName ?? <span className="text-muted-foreground">—</span> },
    { key: "issued", header: "Issued", hideBelow: "sm", cell: (c) => <span className="text-muted-foreground">{formatDate(c.issuedAt)}</span> },
    { key: "exp", header: "Expires", hideBelow: "lg", cell: (c) => <span className="text-muted-foreground">{c.expiresOn ? formatDate(c.expiresOn) : "Never"}</span> },
    { key: "status", header: "Status", cell: (c) => <GiftCardStatusBadge status={c.status} /> },
    { key: "initial", header: "Value", numeric: true, hideBelow: "sm", cell: (c) => <Money value={c.initialValue} tone="muted" /> },
    { key: "balance", header: "Balance", numeric: true, cell: (c) => <Money value={c.balance} className="font-semibold" /> },
  ];

  return (
    <>
      <PageHeader
        title="Gift cards"
        description="Prepaid cards customers can spend at the POS."
        actions={
          can("giftcards.manage") && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Issue gift card
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => setSelected(r.id)}
        toolbar={
          <>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search code or customer…" />
            <FilterSelect
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              allLabel="All statuses"
              options={GIFT_CARD_STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))}
            />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        empty={
          <EmptyState
            icon={Gift}
            title="No gift cards"
            description="Sell prepaid cards or hand out promotional ones."
            action={can("giftcards.manage") ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus /> Issue gift card</Button> : undefined}
          />
        }
      />
      <IssueDialog open={createOpen} onOpenChange={setCreateOpen} onIssued={(c) => setSelected(c.id)} />
      <CardSheet id={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}

function IssueDialog({ open, onOpenChange, onIssued }: { open: boolean; onOpenChange: (o: boolean) => void; onIssued: (c: GiftCard) => void }) {
  const today = useBusinessToday();
  const defaultMethod = useDefaultMethodId();
  const [code, setCode] = React.useState("");
  const [value, setValue] = React.useState(0);
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [expiresOn, setExpiresOn] = React.useState("");
  const [paid, setPaid] = React.useState(true);
  const [methodId, setMethodId] = React.useState<string | undefined>(defaultMethod);
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setCode(""); setValue(0); setCustomerId(null); setExpiresOn(""); setPaid(true);
      setMethodId(defaultMethod); setReference(""); setNote("");
    }
  }, [open, defaultMethod]);
  const issue = useApiMutation((body: GiftCardInput) => api.post<GiftCard>("/gift-cards", body), {
    invalidate: INVALIDATE,
    success: (c) => `Gift card ${c.code} issued`,
    onSuccess: (c) => { onOpenChange(false); onIssued(c); },
  });
  const valid = value > 0 && (!paid || !!methodId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            issue.mutate({
              code: code.trim() || null,
              value,
              customerId,
              expiresOn: expiresOn || null,
              note: note.trim() || null,
              paid,
              methodId: paid ? methodId : null,
              reference: paid ? reference.trim() || null : null,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Issue gift card</DialogTitle>
            <DialogDescription>Sold for money, or given away as a promotion.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <FieldGrid>
              <Field label="Value" required><MoneyInput value={value} onChange={setValue} autoFocus /></Field>
              <Field label="Code" htmlFor="gc-code" hint="Blank = auto-generate">
                <Input id="gc-code" className="font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </Field>
              <Field label="Customer (optional)"><CustomerPicker value={customerId} onChange={(id) => setCustomerId(id)} allowCreate={false} /></Field>
              <Field label="Expires on" htmlFor="gc-exp">
                <Input id="gc-exp" type="date" min={today} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              </Field>
            </FieldGrid>
            <div className="rounded-xl border border-border px-4">
              <ToggleRow title="Sold for money" description={paid ? "Cash is received now." : "Promotional: expensed to Marketing."}>
                <Switch checked={paid} onCheckedChange={setPaid} />
              </ToggleRow>
              {paid && (
                <div className="grid gap-4 pb-4 sm:grid-cols-2">
                  <Field label="Payment method"><PaymentMethodSelect value={methodId} onChange={setMethodId} /></Field>
                  <Field label="Reference" htmlFor="gc-ref"><Input id="gc-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
                </div>
              )}
            </div>
            <Field label="Note" htmlFor="gc-note"><Textarea id="gc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={issue.isPending} disabled={!valid}>Issue <Money value={value} /></Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CardSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (o: boolean) => void }) {
  const confirm = useConfirm();
  const { can } = useSession();
  const { data: c } = useApiQuery<GiftCard>(id ? `/gift-cards/${id}` : null);
  const setStatus = useApiMutation((status: "active" | "void") => api.patch<GiftCard>(`/gift-cards/${id}`, { status }), {
    invalidate: INVALIDATE,
    success: "Gift card updated",
  });
  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader><SheetTitle className="font-mono">{c?.code ?? "Gift card"}</SheetTitle></SheetHeader>
        {c ? (
          <>
            <SheetBody className="grid content-start gap-6">
              <div className="rounded-2xl bg-ink p-5 text-ink-foreground">
                <p className="label-caps opacity-70">Balance</p>
                <p className="figure mt-1 text-4xl"><Money value={c.balance} /></p>
                <p className="mt-3 text-[13px] opacity-70">of <Money value={c.initialValue} /> · <GiftCardStatusBadge status={c.status} /></p>
              </div>
              <KeyValue
                items={[
                  { label: "Customer", value: c.customerName, hideEmpty: true },
                  { label: "Expires", value: c.expiresOn ? formatDate(c.expiresOn) : "Never" },
                  { label: "Type", value: c.paid ? "Sold" : "Promotional" },
                  { label: "Issued by", value: c.createdByName },
                  { label: "Note", value: c.note, hideEmpty: true },
                ]}
                columns={2}
              />
              <div>
                <p className="label-caps mb-2">History</p>
                <div className="overflow-hidden rounded-xl border border-border">
                  <ul className="divide-y divide-border/70">
                    {(c.transactions ?? []).map((t) => (
                      <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>
                          {TX_LABEL[t.type]} <span className="text-muted-foreground">· {formatDate(t.date)}{t.reference ? ` · ${t.reference}` : ""}</span>
                        </span>
                        <Money value={t.type === "issue" || t.type === "refund" ? t.amount : -t.amount} tone="signed" />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </SheetBody>
            {can("giftcards.manage") && (c.status === "active" || c.status === "void") && (
              <SheetFooter>
                {c.status === "active" ? (
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={async () => {
                      if (await confirm({ title: `Void ${c.code}?`, description: "The remaining balance can no longer be spent.", tone: "destructive", confirmText: "Void card" }))
                        setStatus.mutate("void");
                    }}
                  >
                    <Ban /> Void card
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setStatus.mutate("active")}>Reactivate</Button>
                )}
              </SheetFooter>
            )}
          </>
        ) : (
          <PageLoader />
        )}
      </SheetContent>
    </Sheet>
  );
}
