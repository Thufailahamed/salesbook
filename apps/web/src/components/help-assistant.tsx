"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CornerDownRight, Sparkles } from "lucide-react";
import type { AiStatus, HelpAnswer } from "@shopbooks/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { api } from "@/lib/api";

const SUGGESTIONS = [
  "How do I sell on credit?",
  "How do I add a product with sizes?",
  "How do I close the books for a month?",
  "How do I record a supplier payment?",
];

/** "How do I…" questions answered from the built-in help. Hidden until the server has the help model configured. */
export function HelpAssistant() {
  const status = useApiQuery<AiStatus>("/ai/status", undefined, { staleTime: Infinity });
  const [question, setQuestion] = React.useState("");
  const [result, setResult] = React.useState<{ question: string; answer: HelpAnswer } | null>(null);
  const ask = useApiMutation((q: string) => api.post<HelpAnswer>("/ai/help", { question: q }), {
    errorToast: true,
    onSuccess: (answer, q) => setResult({ question: q, answer }),
  });

  if (!status.data?.help) return null;

  const submit = (text: string) => {
    const q = text.trim();
    if (q.length < 3 || ask.isPending) return;
    setQuestion(q);
    ask.mutate(q);
  };

  return (
    <div className="grid gap-6">
      <section className="metal relative overflow-hidden rounded-3xl p-6 text-white sm:p-10">
        <p className="eyebrow flex items-center gap-2 text-white/50">
          <Sparkles className="size-3.5 text-[oklch(0.82_0.09_84)]" /> Ask ShopBooks
        </p>
        <h2 className="font-display mt-3 max-w-xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
          What do you want to do?
        </h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/60">
          Ask in plain words. You get the steps and a link to the right page.
        </p>

        <form
          className="mt-8 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. How do I move stock to another branch?"
            maxLength={300}
            aria-label="Question about how to use ShopBooks"
            className="h-12 border-white/15 bg-white/[0.07] px-4 text-base text-white placeholder:text-white/40 focus-visible:border-white/30 focus-visible:ring-white/10"
          />
          <Button
            type="submit"
            loading={ask.isPending}
            disabled={question.trim().length < 3}
            className="h-12 rounded-xl px-6 sm:w-auto"
          >
            Ask <ArrowRight />
          </Button>
        </form>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={ask.isPending}
              className="group flex items-center justify-between gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 text-left text-sm text-white/80 ring-1 ring-white/10 transition-colors hover:bg-white/[0.11] hover:text-white disabled:opacity-50"
            >
              {s}
              <ArrowUpRight className="size-4 shrink-0 text-white/35 transition-colors group-hover:text-[oklch(0.82_0.09_84)]" />
            </button>
          ))}
        </div>
      </section>

      {ask.isPending && (
        <section className="rounded-3xl border bg-card p-6 sm:p-8" aria-busy="true" aria-live="polite">
          <p className="eyebrow">Looking in the help</p>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
          </div>
        </section>
      )}

      {result && !ask.isPending && (
        <section className="rounded-3xl border bg-card p-6 sm:p-8">
          <p className="eyebrow">Your question</p>
          <p className="font-display mt-2 text-xl font-semibold tracking-[-0.01em]">{result.question}</p>

          <div className="mt-5 flex gap-4 border-t pt-5">
            <span className="mt-1 hidden size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:flex">
              <CornerDownRight className="size-4" />
            </span>
            <p className="text-[16px] leading-7 text-foreground/90">{result.answer.answer}</p>
          </div>

          {result.answer.links.length > 0 && (
            <div className="mt-6">
              <p className="eyebrow mb-3">Go there</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {result.answer.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="group flex items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/50"
                    >
                      {l.label}
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
