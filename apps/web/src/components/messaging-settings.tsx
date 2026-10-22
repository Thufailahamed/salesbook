"use client";

import * as React from "react";
import { DEFAULT_MESSAGE_TEMPLATES, MESSAGE_KIND_LABELS, type MessageKind, type MessageSettings, type MessageSettingsInput } from "@shopbooks/shared";
import { SectionCard } from "@/components/section-card";
import { Field, ToggleRow } from "@/components/form-field";
import { PageLoader } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/api";

const PLACEHOLDERS: Record<MessageKind, string> = {
  receipt: "{customer} {shop} {invoice} {date} {total} {paid} {balance_line} {link_line}",
  reminder: "{customer} {shop} {amount} {count} {oldest} {link_line}",
  order_ready: "{customer} {shop} {invoice_part}",
};

/** Settings → Messaging: SMS account (Notify.lk), phone format, pay link, and the wording of each message. */
export function MessagingSettingsTab() {
  const { data, isLoading } = useApiQuery<MessageSettings>("/messaging/settings");
  const [provider, setProvider] = React.useState<"none" | "notify_lk">("none");
  const [userId, setUserId] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [senderId, setSenderId] = React.useState("");
  const [countryCode, setCountryCode] = React.useState("94");
  const [payLink, setPayLink] = React.useState(true);
  const [templates, setTemplates] = React.useState<Record<MessageKind, string>>(DEFAULT_MESSAGE_TEMPLATES);

  React.useEffect(() => {
    if (!data) return;
    setProvider(data.smsProvider);
    setUserId(data.notifyUserId ?? "");
    setApiKey("");
    setSenderId(data.senderId ?? "");
    setCountryCode(data.countryCode);
    setPayLink(data.includePayLink);
    setTemplates(data.templates);
  }, [data]);

  const save = useApiMutation((b: MessageSettingsInput) => api.put<MessageSettings>("/messaging/settings", b), {
    invalidate: ["/messaging"],
    success: "Messaging settings saved",
    errorToast: true,
  });
  if (isLoading || !data) return <PageLoader />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const same = (k: MessageKind) => (templates[k].trim() === DEFAULT_MESSAGE_TEMPLATES[k] ? null : templates[k]);
    save.mutate({
      smsProvider: provider,
      notifyUserId: userId || null,
      notifyApiKey: apiKey || null,
      senderId: senderId || null,
      countryCode,
      includePayLink: payLink,
      receiptTemplate: same("receipt"),
      reminderTemplate: same("reminder"),
      readyTemplate: same("order_ready"),
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-5">
      <SectionCard
        title="SMS"
        description="Send texts straight from ShopBooks through your own Notify.lk account. WhatsApp needs no setup: it opens a chat with the message already written."
      >
        <div className="grid max-w-xl gap-4">
          <Field label="SMS provider">
            <Select value={provider} onValueChange={(v) => setProvider(v as "none" | "notify_lk")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (WhatsApp only)</SelectItem>
                <SelectItem value="notify_lk">Notify.lk</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {provider === "notify_lk" && (
            <>
              <Field label="User ID" hint="From your Notify.lk dashboard.">
                <Input value={userId} onChange={(e) => setUserId(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="API key" hint={data.hasApiKey ? "Saved. Leave blank to keep it." : "From your Notify.lk dashboard."}>
                <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={data.hasApiKey ? "••••••••••••" : ""} />
              </Field>
              <Field label="Sender ID" hint="The name customers see (up to 11 characters). It must be approved in Notify.lk.">
                <Input maxLength={11} value={senderId} onChange={(e) => setSenderId(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Country code" hint="Added to numbers saved without one, e.g. 077 123 4567 becomes +94 77 123 4567.">
            <Input className="w-28 font-mono" inputMode="numeric" value={countryCode} onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
          <ToggleRow
            title="Add a pay link"
            description={
              data.payLinkAvailable
                ? "Receipts with a balance, and reminders for one open invoice, include a payments.lk link."
                : "Turn on online payments (Settings → Online payments) to use this."
            }
          >
            <Switch checked={payLink} onCheckedChange={setPayLink} disabled={!data.payLinkAvailable} />
          </ToggleRow>
        </div>
      </SectionCard>

      <SectionCard title="Wording" description="Edit what each message says. Placeholders in {braces} are filled in for every customer.">
        <div className="grid max-w-2xl gap-5">
          {(Object.keys(MESSAGE_KIND_LABELS) as MessageKind[]).map((k) => (
            <Field key={k} label={MESSAGE_KIND_LABELS[k]} hint={`Available: ${PLACEHOLDERS[k]}`}>
              <Textarea rows={3} value={templates[k]} onChange={(e) => setTemplates((t) => ({ ...t, [k]: e.target.value }))} />
              {templates[k].trim() !== DEFAULT_MESSAGE_TEMPLATES[k] && (
                <button type="button" className="mt-1 text-[12.5px] text-muted-foreground underline" onClick={() => setTemplates((t) => ({ ...t, [k]: DEFAULT_MESSAGE_TEMPLATES[k] }))}>
                  Reset to default
                </button>
              )}
            </Field>
          ))}
        </div>
      </SectionCard>
      <div>
        <Button type="submit" loading={save.isPending}>Save</Button>
      </div>
    </form>
  );
}
