"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import type { AuthResponse, MeResponse } from "@shopbooks/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";
import { BrandMark } from "@/components/layout/brand";
import { api, errorMessage } from "@/lib/api";
import { usePageTitle } from "@/components/page-header";

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/";
  return next;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Already signed in? Skip the form.
  React.useEffect(() => {
    let cancelled = false;
    api
      .get<MeResponse>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        qc.setQueryData(["/auth/me", {}], me);
        router.replace(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [qc, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<AuthResponse>("/auth/login", { email: email.trim(), password });
      qc.clear();
      qc.setQueryData(["/auth/me", {}], res);
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          icon={<Mail />}
          placeholder="you@shop.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          wrapperClassName="h-11"
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          icon={<Lock />}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          wrapperClassName="h-11"
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
      </Field>
      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-2.5 text-[13px] font-medium text-destructive-soft-foreground">
          {error}
        </div>
      )}
      <Button type="submit" size="lg" loading={loading} className="w-full">
        Sign in <ArrowRight />
      </Button>
    </form>
  );
}

export default function LoginPage() {
  usePageTitle("Sign in");
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between p-6 lg:justify-end">
        <div className="flex items-center gap-2 lg:hidden">
          <BrandMark className="size-8" />
          <span className="font-display text-xl font-semibold">ShopBooks</span>
        </div>
        <p className="text-[13px] text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-primary hover:underline">
            Create your shop
          </Link>
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <p className="eyebrow mb-3 text-primary">Sign in</p>
            <h1 className="font-display text-[34px] leading-[1.08] font-semibold tracking-[-0.035em]">
              Welcome <span className="text-muted-foreground/70">back</span>
            </h1>
            <p className="mt-1.5 text-[14px] text-muted-foreground">Sign in to your shop to continue selling.</p>
          </div>
          <React.Suspense fallback={null}>
            <LoginForm />
          </React.Suspense>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Forgot your password? Ask your shop owner or administrator to reset it from Users &amp; roles.
          </p>
        </div>
      </div>
    </div>
  );
}
