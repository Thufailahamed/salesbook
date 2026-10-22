"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, MessageCircle, Send } from "lucide-react";
import type { MessageSendResult, MessageStatus, OverdueCustomer, RemindOverdueResult } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { EmptyState } from "@/components/empty-state";
import { PageLoader } from "@/components/loading";
import { Money } from "@/components/money";
import { SendMessageDialog } from "@/components/send-message-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { invalidatePaths, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useConfirm } from "@/components/confirm-dialog";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api, errorMessage } from "@/lib/api";
import { relativeTime } from "@/lib/utils";

export default function RemindersPage() {
  const { can } = useSession();
  const confirm = useConfirm();
  const money = useMoney();
  const qc = useQueryClient();
  const overdue = useApiQuery<OverdueCustomer[]>("/messaging/overdue");
  const status = useApiQuery<MessageStatus>("/messaging/status", undefined, { staleTime: 60_000 });
  const [picked, setPicked] = React.useState<Set<string> | null>(null);
  const [single, setSingle] = React.useState<string | null>(null);
  const [queue, setQueue] = React.useState<OverdueCustomer[] | null>(null);
  const [report, setReport] = React.useState<RemindOverdueResult | null>(null);

  const rows = overdue.data ?? [];
  // Until the user changes anything, everyone who can be messaged is ticked.
  const selected = picked ?? new Set(rows.filter((r) => r.phone).map((r) => r.customerId));
  const chosen = rows.filter((r) => selected.has(r.customerId) && r.phone);
  const chosenTotal = chosen.reduce((s, r) => s + r.overdueDue, 0);
  const smsReady = status.data?.smsReady ?? false;
  const canBulk = can("messaging.bulk");

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const sms = useApiMutation(
    (ids: string[]) => api.post<RemindOverdueResult>("/messaging/remind-overdue", { customerIds: ids, skipRecentHours: 24 }),
    {
      errorToast: true,
      onSuccess: async (r) => {
        setReport(r);
        await invalidatePaths(qc, ["/messaging"]);
      },
    },
  );

  if (overdue.isLoading) return <PageLoader />;

  return (
    <>
      <PageHeader
        backHref="/customers"
        breadcrumbs={[{ label: "Customers", href: "/customers" }, { label: "Overdue reminders" }]}
        title="Overdue reminders"
        description="Customers with invoices past their due date. Remind them in one tap by SMS, or one chat at a time on WhatsApp."
        actions={
          canBulk && (
            <>
              <Button variant="outline" disabled={chosen.length === 0} onClick={() => setQueue(chosen)}>
                <MessageCircle /> WhatsApp {chosen.length || ""}
              </Button>
              <Button
                disabled={chosen.length === 0 || !smsReady}
                loading={sms.isPending}
                title={smsReady ? undefined : "Set up SMS in Settings → Messaging"}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Send ${chosen.length} SMS reminder${chosen.length === 1 ? "" : "s"}?`,
                    description: `${money.format(chosenTotal)} is overdue across these customers. Anyone reminded in the last 24 hours is skipped.`,
                    confirmText: "Send reminders",
                  });
                  if (ok) sms.mutate(chosen.map((r) => r.customerId));
                }}
              >
                <Send /> Remind {chosen.length || ""} by SMS
              </Button>
            </>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={BellRing} title="Nobody is overdue" description="Customers with unpaid invoices past their due date will show up here." />
      ) : (
        <SectionCard
          title={`${rows.length} overdue customer${rows.length === 1 ? "" : "s"}`}
          description={
            <>
              Selected: {chosen.length} · <Money value={chosenTotal} /> overdue
              {!smsReady && " · SMS isn't set up, so reminders go through WhatsApp"}
            </>
          }
          flush
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10" />
                <TableHead>Customer</TableHead>
                <TableHead align="right">Overdue</TableHead>
                <TableHead align="right" className="hidden sm:table-cell">Total owed</TableHead>
                <TableHead className="hidden md:table-cell">Oldest</TableHead>
                <TableHead className="hidden md:table-cell">Last reminded</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.customerId} className="hover:bg-transparent">
                  <TableCell>
                    <Checkbox checked={selected.has(r.customerId) && !!r.phone} disabled={!r.phone} onCheckedChange={() => toggle(r.customerId)} aria-label={`Select ${r.name}`} />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-[12.5px] text-muted-foreground">{r.phone ? `+${r.phone}` : "No phone number"}</p>
                  </TableCell>
                  <TableCell align="right"><Money value={r.overdueDue} className="font-semibold text-destructive" /></TableCell>
                  <TableCell align="right" className="hidden sm:table-cell"><Money value={r.totalDue} /></TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{r.oldestDaysOverdue} days</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{r.lastRemindedAt ? relativeTime(r.lastRemindedAt) : "Never"}</TableCell>
                  <TableCell align="right">
                    <Button size="sm" variant="outline" onClick={() => setSingle(r.customerId)}>
                      Remind
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {single && (
        <SendMessageDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setSingle(null);
              void overdue.refetch();
            }
          }}
          kind="reminder"
          customerId={single}
        />
      )}
      <WhatsAppQueue customers={queue} onClose={() => { setQueue(null); void overdue.refetch(); }} />
      <SmsReport report={report} onClose={() => { setReport(null); void overdue.refetch(); }} />
    </>
  );
}

/** Opens each customer's WhatsApp chat in turn. One click = one chat, so the browser never blocks the new tab. */
function WhatsAppQueue({ customers, onClose }: { customers: OverdueCustomer[] | null; onClose: () => void }) {
  const [i, setI] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setI(0), [customers]);
  const current = customers?.[i];
  const done = !!customers && i >= customers.length;

  const openNext = async () => {
    if (!current) return;
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const res = await api.post<MessageSendResult>("/messaging/send", { kind: "reminder", customerId: current.customerId, channel: "whatsapp" });
      if (res.whatsappUrl && tab) tab.location.href = res.whatsappUrl;
      setI((n) => n + 1);
    } catch (e) {
      tab?.close();
      toast.error(`${current.name}: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!customers} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>WhatsApp reminders</DialogTitle>
          <DialogDescription>
            {done ? "All chats opened." : `${i} of ${customers?.length ?? 0} opened. Press send in each WhatsApp chat, then come back for the next.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {current ? (
            <div className="rounded-xl border border-border p-4">
              <p className="text-[12.5px] text-muted-foreground">Next</p>
              <p className="font-semibold">{current.name}</p>
              <p className="text-[13px] text-muted-foreground">
                <Money value={current.overdueDue} /> overdue · {current.oldestDaysOverdue} days
              </p>
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing left in the queue.</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{done ? "Close" : "Stop"}</Button>
          {current && (
            <Button onClick={openNext} loading={busy}>
              <MessageCircle /> Open chat
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SmsReport({ report, onClose }: { report: RemindOverdueResult | null; onClose: () => void }) {
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{report?.sent ?? 0} reminder{report?.sent === 1 ? "" : "s"} sent</DialogTitle>
          <DialogDescription>
            {report && report.failed.length + report.skipped.length > 0 ? "Some customers didn't get one:" : "Everyone selected was reminded."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-1.5 text-[13px]">
          {report?.failed.map((f) => (
            <p key={f.customerId} className="text-destructive">{f.name}: {f.error}</p>
          ))}
          {report?.skipped.map((s) => (
            <p key={s.customerId} className="text-muted-foreground">{s.name}: {s.reason}</p>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
