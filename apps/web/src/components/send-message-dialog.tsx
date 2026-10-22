"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, MessageCircle, Send } from "lucide-react";
import { MESSAGE_KIND_LABELS, type MessageChannel, type MessageKind, type MessagePreview, type MessageSendResult, type MessageStatus } from "@shopbooks/shared";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/form-field";
import { useApiMutation, useApiQuery, invalidatePaths } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api, errorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Write and send one message to a customer (receipt, payment reminder or "order ready") by SMS or WhatsApp.
 * The wording comes from the server (Settings → Messaging) and can be edited before sending.
 * WhatsApp opens a chat with the text filled in; nothing is sent until the person presses send there.
 */
export function SendMessageDialog({
  open,
  onOpenChange,
  kind,
  customerId,
  invoiceId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: MessageKind;
  customerId?: string | null;
  invoiceId?: string | null;
}) {
  const { can } = useSession();
  const qc = useQueryClient();
  const status = useApiQuery<MessageStatus>(open ? "/messaging/status" : null, undefined, { staleTime: 60_000 });
  const preview = useApiMutation((input: { kind: MessageKind; customerId?: string | null; invoiceId?: string | null }) =>
    api.post<MessagePreview>("/messaging/preview", input), { errorToast: true });
  const [body, setBody] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [sending, setSending] = React.useState<MessageChannel | null>(null);

  React.useEffect(() => {
    if (!open) return;
    preview.mutate({ kind, customerId, invoiceId });
    // Compose again only when the dialog opens for a different message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, customerId, invoiceId]);

  React.useEffect(() => {
    if (preview.data) {
      setBody(preview.data.body);
      setPhone(preview.data.phone ? `+${preview.data.phone}` : "");
    }
  }, [preview.data]);

  const send = async (channel: MessageChannel) => {
    // Open the tab now (inside the click) so the browser doesn't block it once the request finishes.
    const tab = channel === "whatsapp" ? window.open("", "_blank") : null;
    setSending(channel);
    try {
      const res = await api.post<MessageSendResult>("/messaging/send", {
        kind,
        customerId,
        invoiceId,
        phone: phone.trim() || null,
        channel,
        body: body.trim(),
      });
      await invalidatePaths(qc, ["/messaging"]);
      if (res.whatsappUrl && tab) tab.location.href = res.whatsappUrl;
      else toast.success("Message sent");
      onOpenChange(false);
    } catch (e) {
      tab?.close();
      toast.error(errorMessage(e));
    } finally {
      setSending(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };

  const data = preview.data;
  const smsReady = status.data?.smsReady ?? false;
  const ready = !!body.trim() && !!phone.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-4 text-primary" /> {MESSAGE_KIND_LABELS[kind]}
          </DialogTitle>
          <DialogDescription>
            {data ? (data.customerName ? `To ${data.customerName}` : "To the number below") : "Writing the message…"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {preview.isPending || !data ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            <>
              <Field label="Phone number" htmlFor="msg-phone" hint={data.phone ? undefined : "No number saved for this customer. Enter one to send."}>
                <Input id="msg-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+94 77 123 4567" />
              </Field>
              <Field label="Message" htmlFor="msg-body" hint={`${body.length} characters${body.length > 160 ? " · sent as several SMS" : ""}`}>
                <Textarea id="msg-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
              </Field>
              {!smsReady && (
                <p className="text-[13px] text-muted-foreground">
                  SMS isn&apos;t set up yet.{" "}
                  {can("settings.manage") && (
                    <Link href="/settings" className="text-primary underline underline-offset-2">
                      Add Notify.lk in Settings → Messaging
                    </Link>
                  )}
                </p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={copy} disabled={!body.trim()}>
            <Copy /> Copy
          </Button>
          <Button variant="outline" onClick={() => send("whatsapp")} loading={sending === "whatsapp"} disabled={!ready || !!sending}>
            <MessageCircle /> WhatsApp
          </Button>
          <Button onClick={() => send("sms")} loading={sending === "sms"} disabled={!ready || !smsReady || !!sending}>
            <Send /> Send SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
