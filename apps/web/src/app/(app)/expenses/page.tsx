"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, ChartColumn, Plus, ScanLine, Wallet } from "lucide-react";
import type { AiStatus, Expense, ExpenseInput, Paginated, ReceiptScan } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangePicker, FilterSelect, SearchInput, useBusinessToday, type DateRange } from "@/components/filters";
import { LocationSelect, PaymentMethodSelect } from "@/components/entity-selects";
import { AccountPicker } from "@/components/account-picker";
import { SupplierPicker } from "@/components/supplier-picker";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { KeyValue } from "@/components/key-value";
import { PageLoader } from "@/components/loading";
import { Field, FieldGrid } from "@/components/form-field";
import { useConfirm } from "@/components/confirm-dialog";
import { useDefaultMethodId } from "@/components/party-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TableCell, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/utils";

type ExpenseList = Paginated<Expense> & { totals: { amount: number } };
const INVALIDATE = ["/expenses", "/reports", "/accounting", "/payments", "/suppliers", "/shifts"];

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <ExpensesPage />
    </React.Suspense>
  );
}

function ExpensesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState<DateRange>({});
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = React.useState(params.get("new") === "1");
  const prefill = React.useMemo<ExpensePrefill | null>(() => {
    const accountId = params.get("accountId");
    if (!accountId) return null;
    return {
      accountId,
      methodId: params.get("methodId"),
      amount: Number(params.get("amount")) || 0,
      date: params.get("date") ?? "",
      payee: params.get("payee") ?? "",
      note: params.get("note") ?? "",
    };
  }, [params]);
  const [selectedId, setSelectedId] = React.useState<string | null>(params.get("id"));
  const { data, isLoading, isFetching } = useApiQuery<ExpenseList>("/expenses", {
    page,
    pageSize: 25,
    q,
    ...range,
    accountId: accountId ?? undefined,
    status,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const manage = can("expenses.manage");

  const columns: Column<Expense>[] = [
    { key: "number", header: "Expense", cell: (e) => <span className="font-mono text-[12.5px] font-medium">{e.number}</span> },
    { key: "date", header: "Date", hideBelow: "sm", cell: (e) => <span className="text-muted-foreground">{formatDate(e.date)}</span> },
    {
      key: "category",
      header: "Category",
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate">{e.accountName}</p>
          <p className="truncate text-xs text-muted-foreground">{e.payee ?? e.supplierName ?? e.note ?? ""}</p>
        </div>
      ),
    },
    { key: "method", header: "Paid via", hideBelow: "md", cell: (e) => <span className="text-[13px] text-muted-foreground">{e.methodName ?? "—"}</span> },
    { key: "status", header: "", hideBelow: "lg", width: 70, cell: (e) => (e.status === "void" ? <Badge variant="neutral">Void</Badge> : null) },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      cell: (e) => <Money value={e.amount} className={e.status === "void" ? "text-muted-foreground line-through" : "font-medium"} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Rent, salaries, utilities and every other running cost."
        actions={
          <>
            {can("reports.view") && (
              <Button variant="outline" asChild className="hidden sm:inline-flex">
                <Link href="/reports/expenses">
                  <ChartColumn /> Report
                </Link>
              </Button>
            )}
            {manage && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> Add expense
              </Button>
            )}
          </>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        onRowClick={(r) => setSelectedId(r.id)}
        rowClassName={(e) => (e.status === "void" ? "opacity-60" : undefined)}
        toolbar={
          <>
            <SearchInput value={q} onChange={reset(setQ)} placeholder="Search payee, reference or note…" />
            <DateRangePicker value={range} onChange={reset(setRange)} />
            {manage && (
              <AccountPicker
                value={accountId}
                onChange={(id) => {
                  setAccountId(id);
                  setPage(1);
                }}
                types={["expense"]}
                clearable
                placeholder="All categories"
                className="sm:w-56"
              />
            )}
            <FilterSelect
              value={status}
              onChange={reset(setStatus)}
              allLabel="Any status"
              options={[
                { value: "posted", label: "Posted" },
                { value: "void", label: "Void" },
              ]}
              className="sm:w-36"
            />
          </>
        }
        pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
        footer={
          data &&
          data.total > 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="text-right">
                <span className="mr-4 font-normal text-muted-foreground">{data.total} expenses</span>
                <Money value={data.totals.amount} />
              </TableCell>
            </TableRow>
          )
        }
        empty={
          <EmptyState
            icon={Wallet}
            title="No expenses"
            description="Record running costs to see your true profit."
            action={
              manage ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus /> Add expense
                </Button>
              ) : undefined
            }
          />
        }
      />
      <ExpenseDialog
        prefill={prefill}
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o && params.get("new")) router.replace("/expenses");
        }}
      />
      <ExpenseSheet
        id={selectedId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedId(null);
            if (params.get("id")) router.replace("/expenses");
          }
        }}
      />
    </>
  );
}

