"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import type { AiAnswer, AiStatus } from "@shopbooks/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api";

const SUGGESTIONS = [
  "What were my sales this month?",
  "How much profit did I make this month?",
  "What did I spend on expenses this month?",
  "Which products sold best this month?",
  "Who owes me money?",
  "Do I have stock expiring in the next 30 days?",
];

/** Plain-language questions answered from the books. Hidden until the server has AI questions configured. */
export function AskBooks() {
  const { can } = useSession();
  const status = useApiQuery<AiStatus>("/ai/status", undefined, { staleTime: Infinity, enabled: can("reports.view") });
  const [question, setQuestion] = React.useState("");
  const [result, setResult] = React.useState<{ question: string; answer: AiAnswer } | null>(null);
  const ask = useApiMutation(
    (q: string) => api.post<AiAnswer>("/ai/ask", { question: q }),
    { onSuccess: (answer, q) => setResult({ question: q, answer }) },
  );

  if (!status.data?.ask) return null;

  const submit = (text: string) => {
    const q = text.trim();
    if (q.length < 3 || ask.isPending) return;
    setQuestion(q);
    ask.mutate(q);
  };

  return (
    <section className="rounded-3xl border bg-card p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="eyebrow">Ask your books</p>
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What were my best sellers last week?"
          maxLength={300}
          aria-label="Question about your books"
        />
        <Button type="submit" loading={ask.isPending} disabled={question.trim().length < 3}>
          Ask
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => submit(s)}
            disabled={ask.isPending}
            className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
      {ask.isPending && <p className="mt-5 text-sm text-muted-foreground">Checking your books…</p>}
      {result && !ask.isPending && (
        <div className="mt-5 border-t pt-4">
          <p className="text-sm text-muted-foreground">{result.question}</p>
          <p className="mt-2 text-[15px] leading-relaxed">{result.answer.answer}</p>
          {result.answer.data && (
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Numbers used</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[11px]">
                {JSON.stringify(result.answer.data, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
