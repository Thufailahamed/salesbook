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
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark className="size-11" />
          <div>
            <p className="font-display text-xl font-semibold leading-none">ShopBooks</p>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"><ShieldCheck className="size-3.5" /> Platform admin</p>
          </div>
        </div>
        <h1 className="font-display text-[30px] leading-tight font-semibold tracking-[-0.02em]">Sign in</h1>
        <p className="mt-1 mb-6 text-[14px] text-muted-foreground">Manage shops, plans and subscription payments.</p>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" icon={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus wrapperClassName="h-11" />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" icon={<Lock />} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" wrapperClassName="h-11" />
          </Field>
          {error && <div className="rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-2.5 text-[13px] font-medium text-destructive-soft-foreground">{error}</div>}
          <Button type="submit" size="lg" loading={loading} disabled={!email || !password}>Sign in <ArrowRight /></Button>
        </form>
      </div>
    </div>
  );
}
