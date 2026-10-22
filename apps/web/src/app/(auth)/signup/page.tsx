"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, Check, Eye, EyeOff, Globe2, Lock, Mail, Percent, User } from "lucide-react";
import { CURRENCIES, TRIAL_DAYS, type AuthResponse, type PublicPlans, type PurchaseResult, type SignupInput } from "@shopbooks/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldGrid } from "@/components/form-field";
import { Combobox } from "@/components/combobox";
import { PercentInput } from "@/components/money-input";
import { BrandMark } from "@/components/layout/brand";
import { usePageTitle } from "@/components/page-header";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApiQuery } from "@/hooks/use-api";
import { lkr, periodLabel } from "@/lib/platform";
import { cn } from "@/lib/utils";

const TZ_CURRENCY: Record<string, string> = {
  "Asia/Colombo": "LKR",
  "Asia/Kolkata": "INR",
  "Asia/Calcutta": "INR",
  "Asia/Karachi": "PKR",
  "Asia/Dhaka": "BDT",
  "Asia/Kathmandu": "NPR",
  "Asia/Dubai": "AED",
  "Asia/Riyadh": "SAR",
  "Asia/Qatar": "QAR",
  "Asia/Kuwait": "KWD",
  "Asia/Kuala_Lumpur": "MYR",
  "Asia/Singapore": "SGD",
  "Asia/Jakarta": "IDR",
  "Asia/Manila": "PHP",
  "Asia/Bangkok": "THB",
  "Asia/Ho_Chi_Minh": "VND",
  "Asia/Saigon": "VND",
  "Asia/Tokyo": "JPY",
  "Asia/Shanghai": "CNY",
  "Pacific/Auckland": "NZD",
  "America/Toronto": "CAD",
  "America/Vancouver": "CAD",
  "Africa/Johannesburg": "ZAR",
  "Africa/Lagos": "NGN",
  "Africa/Nairobi": "KES",
  "Africa/Cairo": "EGP",
  "America/Sao_Paulo": "BRL",
  "America/Mexico_City": "MXN",
  "Europe/London": "GBP",
};

const TAX_PRESETS: Record<string, { name: string; rate: number }> = {
  LKR: { name: "VAT", rate: 18 },
  INR: { name: "GST", rate: 18 },
  GBP: { name: "VAT", rate: 20 },
  EUR: { name: "VAT", rate: 20 },
  AED: { name: "VAT", rate: 5 },
  SAR: { name: "VAT", rate: 15 },
  AUD: { name: "GST", rate: 10 },
  NZD: { name: "GST", rate: 15 },
  SGD: { name: "GST", rate: 9 },
  MYR: { name: "SST", rate: 8 },
  ZAR: { name: "VAT", rate: 15 },
  PKR: { name: "GST", rate: 18 },
  BDT: { name: "VAT", rate: 15 },
};

function guessCurrency(tz: string): string {
  if (TZ_CURRENCY[tz]) return TZ_CURRENCY[tz]!;
  if (tz.startsWith("Australia/")) return "AUD";
  if (tz.startsWith("Europe/")) return "EUR";
  return "USD";
}

function allTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn("timeZone");
  } catch {}
  return ["UTC", "Asia/Colombo", "Asia/Kolkata", "Europe/London", "America/New_York"];
}

