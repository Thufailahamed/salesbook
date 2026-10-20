"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, BookOpen, Lock, Plus } from "lucide-react";
import type { Account, AccountInput } from "@shopbooks/shared";
import { ACCOUNT_SUBTYPES, ACCOUNT_SUBTYPE_LABELS, ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { Field, FieldGrid, ToggleRow } from "@/components/form-field";
import { AccountPicker } from "@/components/account-picker";
import { useBusinessToday } from "@/components/filters";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import type { FundsTransferInput } from "@shopbooks/shared";

export default function ChartOfAccountsPage() {
  const router = useRouter();
  const { can } = useSession();
  const manage = can("accounting.manage");
  const [showInactive, setShowInactive] = React.useState(false);
  const { data, isLoading } = useApiQuery<Account[]>("/accounting/accounts", { includeInactive: showInactive ? "1" : undefined });
  const [editing, setEditing] = React.useState<Account | "new" | null>(null);
  const [transferOpen, setTransferOpen] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description="Every account in the ledger with its current balance."
        actions={
          <>
            {manage && (
              <Button variant="outline" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight /> Transfer funds
              </Button>
            )}
            {manage && (
              <Button onClick={() => setEditing("new")}>
                <Plus /> New account
              </Button>
            )}
          </>
        }
      >
        <label className="flex w-fit items-center gap-2 text-[13px] text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Show inactive accounts
        </label>
      </PageHeader>
      {isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={BookOpen} title="No accounts" />
      ) : (
        <div className="grid gap-6">
          {ACCOUNT_TYPES.map((type) => {
            const rows = data.filter((a) => a.type === type);
            if (rows.length === 0) return null;
            const total = rows.reduce((s, a) => s + (a.subtype === "contra_revenue" ? -a.balance : a.balance), 0);
            return (
              <SectionCard
                key={type}
                title={ACCOUNT_TYPE_LABELS[type]}
                action={<Money value={total} className="figure text-lg" />}
                flush
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-24">Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="hidden md:table-cell">Type</TableHead>
                      <TableHead align="right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((a) => (
                      <TableRow key={a.id} className="cursor-pointer" onClick={() => router.push(`/accounting/ledger?accountId=${a.id}`)}>
                        <TableCell className="font-mono text-[12.5px] text-muted-foreground">{a.code}</TableCell>
                        <TableCell>
                          <span className="font-medium">{a.name}</span>
                          {a.isSystem && <Lock className="ml-2 inline size-3 text-muted-foreground" aria-label="System account" />}
                          {!a.isActive && <Badge variant="neutral" className="ml-2">Inactive</Badge>}
                          {a.description && <p className="truncate text-xs text-muted-foreground">{a.description}</p>}
                        </TableCell>
                        <TableCell className="hidden text-[13px] text-muted-foreground md:table-cell">{ACCOUNT_SUBTYPE_LABELS[a.subtype]}</TableCell>
                        <TableCell numeric className="font-medium">
                          <Money value={a.balance} tone="auto" />
                          {manage && (
                            <button
                              className="ml-3 text-xs font-normal text-primary hover:underline"
                              onClick={(e) => { e.stopPropagation(); setEditing(a); }}
                            >
                              Edit
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            );
          })}
        </div>
      )}
      <AccountDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} account={editing === "new" ? null : editing} />
      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} />
    </>
  );
}

function AccountDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (o: boolean) => void; account: Account | null }) {
  const confirm = useConfirm();
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("expense");
  const [subtype, setSubtype] = React.useState<string>("expense");
  const [description, setDescription] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  React.useEffect(() => {
    if (!open) return;
    setCode(account?.code ?? "");
    setName(account?.name ?? "");
    setType(account?.type ?? "expense");
    setSubtype(account?.subtype ?? "expense");
    setDescription(account?.description ?? "");
    setIsActive(account?.isActive ?? true);
  }, [open, account]);
  const save = useApiMutation(
    (body: AccountInput) => (account ? api.put(`/accounting/accounts/${account.id}`, body) : api.post("/accounting/accounts", body)),
    { invalidate: ["/accounting", "/reports"], success: "Account saved", onSuccess: () => onOpenChange(false) },
  );
  const del = useApiMutation(() => api.del(`/accounting/accounts/${account!.id}`), {
    invalidate: ["/accounting"],
    success: "Account deleted",
    onSuccess: () => onOpenChange(false),
  });
  const locked = !!account?.isSystem;
  const subtypes = ACCOUNT_SUBTYPES[type] as readonly string[];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim() && name.trim()) save.mutate({ code: code.trim(), name: name.trim(), type, subtype, description: description.trim() || null, isActive });
          }}
        >
          <DialogHeader>
            <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <FieldGrid>
              <Field label="Code" htmlFor="a-code" required><Input id="a-code" className="font-mono" value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></Field>
              <Field label="Name" htmlFor="a-name" required><Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Type">
                <Select value={type} onValueChange={(v) => { setType(v as AccountType); setSubtype(ACCOUNT_SUBTYPES[v as AccountType][0]); }} disabled={locked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Category">
                <Select value={subtype} onValueChange={setSubtype} disabled={locked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subtypes.map((s) => <SelectItem key={s} value={s}>{ACCOUNT_SUBTYPE_LABELS[s as keyof typeof ACCOUNT_SUBTYPE_LABELS]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGrid>
            <Field label="Description" htmlFor="a-desc"><Textarea id="a-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            {account && (
              <ToggleRow title="Active" description={locked ? "System accounts can't be deactivated." : "Inactive accounts are hidden from pickers."}>
                <Switch checked={isActive} onCheckedChange={setIsActive} disabled={locked} />
              </ToggleRow>
            )}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            {account && !locked ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  if (await confirm({ title: `Delete ${account.name}?`, description: "Accounts with postings can only be deactivated.", tone: "destructive", confirmText: "Delete" })) del.mutate();
                }}
              >
                Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" loading={save.isPending} disabled={!code.trim() || !name.trim()}>Save</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = useBusinessToday();
  const [from, setFrom] = React.useState<string | null>(null);
  const [to, setTo] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState(0);
  const [date, setDate] = React.useState(today);
  const [memo, setMemo] = React.useState("");
  React.useEffect(() => {
    if (open) { setFrom(null); setTo(null); setAmount(0); setDate(today); setMemo(""); }
  }, [open, today]);
  const save = useApiMutation((body: FundsTransferInput) => api.post("/accounting/transfers", body), {
    invalidate: ["/accounting", "/reports"],
    success: "Funds transferred",
    onSuccess: () => onOpenChange(false),
  });
  const valid = !!from && !!to && from !== to && amount > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate({ fromAccountId: from!, toAccountId: to!, amount, date, memo: memo.trim() || null });
          }}
        >
          <DialogHeader><DialogTitle>Transfer funds</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <p className="text-[13px] text-muted-foreground">Move money between accounts — a cash deposit to the bank, or the owner taking drawings.</p>
            <Field label="From" required><AccountPicker value={from} onChange={(id) => setFrom(id)} types={["asset", "equity"]} /></Field>
            <Field label="To" required><AccountPicker value={to} onChange={(id) => setTo(id)} excludeIds={from ? [from] : []} types={["asset", "equity", "liability"]} /></Field>
            <FieldGrid>
              <Field label="Amount" required><MoneyInput value={amount} onChange={setAmount} /></Field>
              <Field label="Date" htmlFor="t-date"><Input id="t-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
            </FieldGrid>
            <Field label="Memo" htmlFor="t-memo"><Input id="t-memo" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!valid}>Transfer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
