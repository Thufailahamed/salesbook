"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";
import { BrandMark } from "@/components/layout/brand";
import { usePageTitle } from "@/components/page-header";
import { api, errorMessage } from "@/lib/api";

export default function AdminLoginPage() {
  usePageTitle("Platform admin");
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ admin: unknown }>("/platform/auth/login", { email: email.trim(), password });
      qc.setQueryData(["/platform/auth/me", {}], { admin: res.admin });
      router.replace("/admin");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="metal relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <BrandMark className="size-11" />
          <div>
            <p className="font-display text-xl font-semibold leading-none">ShopBooks</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium tracking-wide text-white/50 uppercase">
              <ShieldCheck className="size-3.5" /> Platform admin
            </p>
          </div>
        </div>
        <div>
          <p className="eyebrow text-white/50">Control room</p>
          <p className="font-display mt-3 max-w-md text-[40px] leading-[1.05] font-semibold tracking-[-0.03em]">
            Every shop, plan and payment in one place.
          </p>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-white/55">
            Create plans, manage subscriptions and reconcile payments from the payments.lk webhook.
          </p>
        </div>
        <p className="text-[12px] text-white/35">Restricted to platform staff.</p>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="size-10" />
            <p className="font-display text-lg font-semibold">ShopBooks · Platform admin</p>
          </div>
          <p className="eyebrow text-muted-foreground">Staff access</p>
          <h1 className="font-display mt-2 text-[34px] leading-tight font-semibold tracking-[-0.02em]">Sign in</h1>
          <p className="mt-1.5 mb-8 text-[14px] text-muted-foreground">Manage shops, plans and subscription payments.</p>
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" icon={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus wrapperClassName="h-11" />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" icon={<Lock />} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" wrapperClassName="h-11" />
            </Field>
            {error && <div className="rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-2.5 text-[13px] font-medium text-destructive-soft-foreground">{error}</div>}
            <Button type="submit" size="lg" loading={loading} disabled={!email || !password} className="mt-2">
              Sign in <ArrowRight />
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
