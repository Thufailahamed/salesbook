"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Ban, CalendarPlus, KeyRound, Power } from "lucide-react";
import type { Plan, PlatformShopDetail, PlatformShopUpdateInput, PlatformShopUser, PlatformUserUpdateInput } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { DetailSkeleton, ErrorState } from "@/components/loading";
import { SectionCard } from "@/components/section-card";
import { KeyValue } from "@/components/key-value";

const KV = ({ label, value }: { label: React.ReactNode; value: React.ReactNode }) => <KeyValue items={[{ label, value }]} />;
import { Field } from "@/components/form-field";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { ORDER_STATE, SUB_STATE, lkr } from "@/lib/platform";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function Page() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <ShopView />
    </React.Suspense>
  );
}

function ShopView() {
  const id = useSearchParams().get("id");
  const confirm = useConfirm();
  const path = id ? `/platform/shops/${id}` : null;
  const { data: shop, isLoading, error, refetch } = useApiQuery<PlatformShopDetail>(path);
  const { data: plans } = useApiQuery<Plan[]>("/platform/plans");
  const [pwUser, setPwUser] = React.useState<PlatformShopUser | null>(null);
  const [pw, setPw] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");

  const update = useApiMutation((b: PlatformShopUpdateInput) => api.patch<PlatformShopDetail>(`/platform/shops/${id}`, b), { invalidate: ["/platform"], success: "Shop updated" });
  const userUpdate = useApiMutation((v: { id: string; body: PlatformUserUpdateInput }) => api.patch<PlatformShopDetail>(`/platform/users/${v.id}`, v.body), {
    invalidate: ["/platform"],
    success: "User updated",
    onSuccess: () => { setPwUser(null); setPw(""); },
  });

  if (!id) return <ErrorState title="Nothing selected" message="No shop selected." />;
  if (isLoading) return <DetailSkeleton />;
  if (error || !shop) return <ErrorState message={error?.message ?? "Shop not found"} onRetry={() => refetch()} />;
  const st = SUB_STATE[shop.subscription.state];
  const suspended = shop.status === "suspended";

  return (
    <>
      <PageHeader
        backHref="/admin/shops"
        breadcrumbs={[{ label: "Shops", href: "/admin/shops" }, { label: shop.name }]}
        title={shop.name}
        badge={<Badge variant={st.variant} dot>{st.label}</Badge>}
        description={`${shop.email ?? "No email"} · joined ${formatDate(shop.createdAt)}`}
        actions={
          <Button
            variant={suspended ? "default" : "outline"}
            loading={update.isPending}
            onClick={async () => {
              if (!suspended && !(await confirm({ title: `Suspend ${shop.name}?`, description: "Everyone in this shop is signed out and can't sign in until you reactivate it.", tone: "destructive", confirmText: "Suspend" }))) return;
              update.mutate({ status: suspended ? "active" : "suspended" });
            }}
          >
            {suspended ? <><Power /> Reactivate</> : <><Ban /> Suspend</>}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Subscription" className="lg:col-span-1">
          <div className="grid gap-4">
            <KV label="Plan" value={shop.planName ?? "—"} />
            <KV label="Ends" value={shop.subscriptionEndsAt ? `${formatDate(shop.subscriptionEndsAt)}${shop.subscription.daysLeft != null ? ` (${shop.subscription.daysLeft} days)` : ""}` : "No expiry"} />
            <Field label="Change plan">
              <Select value={shop.planId ?? "none"} onValueChange={(v) => update.mutate({ planId: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No plan</SelectItem>
                  {plans?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {lkr(p.priceCents)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              {[30, 90, 365].map((d) => <Button key={d} size="sm" variant="outline" onClick={() => update.mutate({ extendDays: d })}><CalendarPlus /> +{d}d</Button>)}
            </div>
            <Field label="Set end date" hint="Leave empty and save to remove the expiry.">
              <div className="flex gap-2">
                <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
                <Button variant="outline" onClick={() => update.mutate({ subscriptionEndsOn: endsOn || null })}>Save</Button>
              </div>
            </Field>
          </div>
        </SectionCard>
        <SectionCard title="Usage" className="lg:col-span-1">
          <div className="grid gap-3">
            <KV label="Invoices" value={shop.usage.invoices} />
            <KV label="Last invoice" value={shop.usage.lastInvoiceAt ? formatDateTime(shop.usage.lastInvoiceAt) : "Never"} />
            <KV label="Products" value={shop.usage.products} />
            <KV label="Customers" value={shop.usage.customers} />
            <KV label="Locations" value={shop.usage.locations} />
            <KV label="Currency · timezone" value={`${shop.currency} · ${shop.timezone}`} />
          </div>
        </SectionCard>
        <SectionCard title="Payments" className="lg:col-span-1" flush>
          {shop.orders.length === 0 ? <p className="px-6 py-5 text-[13px] text-muted-foreground">No plan payments.</p> : (
            <ul className="divide-y divide-border">
              {shop.orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-6 py-3 text-[13px]">
                  <span><span className="block font-medium">{o.planName} · {o.kind}</span><span className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</span></span>
                  <span className="flex items-center gap-2"><span className="num">{lkr(o.amount)}</span><Badge variant={ORDER_STATE[o.status].variant}>{ORDER_STATE[o.status].label}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Users" className="mt-6" flush>
        <Table>
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="hidden md:table-cell">Last sign-in</TableHead><TableHead>Status</TableHead><TableHead className="w-48" /></TableRow></TableHeader>
          <TableBody>
            {shop.users.map((u) => (
              <TableRow key={u.id}>
                <TableCell><span className="block font-medium">{u.name}</span><span className="text-xs text-muted-foreground">{u.email}</span></TableCell>
                <TableCell className="capitalize">{u.role}</TableCell>
                <TableCell className="hidden md:table-cell">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</TableCell>
                <TableCell><Badge variant={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Disabled"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="xs" variant="ghost" onClick={() => setPwUser(u)}><KeyRound /> Reset password</Button>
                  <Button size="xs" variant="ghost" onClick={() => userUpdate.mutate({ id: u.id, body: { isActive: !u.isActive } })}>{u.isActive ? "Disable" : "Enable"}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent size="sm">
          <form className="contents" onSubmit={(e) => { e.preventDefault(); if (pwUser && pw.length >= 8) userUpdate.mutate({ id: pwUser.id, body: { password: pw } }); }}>
            <DialogHeader><DialogTitle>Reset password for {pwUser?.name}</DialogTitle></DialogHeader>
            <DialogBody>
              <Field label="New password" hint="At least 8 characters. They are signed out of every device.">
                <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="off" />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwUser(null)}>Cancel</Button>
              <Button type="submit" loading={userUpdate.isPending} disabled={pw.length < 8}>Reset password</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
