"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Building2, CreditCard, Gem, Globe, Hash, MapPin, MoreHorizontal, Pencil, Percent, Plus, Trash2 } from "lucide-react";
import type { GatewaySettings, GatewaySettingsInput, Business, BusinessSettingsInput, Location, LocationInput, PaymentMethod, PaymentMethodInput, Sequence, TaxRate, TaxRateInput } from "@shopbooks/shared";
import { CURRENCIES, PAYMENT_METHOD_TYPES, PAYMENT_METHOD_TYPE_LABELS, SEQUENCE_DEFAULTS, type PaymentMethodType } from "@shopbooks/shared";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Field, FieldGrid, ToggleRow } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { PercentInput } from "@/components/money-input";
import { AccountPicker } from "@/components/account-picker";
import { PageLoader } from "@/components/loading";
import { useConfirm } from "@/components/confirm-dialog";
import { PAYMENT_METHOD_ICONS, PaymentMethodSelect } from "@/components/entity-selects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api, assetUrl, errorMessage } from "@/lib/api";
import { toast } from "sonner";
import { BillingPanel } from "@/components/billing-panel";

export default function Page() {
  return (
    <React.Suspense fallback={<PageLoader />}>
      <SettingsPage />
    </React.Suspense>
  );
}

function SettingsPage() {
  const params = useSearchParams();
  const [tab, setTab] = React.useState(params.get("tab") ?? "business");
  const { can } = useSession();
  return (
    <>
      <PageHeader title="Settings" description="Your business, locations, taxes, payment methods and numbering." />
      <Tabs value={tab} onValueChange={setTab} variant="underline">
        <TabsList>
          <TabsTrigger value="business"><Building2 /> Business</TabsTrigger>
          <TabsTrigger value="locations"><MapPin /> Locations</TabsTrigger>
          <TabsTrigger value="taxes"><Percent /> Taxes</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard /> Payment methods</TabsTrigger>
          <TabsTrigger value="online"><Globe /> Online payments</TabsTrigger>
          <TabsTrigger value="billing"><Gem /> Subscription</TabsTrigger>
          <TabsTrigger value="numbering"><Hash /> Numbering</TabsTrigger>
        </TabsList>
        <TabsContent value="business"><BusinessTab /></TabsContent>
        <TabsContent value="locations"><LocationsTab /></TabsContent>
        <TabsContent value="taxes"><TaxesTab /></TabsContent>
        <TabsContent value="payments"><PaymentMethodsTab /></TabsContent>
        <TabsContent value="online"><OnlinePaymentsTab /></TabsContent>
        <TabsContent value="billing"><BillingPanel canManage={can("settings.manage")} /></TabsContent>
        <TabsContent value="numbering"><NumberingTab /></TabsContent>
      </Tabs>
    </>
  );
}

// ---------------------------------------------------------------- business

