"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import type { Plan, PlanInput } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Field, FieldGrid, ToggleRow } from "@/components/form-field";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/api";
import { lkr, periodLabel } from "@/lib/platform";

export default function PlansPage() {
  const confirm = useConfirm();
  const { data, isLoading } = useApiQuery<Plan[]>("/platform/plans");
  const [editing, setEditing] = React.useState<Plan | "new" | null>(null);
  const del = useApiMutation((id: string) => api.del<{ deleted: boolean }>(`/platform/plans/${id}`), {
    invalidate: ["/platform"],
    success: (r) => (r.deleted ? "Plan deleted" : "Plan is in use, so it was deactivated instead"),
  });
  const columns: Column<Plan>[] = [
    { key: "n", header: "Plan", cell: (p) => <span className="block"><span className="block font-medium">{p.name}</span><span className="block max-w-72 truncate text-xs text-muted-foreground">{p.description}</span></span> },
    { key: "pr", header: "Price", numeric: true, cell: (p) => <span>{lkr(p.priceCents)} <span className="text-xs text-muted-foreground">/ {periodLabel(p.periodDays)}</span></span> },
    { key: "l", header: "Limits", hideBelow: "md", cell: (p) => <span className="text-[13px] text-muted-foreground">{p.maxUsers || "∞"} users · {p.maxLocations || "∞"} locations</span> },
    { key: "u", header: "Shops", numeric: true, hideBelow: "sm", cell: (p) => p.shopCount ?? 0 },
    { key: "s", header: "", cell: (p) => (!p.isActive ? <Badge variant="neutral">Inactive</Badge> : <Badge variant="success">On sale</Badge>) },
    {
      key: "a", header: "", width: 56,
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Actions" onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(p)}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={async () => { if (await confirm({ title: `Delete ${p.name}?`, description: "Plans with shops or payments are deactivated instead.", tone: "destructive", confirmText: "Delete" })) del.mutate(p.id); }}><Trash2 /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <>
      <PageHeader title="Plans" description="What new shops can buy. Prices are in LKR." actions={<Button onClick={() => setEditing("new")}><Plus /> New plan</Button>} />
      <DataTable columns={columns} rows={data} rowKey={(r) => r.id} loading={isLoading} onRowClick={(r) => setEditing(r)} empty={<EmptyState icon={Tags} title="No plans yet" description="Create a plan so new shops can sign up and pay." />} />
      <PlanDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} plan={editing === "new" ? null : editing} />
    </>
  );
}

function PlanDialog({ open, onOpenChange, plan }: { open: boolean; onOpenChange: (o: boolean) => void; plan: Plan | null }) {
  const [f, setF] = React.useState({ name: "", description: "", price: "", periodDays: "30", maxUsers: "0", maxLocations: "0", isActive: true });
  React.useEffect(() => {
    if (open) setF({ name: plan?.name ?? "", description: plan?.description ?? "", price: plan ? String(plan.priceCents / 100) : "", periodDays: String(plan?.periodDays ?? 30), maxUsers: String(plan?.maxUsers ?? 0), maxLocations: String(plan?.maxLocations ?? 0), isActive: plan?.isActive ?? true });
  }, [open, plan]);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const save = useApiMutation((b: PlanInput) => (plan ? api.put(`/platform/plans/${plan.id}`, b) : api.post("/platform/plans", b)), {
    invalidate: ["/platform"], success: "Plan saved", onSuccess: () => onOpenChange(false),
  });
  const body: PlanInput = { name: f.name.trim(), description: f.description.trim() || null, priceCents: Math.round(Number(f.price || 0) * 100), periodDays: Number(f.periodDays) || 30, maxUsers: Number(f.maxUsers) || 0, maxLocations: Number(f.maxLocations) || 0, isActive: f.isActive };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form className="contents" onSubmit={(e) => { e.preventDefault(); if (body.name) save.mutate(body); }}>
          <DialogHeader><DialogTitle>{plan ? "Edit plan" : "New plan"}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
            <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <FieldGrid>
              <Field label="Price (LKR)" hint="0 = free (not purchasable)"><Input inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value.replace(/[^0-9.]/g, ""))} /></Field>
              <Field label="Billing period (days)" hint="30 = monthly, 365 = yearly"><Input inputMode="numeric" value={f.periodDays} onChange={(e) => set("periodDays", e.target.value.replace(/\D/g, ""))} /></Field>
              <Field label="Max users" hint="0 = unlimited"><Input inputMode="numeric" value={f.maxUsers} onChange={(e) => set("maxUsers", e.target.value.replace(/\D/g, ""))} /></Field>
              <Field label="Max locations" hint="0 = unlimited"><Input inputMode="numeric" value={f.maxLocations} onChange={(e) => set("maxLocations", e.target.value.replace(/\D/g, ""))} /></Field>
            </FieldGrid>
            <ToggleRow title="On sale" description="Inactive plans can't be bought but existing shops keep them."><Switch checked={f.isActive} onCheckedChange={(v) => set("isActive", v)} /></ToggleRow>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!f.name.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
