"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import type { PlatformAdmin, PlatformAdminCreateInput, PlatformSettings, PlatformSettingsInput } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Field, FieldGrid, ToggleRow } from "@/components/form-field";
import { PageLoader } from "@/components/loading";
import { useAdmin } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="How the platform charges for plans, and who can manage it." />
      <div className="grid gap-6">
        <GatewayCard />
        <AdminsCard />
      </div>
    </>
  );
}

function GatewayCard() {
  const { data } = useApiQuery<PlatformSettings>("/platform/settings");
  const [requirePayment, setRequire] = React.useState(false);
  const [isEnabled, setEnabled] = React.useState(false);
  const [secretKey, setSecret] = React.useState("");
  const [webhookSecret, setWebhook] = React.useState("");
  React.useEffect(() => {
    if (data) { setRequire(data.requirePayment); setEnabled(data.isEnabled); setSecret(""); setWebhook(""); }
  }, [data]);
  const save = useApiMutation((b: PlatformSettingsInput) => api.put<PlatformSettings>("/platform/settings", b), { invalidate: ["/platform/settings"], success: "Settings saved" });
  if (!data) return <PageLoader />;
  return (
    <SectionCard title="payments.lk — selling the system" description="New shops pay for a plan through this account. The shop is created automatically once the signed webhook confirms the payment.">
      <form className="grid max-w-xl gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ requirePayment, isEnabled, secretKey: secretKey || null, webhookSecret: webhookSecret || null }); }}>
        <ToggleRow title="Accept payments" description="Allows buying and renewing plans online."><Switch checked={isEnabled} onCheckedChange={setEnabled} /></ToggleRow>
        <ToggleRow title="Require payment to sign up" description="Closes free sign-up. New shops must choose a plan and pay first."><Switch checked={requirePayment} onCheckedChange={setRequire} /></ToggleRow>
        <Field label="Secret key" hint={data.hasSecretKey ? `Saved (${data.mode} mode). Leave blank to keep it.` : "sk_test_… or sk_live_… from the payments.lk dashboard."}>
          <Input type="password" autoComplete="off" value={secretKey} onChange={(e) => setSecret(e.target.value)} placeholder={data.hasSecretKey ? "••••••••••••" : "sk_test_…"} />
        </Field>
        <Field label="Webhook signing secret" hint={data.hasWebhookSecret ? "Saved. Leave blank to keep it." : "Shown when you create the webhook endpoint."}>
          <Input type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhook(e.target.value)} placeholder={data.hasWebhookSecret ? "••••••••••••" : "whsec_…"} />
        </Field>
        <Field label="Webhook endpoint" hint="Add in payments.lk and subscribe to payment.succeeded, payment.failed and checkout.expired.">
          <Input readOnly className="font-mono text-[12.5px]" value={data.webhookUrl} onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <div><Button type="submit" loading={save.isPending}>Save</Button></div>
      </form>
    </SectionCard>
  );
}

function AdminsCard() {
  const me = useAdmin();
  const { data } = useApiQuery<PlatformAdmin[]>("/platform/admins");
  const [open, setOpen] = React.useState(false);
  const toggle = useApiMutation((a: PlatformAdmin) => api.patch(`/platform/admins/${a.id}`, { isActive: !a.isActive }), { invalidate: ["/platform/admins"], success: "Admin updated" });
  return (
    <SectionCard title="Platform admins" action={<Button size="sm" onClick={() => setOpen(true)}><Plus /> Add admin</Button>} flush>
      <Table>
        <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Last sign-in</TableHead><TableHead>Status</TableHead><TableHead className="w-28" /></TableRow></TableHeader>
        <TableBody>
          {data?.map((a) => (
            <TableRow key={a.id}>
              <TableCell><span className="block font-medium">{a.name}{a.id === me.id && " (you)"}</span><span className="text-xs text-muted-foreground">{a.email}</span></TableCell>
              <TableCell className="hidden sm:table-cell">{a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "Never"}</TableCell>
              <TableCell><Badge variant={a.isActive ? "success" : "neutral"}>{a.isActive ? "Active" : "Disabled"}</Badge></TableCell>
              <TableCell className="text-right">{a.id !== me.id && <Button size="xs" variant="ghost" onClick={() => toggle.mutate(a)}>{a.isActive ? "Disable" : "Enable"}</Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <AdminDialog open={open} onOpenChange={setOpen} />
    </SectionCard>
  );
}

function AdminDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [f, setF] = React.useState({ name: "", email: "", password: "" });
  React.useEffect(() => { if (open) setF({ name: "", email: "", password: "" }); }, [open]);
  const save = useApiMutation((b: PlatformAdminCreateInput) => api.post("/platform/admins", b), { invalidate: ["/platform/admins"], success: "Admin added", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form className="contents" onSubmit={(e) => { e.preventDefault(); save.mutate(f); }}>
          <DialogHeader><DialogTitle>Add platform admin</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <FieldGrid cols={1}>
              <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Password" hint="At least 8 characters"><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            </FieldGrid>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!f.name || !f.email || f.password.length < 8}>Add admin</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
