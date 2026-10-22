"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for document detail pages (invoices, purchases, returns, transfers…).
 * The black-card hero carries the headline figure, settlement progress and up to three stats.
 */
export function DocHero({
  eyebrow,
  value,
  progress,
  progressLabel,
  stats,
  dimmed,
  className,
}: {
  eyebrow: React.ReactNode;
  value: React.ReactNode;
  /** 0–100; omit for documents that don't settle (transfers, adjustments) */
  progress?: number;
  progressLabel?: React.ReactNode;
  stats?: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }[];
  dimmed?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("metal relative mb-6 overflow-hidden rounded-3xl p-6 text-white sm:p-8", dimmed && "opacity-60 saturate-50", className)}>
      <div className="grid gap-8">
        <div className="min-w-0">
          <p className="eyebrow text-white/50">{eyebrow}</p>
          <p className="figure mt-3 text-4xl leading-none text-gold sm:text-5xl">{value}</p>
          {progress !== undefined && (
            <div className="mt-7">
              <div className="flex items-center justify-between text-[13px] text-white/60">
                <span>{progressLabel}</span>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-highlight/70 to-highlight transition-[width] duration-700"
                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
              </div>
            </div>
          )}
        </div>
        {stats && stats.length > 0 && (
          <dl className="grid gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10 sm:grid-cols-3">
            {stats.map((s) => (
              <DocStat key={s.label} {...s} />
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

function DocStat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="bg-black/25 px-5 py-4 backdrop-blur-sm">
      <dt className="label-caps text-white/50">{label}</dt>
      <dd className={cn("figure mt-2 text-xl", accent ? "text-highlight" : "text-white")}>{value}</dd>
      {sub && <p className="num mt-0.5 text-[12px] text-white/50">{sub}</p>}
    </div>
  );
}

/** Rounded soft panel with a display title, used for every section on detail pages. */
export function DocPanel({
  title,
  aside,
  flush,
  className,
  children,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl bg-card shadow-card", className)}>
      <header className={cn("flex items-center justify-between gap-4 px-6 pt-5", flush ? "pb-4" : "pb-3")}>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {aside}
      </header>
      {flush ? children : <div className="px-6 pb-6">{children}</div>}
    </section>
  );
}

export interface TimelineEntry {
  id: string;
  title: React.ReactNode;
  badge?: React.ReactNode;
  reference?: React.ReactNode;
  date: React.ReactNode;
  amount: React.ReactNode;
  note?: React.ReactNode;
  voided?: boolean;
}

/** Vertical timeline of payments or events, newest last. */
export function Timeline({ entries, empty }: { entries: TimelineEntry[]; empty: React.ReactNode }) {
  if (entries.length === 0) return <p className="px-6 py-6 text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <ol className="px-6 py-5">
      {entries.map((e, i) => (
        <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
          {i < entries.length - 1 && <span aria-hidden className="absolute top-5 bottom-0 left-[7px] w-px bg-border" />}
          <span
            aria-hidden
            className={cn("relative mt-1.5 size-[15px] shrink-0 rounded-full ring-4 ring-card", e.voided ? "bg-border-strong" : "bg-highlight")}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-6 gap-y-1">
            <div className="min-w-0">
              <p className="font-medium">
                {e.title}
                {e.badge}
              </p>
              {e.reference && <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">{e.reference}</p>}
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{e.date}</p>
            </div>
            <div className="text-right">
              <div className={cn("figure text-[15px] font-semibold", e.voided && "text-muted-foreground line-through")}>{e.amount}</div>
              {e.note && <p className="num text-[11.5px] text-muted-foreground">{e.note}</p>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Totals block (subtotal → total → paid → balance) shared by document pages. */
export function TotalsBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 bg-muted/35 px-6 py-5">
      <dl className="ml-auto grid max-w-sm gap-2 text-sm">{children}</dl>
    </div>
  );
}

export function TotalLine({ label, value, muted, tone }: { label: string; value: React.ReactNode; muted?: boolean; tone?: "danger" }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted-foreground", tone === "danger" && "font-semibold text-destructive")}>
      <dt className={muted ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

export function GrandTotal({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rule-double-top mt-2 flex items-baseline justify-between pt-3">
      <dt className="font-display text-base font-semibold">{label}</dt>
      <dd className="figure text-lg">{value}</dd>
    </div>
  );
}