export default function SignupPage() {
  usePageTitle("Create your shop");
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const { data: pricing } = useApiQuery<PublicPlans>("/public/plans");
  const paid = !!pricing?.paymentRequired;
  /** Any active plan means signup ends on a plan step: pay now (paid) or start a free trial. */
  const hasPlans = !!pricing?.plans.length;
  const single = pricing?.plans.length === 1;
  const [planId, setPlanId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (pricing?.plans.length && !planId) setPlanId((pricing.plans.find((p) => p.priceCents > 0) ?? pricing.plans[0])!.id);
  }, [pricing, planId]);
  const [show, setShow] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const timezones = React.useMemo(allTimezones, []);

  const [form, setForm] = React.useState({
    name: "",
    email: "",
    password: "",
    businessName: "",
    phone: "",
    currency: "USD",
    timezone: "UTC",
    taxInclusive: true,
    defaultTaxRate: 0,
    taxName: "Tax",
  });

  React.useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const cur = guessCurrency(tz);
    const tax = TAX_PRESETS[cur];
    setForm((f) => ({
      ...f,
      timezone: tz,
      currency: cur,
      taxName: tax?.name ?? "Tax",
      defaultTaxRate: tax?.rate ?? 0,
    }));
  }, []);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Enter a valid email";
    if (form.password.length < 8) errs.password = "Use at least 8 characters";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      if (validateStep1()) setStep(2);
      return;
    }
    if (step === 2) {
      if (!form.businessName.trim()) {
        setFieldErrors({ businessName: "Enter your shop name" });
        return;
      }
      if (hasPlans) {
        setFieldErrors({});
        setStep(3);
        return;
      }
    }
    if (hasPlans && !planId) {
      setError("Choose a plan");
      return;
    }
    setError(null);
    setLoading(true);
    const body: SignupInput = {
      businessName: form.businessName.trim(),
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      currency: form.currency,
      timezone: form.timezone,
      phone: form.phone.trim() || null,
      country: null,
      taxInclusive: form.taxInclusive,
      defaultTaxRate: form.defaultTaxRate,
      taxName: form.taxName.trim() || "Tax",
      planId: hasPlans && !paid ? planId : null,
    };
    try {
      if (paid) {
        const buy = await api.post<PurchaseResult>("/public/purchase", { planId, signup: body, returnOrigin: window.location.origin });
        window.location.href = buy.url; // payments.lk hosted checkout; the shop is created when the payment is confirmed
        return;
      }
      const res = await api.post<AuthResponse>("/auth/signup", body);
      qc.clear();
      qc.setQueryData(["/auth/me", {}], res);
      router.replace("/dashboard");
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError && err.status === 409) {
        setStep(1);
        setFieldErrors({ email: err.message });
      } else setError(errorMessage(err));
    }
  };

  const strength = Math.min(4, [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(form.password)).length);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between p-6 lg:justify-end">
        <div className="flex items-center gap-2 lg:hidden">
          <BrandMark className="size-8" />
          <span className="font-display text-xl font-semibold">ShopBooks</span>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[460px]">
          {/* steps */}
          <div className="mb-7 flex items-center gap-3">
            {[
              { n: 1, label: "Your account" },
              { n: 2, label: "Your shop" },
              ...(hasPlans ? [{ n: 3, label: paid ? "Plan & pay" : "Your plan" }] : []),
            ].map((s, i) => (
              <React.Fragment key={s.n}>
                {i > 0 && <div className={cn("h-px flex-1", step >= s.n ? "bg-primary" : "bg-border")} />}
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      step > s.n
                        ? "bg-primary text-primary-foreground"
                        : step === s.n
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {step > s.n ? <Check className="size-3.5" /> : s.n}
                  </span>
                  <span className={cn("text-[13px] font-medium", step === s.n ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                </div>
              </React.Fragment>
            ))}
          </div>

          <div className="mb-7">
            <h1 className="font-display text-[36px] leading-[1.05] font-semibold tracking-[-0.03em]">
              {step === 1 ? "Create your account" : step === 2 ? "Set up your shop" : single ? "Your plan" : "Choose your plan"}
            </h1>
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              {step === 1
                ? "You'll be the owner. Invite your team after setup."
                : step === 2
                  ? "We'll create your chart of accounts, payment methods and a main store for you."
                  : paid
                    ? "Pay securely with payments.lk. Your shop is created the moment the payment clears."
                    : `Start with a ${TRIAL_DAYS}-day free trial — no card needed. Pay from Settings → Subscription before it ends.`}
            </p>
          </div>

          <form onSubmit={submit} className="grid gap-5" noValidate>
            {step === 1 ? (
              <>
                <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
                  <Input
                    id="name"
                    icon={<User />}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    autoComplete="name"
                    autoFocus
                    wrapperClassName="h-11"
                    aria-invalid={!!fieldErrors.name}
                  />
                </Field>
                <Field label="Work email" htmlFor="email" error={fieldErrors.email}>
                  <Input
                    id="email"
                    type="email"
                    icon={<Mail />}
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    autoComplete="email"
                    wrapperClassName="h-11"
                    aria-invalid={!!fieldErrors.email}
                  />
                </Field>
                <Field label="Password" htmlFor="password" error={fieldErrors.password}>
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    icon={<Lock />}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    autoComplete="new-password"
                    wrapperClassName="h-11"
                    aria-invalid={!!fieldErrors.password}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setShow((s) => !s)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label={show ? "Hide password" : "Show password"}
                      >
                        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    }
                  />
                  <div className="mt-1 flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-colors",
                          i < strength
                            ? strength <= 1
                              ? "bg-destructive"
                              : strength === 2
                                ? "bg-warning"
                                : "bg-success"
                            : "bg-muted",
                        )}
                      />
                    ))}
                  </div>
                </Field>
              </>
            ) : step === 3 ? (
              <div role="radiogroup" aria-label="Plan" className="grid gap-3">
                {pricing?.plans.map((p) => {
                  const selected = planId === p.id;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      key={p.id}
                      onClick={() => setPlanId(p.id)}
                      className={cn(
                        "relative rounded-xl border p-4 pr-12 text-left transition-colors",
                        selected ? "border-primary bg-primary-soft ring-2 ring-primary/20" : "border-border hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-4 right-4 flex size-5 items-center justify-center rounded-full border transition-colors",
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                        )}
                      >
                        {selected && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="font-display text-lg font-semibold">{p.name}</span>
                      <span className="mt-1 block">
                        <span className="num text-[22px] font-semibold tracking-[-0.02em]">{lkr(p.priceCents)}</span>{" "}
                        <span className="text-xs text-muted-foreground">/ {periodLabel(p.periodDays)}</span>
                      </span>
                      {!paid && p.priceCents > 0 && (
                        <span className="mt-1 block text-[13px] font-medium text-primary-soft-foreground">
                          {TRIAL_DAYS} days free, then {lkr(p.priceCents)} / {periodLabel(p.periodDays)}
                        </span>
                      )}
                      {p.description && <span className="mt-1 block text-[13px] text-muted-foreground">{p.description}</span>}
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {p.maxUsers || "Unlimited"} users · {p.maxLocations || "Unlimited"} locations
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <Field label="Shop / business name" htmlFor="businessName" error={fieldErrors.businessName}>
                  <Input
                    id="businessName"
                    icon={<Building2 />}
                    value={form.businessName}
                    onChange={(e) => set("businessName", e.target.value)}
                    placeholder="e.g. Kandy Fashion House"
                    autoFocus
                    wrapperClassName="h-11"
                    aria-invalid={!!fieldErrors.businessName}
                  />
                </Field>
                <FieldGrid>
                  <Field label="Currency" htmlFor="currency">
                    <Combobox
                      id="currency"
                      value={form.currency}
                      onChange={(v) => {
                        if (!v) return;
                        const tax = TAX_PRESETS[v];
                        setForm((f) => ({
                          ...f,
                          currency: v,
                          ...(tax && f.defaultTaxRate === 0 ? { taxName: tax.name, defaultTaxRate: tax.rate } : {}),
                        }));
                      }}
                      options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, keywords: [c.name] }))}
                      searchPlaceholder="Search currency…"
                      size="lg"
                    />
                  </Field>
                  <Field label="Phone" htmlFor="phone" hint="Shown on receipts">
                    <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" className="h-11" />
                  </Field>
                </FieldGrid>
                <Field label="Time zone" htmlFor="tz" hint="Used for daily reports and dates on invoices">
                  <Combobox
                    id="tz"
                    value={form.timezone}
                    onChange={(v) => v && set("timezone", v)}
                    options={timezones.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
                    searchPlaceholder="Search time zone…"
                    icon={<Globe2 />}
                    size="lg"
                  />
                </Field>
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">Prices include tax</p>
                      <p className="text-[13px] text-muted-foreground">
                        Shelf prices already contain {form.taxName || "tax"}. Turn off if tax is added at checkout.
                      </p>
                    </div>
                    <Switch checked={form.taxInclusive} onCheckedChange={(v) => set("taxInclusive", v)} />
                  </div>
                  <FieldGrid className="mt-4">
                    <Field label="Tax name" htmlFor="taxName">
                      <Input id="taxName" value={form.taxName} onChange={(e) => set("taxName", e.target.value)} placeholder="VAT / GST / Sales tax" />
                    </Field>
                    <Field label="Default rate" htmlFor="taxRate" hint="0 if you don't charge tax">
                      <PercentInput id="taxRate" value={form.defaultTaxRate} onChange={(v) => set("defaultTaxRate", v)} icon={<Percent />} />
                    </Field>
                  </FieldGrid>
                </div>
              </>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-2.5 text-[13px] font-medium text-destructive-soft-foreground">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              {step > 1 && (
                <Button type="button" variant="outline" size="lg" onClick={() => setStep((step - 1) as 1 | 2)}>
                  <ArrowLeft /> Back
                </Button>
              )}
              <Button type="submit" size="lg" className="flex-1" loading={loading}>
                {step === 1 || (step === 2 && hasPlans) ? (
                  <>
                    Continue <ArrowRight />
                  </>
                ) : step === 3 ? (
                  <>
                    {paid ? <>Pay &amp; create my shop</> : "Start my free trial"} <ArrowRight />
                  </>
                ) : (
                  <>
                    Create my shop <ArrowRight />
                  </>
                )}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {paid
                ? "Payments are processed by payments.lk. We never see your card details."
                : hasPlans
                  ? `No card needed for the ${TRIAL_DAYS}-day trial.`
                  : "Free to start. Your data stays in your own Cloudflare account."}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