function BusinessTab() {
  const { refresh, taxRates } = useSession();
  const { data } = useApiQuery<Business>("/settings/business", undefined, { staleTime: 0 });
  const [f, setF] = React.useState<Business | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (data) setF(data);
  }, [data]);
  const save = useApiMutation((body: BusinessSettingsInput) => api.put<Business>("/settings/business", body), {
    invalidate: ["/settings"],
    success: "Settings saved",
    onSuccess: () => refresh(),
  });
  if (!f) return <PageLoader />;
  const set = <K extends keyof Business>(k: K, v: Business[K]) => setF((p) => (p ? { ...p, [k]: v } : p));
  const text = (k: keyof Business) => ({ value: (f[k] as string | null) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, (e.target.value || null) as never) });

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file");
    setUploading(true);
    try {
      const r = await api.upload(file);
      set("logoUrl", r.url);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    const { id: _id, createdAt: _c, ...body } = f;
    void _id; void _c;
    save.mutate(body as BusinessSettingsInput);
  };

  return (
    <div className="grid max-w-4xl gap-6">
      <SectionCard title="Business profile" description="Shown on invoices, receipts and statements.">
        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-muted-foreground">
              {f.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(f.logoUrl)!} alt="" className="size-full object-contain" />
              ) : (
                <Building2 />
              )}
            </span>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) void upload(x); e.target.value = ""; }} />
            <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>Upload logo</Button>
            {f.logoUrl && <Button variant="ghost" size="sm" onClick={() => set("logoUrl", null)}>Remove</Button>}
          </div>
          <FieldGrid>
            <Field label="Business name" htmlFor="b-name" required><Input id="b-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Legal name" htmlFor="b-legal"><Input id="b-legal" {...text("legalName")} /></Field>
            <Field label="Phone" htmlFor="b-phone"><Input id="b-phone" {...text("phone")} /></Field>
            <Field label="Email" htmlFor="b-email"><Input id="b-email" type="email" {...text("email")} /></Field>
            <Field label="Website" htmlFor="b-web"><Input id="b-web" {...text("website")} /></Field>
            <Field label="Tax / VAT number" htmlFor="b-tax"><Input id="b-tax" {...text("taxNumber")} /></Field>
            <Field label="Address" htmlFor="b-addr" className="sm:col-span-2"><Textarea id="b-addr" rows={2} {...text("address")} /></Field>
            <Field label="City" htmlFor="b-city"><Input id="b-city" {...text("city")} /></Field>
            <Field label="Country" htmlFor="b-country"><Input id="b-country" {...text("country")} /></Field>
          </FieldGrid>
        </div>
      </SectionCard>

      <SectionCard title="Regional" description="Currency affects how every amount is displayed.">
        <FieldGrid cols={3}>
          <Field label="Currency">
            <Select value={f.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Locale" htmlFor="b-locale" hint="e.g. en-US, en-LK"><Input id="b-locale" value={f.locale} onChange={(e) => set("locale", e.target.value)} /></Field>
          <Field label="Time zone" htmlFor="b-tz" hint="IANA name, e.g. Asia/Colombo"><Input id="b-tz" value={f.timezone} onChange={(e) => set("timezone", e.target.value)} /></Field>
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Sales & inventory">
        <div className="-my-3 divide-y divide-border/70">
          <ToggleRow title="Prices include tax" description="Selling prices already contain tax. Turn off to add tax on top.">
            <Switch checked={f.taxInclusive} onCheckedChange={(v) => set("taxInclusive", v)} />
          </ToggleRow>
          <ToggleRow title="Allow negative stock" description="Let the POS sell items that are out of stock.">
            <Switch checked={f.allowNegativeStock} onCheckedChange={(v) => set("allowNegativeStock", v)} />
          </ToggleRow>
          <ToggleRow title="Require an open register shift" description="Cashiers must open a shift before taking payments.">
            <Switch checked={f.requireShift} onCheckedChange={(v) => set("requireShift", v)} />
          </ToggleRow>
        </div>
        <FieldGrid cols={3} className="mt-5">
          <Field label="Default tax rate">
            <Select value={f.defaultTaxRateId ?? "__none__"} onValueChange={(v) => set("defaultTaxRateId", v === "__none__" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No tax</SelectItem>
                {taxRates.filter((t) => t.isActive).map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cash rounding" hint="Round totals to the nearest… (0 = off)"><MoneyInput value={f.roundingIncrement} onChange={(v) => set("roundingIncrement", v)} /></Field>
          <Field label="Low-stock threshold" htmlFor="b-low" hint="When a product has no reorder level">
            <Input id="b-low" inputMode="numeric" className="num" value={String(f.lowStockThreshold)} onChange={(e) => set("lowStockThreshold", Number(e.target.value.replace(/\D/g, "") || 0))} />
          </Field>
          <Field label="Return window (days)" htmlFor="b-ret" hint="0 = no limit">
            <Input id="b-ret" inputMode="numeric" className="num" value={String(f.returnWindowDays)} onChange={(e) => set("returnWindowDays", Number(e.target.value.replace(/\D/g, "") || 0))} />
          </Field>
          <Field label="Credit due (days)" htmlFor="b-credit" hint="Default term for sales on credit">
            <Input id="b-credit" inputMode="numeric" className="num" value={String(f.creditDueDays)} onChange={(e) => set("creditDueDays", Number(e.target.value.replace(/\D/g, "") || 0))} />
          </Field>
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Loyalty points">
        <ToggleRow title="Enable loyalty" description="Customers earn points on purchases and can redeem them at the POS.">
          <Switch checked={f.loyaltyEnabled} onCheckedChange={(v) => set("loyaltyEnabled", v)} />
        </ToggleRow>
        {f.loyaltyEnabled && (
          <FieldGrid cols={3} className="mt-3">
            <Field label="Spend per point" hint="Amount spent to earn 1 point"><MoneyInput value={f.loyaltyEarnPer} onChange={(v) => set("loyaltyEarnPer", Math.max(1, v))} /></Field>
            <Field label="Value of one point"><MoneyInput value={f.loyaltyPointValue} onChange={(v) => set("loyaltyPointValue", v)} /></Field>
            <Field label="Minimum to redeem" htmlFor="b-minred" hint="Points">
              <Input id="b-minred" inputMode="numeric" className="num" value={String(f.loyaltyMinRedeem)} onChange={(e) => set("loyaltyMinRedeem", Number(e.target.value.replace(/\D/g, "") || 0))} />
            </Field>
          </FieldGrid>
        )}
      </SectionCard>

      <SectionCard title="Printing">
        <div className="grid gap-4">
          <Field label="Receipt paper" className="max-w-xs">
            <Select value={f.receiptWidth} onValueChange={(v) => set("receiptWidth", v as Business["receiptWidth"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="80mm">80 mm thermal</SelectItem>
                <SelectItem value="58mm">58 mm thermal</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Receipt footer" htmlFor="b-rfoot"><Textarea id="b-rfoot" rows={2} {...text("receiptFooter")} placeholder="Thank you for shopping with us!" /></Field>
          <Field label="Invoice footer" htmlFor="b-ifoot"><Textarea id="b-ifoot" rows={2} {...text("invoiceFooter")} /></Field>
          <Field label="Invoice terms" htmlFor="b-terms"><Textarea id="b-terms" rows={3} {...text("invoiceTerms")} /></Field>
        </div>
      </SectionCard>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" onClick={submit} loading={save.isPending} disabled={!f.name.trim()} className="shadow-raised">Save settings</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- locations

function LocationsTab() {
  const confirm = useConfirm();
  const { refresh } = useSession();
  const { data, isLoading } = useApiQuery<Location[]>("/settings/locations");
  const [editing, setEditing] = React.useState<Location | "new" | null>(null);
  const del = useApiMutation((id: string) => api.del(`/settings/locations/${id}`), { invalidate: ["/settings"], success: "Location removed", onSuccess: () => refresh() });
  const columns: Column<Location>[] = [
    {
      key: "name",
      header: "Location",
      cell: (l) => (
        <div>
          <p className="font-medium">{l.name}{l.code && <span className="ml-2 font-mono text-[11.5px] text-muted-foreground">{l.code}</span>}</p>
          <p className="text-xs text-muted-foreground">{[l.address, l.phone].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "status", header: "", cell: (l) => <span className="flex gap-1.5">{l.isDefault && <Badge variant="primary">Default</Badge>}{!l.isActive && <Badge variant="neutral">Inactive</Badge>}</span> },
    {
      key: "a",
      header: "",
      width: 56,
      cell: (l) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Actions" onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(l)}><Pencil /> Edit</DropdownMenuItem>
            {!l.isDefault && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => { if (await confirm({ title: `Remove ${l.name}?`, description: "Locations with stock or sales history are deactivated instead.", tone: "destructive", confirmText: "Remove" })) del.mutate(l.id); }}
              >
                <Trash2 /> Remove
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => setEditing(r)}
        toolbar={<Button size="sm" className="sm:ml-auto" onClick={() => setEditing("new")}><Plus /> Add location</Button>}
        empty={<EmptyState icon={MapPin} title="No locations" />}
      />
      <LocationDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} location={editing === "new" ? null : editing} />
    </>
  );
}

function LocationDialog({ open, onOpenChange, location }: { open: boolean; onOpenChange: (o: boolean) => void; location: Location | null }) {
  const { refresh } = useSession();
  const [f, setF] = React.useState({ name: "", code: "", address: "", phone: "", isDefault: false, isActive: true });
  React.useEffect(() => {
    if (open) setF({ name: location?.name ?? "", code: location?.code ?? "", address: location?.address ?? "", phone: location?.phone ?? "", isDefault: location?.isDefault ?? false, isActive: location?.isActive ?? true });
  }, [open, location]);
  const save = useApiMutation((b: LocationInput) => (location ? api.put(`/settings/locations/${location.id}`, b) : api.post("/settings/locations", b)), {
    invalidate: ["/settings"],
    success: "Location saved",
    onSuccess: async () => { await refresh(); onOpenChange(false); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form className="contents" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) save.mutate({ name: f.name.trim(), code: f.code.trim() || null, address: f.address.trim() || null, phone: f.phone.trim() || null, isDefault: f.isDefault, isActive: f.isActive }); }}>
          <DialogHeader><DialogTitle>{location ? "Edit location" : "Add location"}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <FieldGrid>
              <Field label="Name" htmlFor="l-name" required><Input id="l-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
              <Field label="Code" htmlFor="l-code"><Input id="l-code" className="font-mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
            </FieldGrid>
            <Field label="Address" htmlFor="l-addr"><Textarea id="l-addr" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="l-phone"><Input id="l-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <div className="-my-2 divide-y divide-border/70">
              <ToggleRow title="Default location" description="Used for new sales and purchases."><Switch checked={f.isDefault} disabled={location?.isDefault} onCheckedChange={(v) => setF({ ...f, isDefault: v })} /></ToggleRow>
              {location && <ToggleRow title="Active"><Switch checked={f.isActive} disabled={location.isDefault} onCheckedChange={(v) => setF({ ...f, isActive: v })} /></ToggleRow>}
            </div>
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

// ---------------------------------------------------------------- taxes

function TaxesTab() {
  const confirm = useConfirm();
  const { refresh } = useSession();
  const { data, isLoading } = useApiQuery<TaxRate[]>("/settings/tax-rates");
  const [editing, setEditing] = React.useState<TaxRate | "new" | null>(null);
  const del = useApiMutation((id: string) => api.del(`/settings/tax-rates/${id}`), { invalidate: ["/settings"], success: "Tax rate removed", onSuccess: () => refresh() });
  const columns: Column<TaxRate>[] = [
    { key: "name", header: "Tax", cell: (t) => <span className="font-medium">{t.name}</span> },
    { key: "rate", header: "Rate", numeric: true, cell: (t) => `${t.rate}%` },
    { key: "s", header: "", cell: (t) => <span className="flex gap-1.5">{t.isDefault && <Badge variant="primary">Default</Badge>}{!t.isActive && <Badge variant="neutral">Inactive</Badge>}</span> },
    {
      key: "a",
      header: "",
      width: 56,
      cell: (t) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Actions" onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(t)}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={async () => { if (await confirm({ title: `Remove ${t.name}?`, tone: "destructive", confirmText: "Remove" })) del.mutate(t.id); }}><Trash2 /> Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => setEditing(r)}
        toolbar={<Button size="sm" className="sm:ml-auto" onClick={() => setEditing("new")}><Plus /> Add tax rate</Button>}
        empty={<EmptyState icon={Percent} title="No tax rates" description="Add the tax rates that apply to your products." />}
      />
      <TaxDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} tax={editing === "new" ? null : editing} />
    </>
  );
}

function TaxDialog({ open, onOpenChange, tax }: { open: boolean; onOpenChange: (o: boolean) => void; tax: TaxRate | null }) {
  const { refresh } = useSession();
  const [name, setName] = React.useState("");
  const [rate, setRate] = React.useState(0);
  const [isDefault, setIsDefault] = React.useState(false);
  const [isActive, setIsActive] = React.useState(true);
  React.useEffect(() => {
    if (open) { setName(tax?.name ?? ""); setRate(tax?.rate ?? 0); setIsDefault(tax?.isDefault ?? false); setIsActive(tax?.isActive ?? true); }
  }, [open, tax]);
  const save = useApiMutation((b: TaxRateInput) => (tax ? api.put(`/settings/tax-rates/${tax.id}`, b) : api.post("/settings/tax-rates", b)), {
    invalidate: ["/settings"],
    success: "Tax rate saved",
    onSuccess: async () => { await refresh(); onOpenChange(false); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form className="contents" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate({ name: name.trim(), rate, isDefault, isActive }); }}>
          <DialogHeader><DialogTitle>{tax ? "Edit tax rate" : "Add tax rate"}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Name" htmlFor="t-name" required><Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="VAT, GST, Sales tax…" autoFocus /></Field>
            <Field label="Rate" required><PercentInput value={rate} onChange={setRate} /></Field>
            <div className="-my-2 divide-y divide-border/70">
              <ToggleRow title="Default for new products"><Switch checked={isDefault} onCheckedChange={setIsDefault} /></ToggleRow>
              {tax && <ToggleRow title="Active"><Switch checked={isActive} onCheckedChange={setIsActive} /></ToggleRow>}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!name.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- payment methods

function PaymentMethodsTab() {
  const confirm = useConfirm();
  const { refresh } = useSession();
  const { data, isLoading } = useApiQuery<PaymentMethod[]>("/settings/payment-methods");
  const [editing, setEditing] = React.useState<PaymentMethod | "new" | null>(null);
  const del = useApiMutation((id: string) => api.del(`/settings/payment-methods/${id}`), { invalidate: ["/settings"], success: "Payment method removed", onSuccess: () => refresh() });
  const columns: Column<PaymentMethod>[] = [
    {
      key: "name",
      header: "Method",
      cell: (m) => {
        const Icon = PAYMENT_METHOD_ICONS[m.type];
        return <span className="flex items-center gap-2.5 font-medium"><Icon className="size-4 text-muted-foreground" />{m.name}</span>;
      },
    },
    { key: "type", header: "Type", hideBelow: "sm", cell: (m) => <span className="text-[13px] text-muted-foreground">{PAYMENT_METHOD_TYPE_LABELS[m.type]}</span> },
    { key: "acc", header: "Settles into", hideBelow: "md", cell: (m) => <span className="text-[13px]">{m.accountName ?? "—"}</span> },
    { key: "s", header: "", cell: (m) => (!m.isActive ? <Badge variant="neutral">Inactive</Badge> : null) },
    {
      key: "a",
      header: "",
      width: 56,
      cell: (m) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Actions" onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(m)}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={async () => { if (await confirm({ title: `Remove ${m.name}?`, description: "Methods already used on payments are deactivated instead.", tone: "destructive", confirmText: "Remove" })) del.mutate(m.id); }}><Trash2 /> Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => setEditing(r)}
        toolbar={<Button size="sm" className="sm:ml-auto" onClick={() => setEditing("new")}><Plus /> Add method</Button>}
        empty={<EmptyState icon={CreditCard} title="No payment methods" />}
      />
      <MethodDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} method={editing === "new" ? null : editing} />
    </>
  );
}

function MethodDialog({ open, onOpenChange, method }: { open: boolean; onOpenChange: (o: boolean) => void; method: PaymentMethod | null }) {
  const { refresh } = useSession();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<PaymentMethodType>("card");
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [isActive, setIsActive] = React.useState(true);
  React.useEffect(() => {
    if (open) { setName(method?.name ?? ""); setType(method?.type ?? "card"); setAccountId(method?.accountId ?? null); setIsActive(method?.isActive ?? true); }
  }, [open, method]);
  const save = useApiMutation((b: PaymentMethodInput) => (method ? api.put(`/settings/payment-methods/${method.id}`, b) : api.post("/settings/payment-methods", b)), {
    invalidate: ["/settings", "/accounting"],
    success: "Payment method saved",
    onSuccess: async () => { await refresh(); onOpenChange(false); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form className="contents" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate({ name: name.trim(), type, accountId, isActive }); }}>
          <DialogHeader><DialogTitle>{method ? "Edit payment method" : "Add payment method"}</DialogTitle></DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Name" htmlFor="m-name" required><Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
            <Field label="Type">
              <Select value={type} onValueChange={(v) => setType(v as PaymentMethodType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHOD_TYPES.map((t) => <SelectItem key={t} value={t}>{PAYMENT_METHOD_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Settles into account" hint="Leave blank to use the default account for this type.">
              <AccountPicker value={accountId} onChange={(id) => setAccountId(id)} types={["asset"]} subtypes={["cash", "bank"]} clearable />
            </Field>
            {method && <ToggleRow title="Active"><Switch checked={isActive} onCheckedChange={setIsActive} /></ToggleRow>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={!name.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- online payments (payments.lk)

function OnlinePaymentsTab() {
  const { data, isLoading } = useApiQuery<GatewaySettings>("/gateway/settings");
  const [enabled, setEnabled] = React.useState(false);
  const [secretKey, setSecretKey] = React.useState("");
  const [webhookSecret, setWebhookSecret] = React.useState("");
  const [methodId, setMethodId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (data) { setEnabled(data.isEnabled); setMethodId(data.methodId); setSecretKey(""); setWebhookSecret(""); }
  }, [data]);
  const save = useApiMutation((b: GatewaySettingsInput) => api.put<GatewaySettings>("/gateway/settings", b), {
    invalidate: ["/gateway"],
    success: "Online payment settings saved",
  });
  if (isLoading || !data) return <PageLoader />;
  return (
    <SectionCard title="payments.lk" description="Accept card payments on invoices through a hosted payments.lk checkout. Paid invoices are settled automatically from the signed webhook.">
      <form
        className="grid max-w-xl gap-4"
        onSubmit={(e) => { e.preventDefault(); save.mutate({ isEnabled: enabled, secretKey: secretKey || null, webhookSecret: webhookSecret || null, methodId }); }}
      >
        <ToggleRow title="Enable online payments" description="Shows “Pay online” on unpaid invoices.">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </ToggleRow>
        <Field label="Secret key" hint={data.hasSecretKey ? `Saved (${data.mode} mode). Leave blank to keep it.` : "From the payments.lk dashboard — starts with sk_test_ or sk_live_."}>
          <Input type="password" autoComplete="off" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={data.hasSecretKey ? "••••••••••••" : "sk_test_…"} />
        </Field>
        <Field label="Webhook signing secret" hint={data.hasWebhookSecret ? "Saved. Leave blank to keep it." : "Shown when you create the webhook endpoint."}>
          <Input type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={data.hasWebhookSecret ? "••••••••••••" : "whsec_…"} />
        </Field>
        <Field label="Record receipts as" hint="Payment method (and ledger account) that online receipts settle into.">
          <PaymentMethodSelect value={methodId} onChange={setMethodId} />
        </Field>
        <Field label="Webhook endpoint" hint="Add this URL in the payments.lk dashboard and subscribe to payment.succeeded, payment.failed and checkout.expired.">
          <Input readOnly className="font-mono text-[12.5px]" value={data.webhookUrl} onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <div><Button type="submit" loading={save.isPending}>Save</Button></div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- numbering

function NumberingTab() {
  const { data, isLoading } = useApiQuery<Sequence[]>("/settings/sequences");
  const [drafts, setDrafts] = React.useState<Record<string, { prefix: string; nextValue: number; padding: number }>>({});
  React.useEffect(() => {
    if (data) setDrafts(Object.fromEntries(data.map((s) => [s.key, { prefix: s.prefix, nextValue: s.nextValue, padding: s.padding }])));
  }, [data]);
  const save = useApiMutation((v: { key: string; prefix: string; nextValue: number; padding: number }) => api.put(`/settings/sequences/${v.key}`, { prefix: v.prefix, nextValue: v.nextValue, padding: v.padding }), {
    invalidate: ["/settings/sequences"],
    success: "Numbering saved",
  });
  if (isLoading || !data) return <PageLoader />;
  return (
    <SectionCard title="Document numbering" description="Change prefixes and where each series continues. Numbers can only move forward." flush>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Document</TableHead><TableHead className="w-32">Prefix</TableHead><TableHead className="w-32">Next number</TableHead><TableHead className="w-24">Digits</TableHead><TableHead className="hidden sm:table-cell">Preview</TableHead><TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((s) => {
            const d = drafts[s.key] ?? s;
            const dirty = d.prefix !== s.prefix || d.nextValue !== s.nextValue || d.padding !== s.padding;
            return (
              <TableRow key={s.key} className="hover:bg-transparent">
                <TableCell className="font-medium">{SEQUENCE_DEFAULTS[s.key]?.label ?? s.key}</TableCell>
                <TableCell><Input className="h-8 font-mono" value={d.prefix} onChange={(e) => setDrafts((x) => ({ ...x, [s.key]: { ...d, prefix: e.target.value } }))} /></TableCell>
                <TableCell><Input className="num h-8" inputMode="numeric" value={String(d.nextValue)} onChange={(e) => setDrafts((x) => ({ ...x, [s.key]: { ...d, nextValue: Math.max(s.nextValue, Number(e.target.value.replace(/\D/g, "") || 0)) } }))} /></TableCell>
                <TableCell><Input className="num h-8" inputMode="numeric" value={String(d.padding)} onChange={(e) => setDrafts((x) => ({ ...x, [s.key]: { ...d, padding: Math.min(12, Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1))) } }))} /></TableCell>
                <TableCell className="hidden font-mono text-[12.5px] text-muted-foreground sm:table-cell">{d.prefix}{String(d.nextValue).padStart(d.padding, "0")}</TableCell>
                <TableCell>{dirty && <Button size="xs" loading={save.isPending && save.variables?.key === s.key} onClick={() => save.mutate({ key: s.key, ...d })}>Save</Button>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </SectionCard>
  );
}