/** Values from the URL, e.g. when recording an expense from a bank statement line. */
interface ExpensePrefill {
  accountId: string;
  methodId: string | null;
  amount: number;
  date: string;
  payee: string;
  note: string;
}

function ExpenseDialog({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefill: ExpensePrefill | null;
}) {
  const today = useBusinessToday();
  const defaultMethod = useDefaultMethodId();
  const { locationId: sessionLocation, activeLocations } = useSession();
  const blank = React.useCallback(
    () => ({
      date: prefill?.date || today,
      accountId: (prefill?.accountId ?? null) as string | null,
      amount: prefill?.amount ?? 0,
      taxAmount: 0,
      methodId: prefill?.methodId ?? defaultMethod,
      supplierId: null as string | null,
      payee: prefill?.payee ?? "",
      reference: "",
      note: prefill?.note ?? "",
      locationId: sessionLocation as string | undefined,
    }),
    [today, defaultMethod, sessionLocation, prefill],
  );
  const [f, setF] = React.useState(blank);
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (open) {
      setF(blank());
      setScanned(null);
    }
  }, [open, blank]);
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => setF((p) => ({ ...p, [k]: v }));
  const aiStatus = useApiQuery<AiStatus>("/ai/status", undefined, { staleTime: Infinity });
  const [scanned, setScanned] = React.useState<ReceiptScan | null>(null);
  const scan = useApiMutation((file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.form<ReceiptScan>("/ai/receipt", form);
  }, {
    onSuccess: (r) => {
      setScanned(r);
      setF((p) => ({
        ...p,
        date: r.date ?? p.date,
        payee: r.payee ?? p.payee,
        amount: r.amount ?? p.amount,
        taxAmount: r.taxAmount ?? p.taxAmount,
        reference: r.reference ?? p.reference,
        note: r.note ?? p.note,
        accountId: r.accountId ?? p.accountId,
      }));
    },
  });

  const save = useApiMutation((body: ExpenseInput) => api.post<Expense>("/expenses", body), {
    invalidate: INVALIDATE,
    success: (e) => `Expense ${e.number} recorded`,
    onSuccess: () => onOpenChange(false),
  });
  const valid = !!f.accountId && f.amount > 0 && !!f.methodId && f.taxAmount <= f.amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            save.mutate({
              date: f.date,
              accountId: f.accountId!,
              amount: f.amount,
              taxAmount: f.taxAmount,
              methodId: f.methodId!,
              supplierId: f.supplierId,
              payee: f.payee.trim() || null,
              reference: f.reference.trim() || null,
              note: f.note.trim() || null,
              locationId: f.locationId ?? null,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
            <DialogDescription>Paid immediately from the chosen payment method.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            {aiStatus.data?.receiptScan && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
                <p className="text-sm text-muted-foreground">
                  {scanned
                    ? `Filled from the receipt (${scanned.confidence} confidence). Check it before recording.`
                    : "Upload a receipt photo to fill this form."}
                </p>
                <Button type="button" variant="outline" size="sm" loading={scan.isPending} onClick={() => fileRef.current?.click()}>
                  <ScanLine /> Scan receipt
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) scan.mutate(file);
                  }}
                />
              </div>
            )}
            <FieldGrid>
              <Field label="Category" required className="sm:col-span-2">
                <AccountPicker value={f.accountId} onChange={(id) => set("accountId", id)} types={["expense"]} placeholder="Rent, utilities, salaries…" />
              </Field>
              <Field label="Amount (incl. tax)" required>
                <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} autoFocus />
              </Field>
              <Field label="Recoverable tax" hint="Input tax you can claim back" error={f.taxAmount > f.amount ? "More than the amount" : null}>
                <MoneyInput value={f.taxAmount} onChange={(v) => set("taxAmount", v)} />
              </Field>
              <Field label="Paid via" required>
                <PaymentMethodSelect value={f.methodId} onChange={(v) => set("methodId", v)} />
              </Field>
              <Field label="Date" htmlFor="ex-date">
                <Input id="ex-date" type="date" value={f.date} max={today} onChange={(e) => set("date", e.target.value)} />
              </Field>
              <Field label="Payee" htmlFor="ex-payee">
                <Input id="ex-payee" value={f.payee} onChange={(e) => set("payee", e.target.value)} placeholder="Landlord, electricity board…" />
              </Field>
              <Field label="Supplier (optional)">
                <SupplierPicker value={f.supplierId} onChange={(id) => set("supplierId", id)} />
              </Field>
              <Field label="Reference" htmlFor="ex-ref" hint="Bill or receipt number">
                <Input id="ex-ref" value={f.reference} onChange={(e) => set("reference", e.target.value)} />
              </Field>
              {activeLocations.length > 1 && (
                <Field label="Location">
                  <LocationSelect value={f.locationId} onChange={(v) => set("locationId", v)} />
                </Field>
              )}
              <Field label="Note" htmlFor="ex-note" className="sm:col-span-2">
                <Textarea id="ex-note" rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} />
              </Field>
            </FieldGrid>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!valid}>
              Record <Money value={f.amount} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (o: boolean) => void }) {
  const confirm = useConfirm();
  const { can } = useSession();
  const { data: e } = useApiQuery<Expense>(id ? `/expenses/${id}` : null);
  const voidIt = useApiMutation((reason: string) => api.post<Expense>(`/expenses/${id}/void`, { reason }), {
    invalidate: INVALIDATE,
    success: "Expense voided",
  });
  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="font-mono">{e?.number ?? "Expense"}</SheetTitle>
        </SheetHeader>
        {e ? (
          <>
            <SheetBody className="grid content-start gap-6">
              <div>
                <p className="label-caps">{e.accountName}</p>
                <p className="figure mt-1 text-4xl">
                  <Money value={e.amount} />
                </p>
                {e.status === "void" && (
                  <Badge variant="danger" className="mt-2">
                    Void
                  </Badge>
                )}
              </div>
              <KeyValue
                items={[
                  { label: "Date", value: formatDate(e.date) },
                  { label: "Category", value: `${e.accountCode ?? ""} · ${e.accountName ?? ""}` },
                  { label: "Recoverable tax", value: e.taxAmount ? <Money value={e.taxAmount} /> : null, hideEmpty: true },
                  { label: "Paid via", value: e.methodName },
                  { label: "Payee", value: e.payee, hideEmpty: true },
                  {
                    label: "Supplier",
                    value: e.supplierId ? (
                      <Link href={`/suppliers/view?id=${e.supplierId}`} className="text-primary hover:underline">
                        {e.supplierName}
                      </Link>
                    ) : null,
                    hideEmpty: true,
                  },
                  { label: "Reference", value: e.reference, hideEmpty: true },
                  { label: "Location", value: e.locationName, hideEmpty: true },
                  { label: "Recorded by", value: e.createdByName },
                  { label: "Recorded at", value: formatDateTime(e.createdAt) },
                  { label: "Note", value: e.note, hideEmpty: true },
                ]}
              />
            </SheetBody>
            {can("expenses.manage") && e.status !== "void" && (
              <SheetFooter>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={async () => {
                    const reason = await confirm({ title: `Void ${e.number}?`, tone: "destructive", requireReason: true, confirmText: "Void expense" });
                    if (typeof reason === "string") voidIt.mutate(reason);
                  }}
                >
                  <Ban /> Void expense
                </Button>
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
