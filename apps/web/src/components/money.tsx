"use client";

import * as React from "react";
import { useMoney } from "@/hooks/use-money";
import { cn } from "@/lib/utils";

export interface MoneyProps {
  /** Amount in minor units */
  value: number | null | undefined;
  className?: string;
  /**
   * auto     = red when negative
   * positive = green when > 0
   * signed   = green when > 0, red when < 0 (with + sign)
   * muted    = muted color
   */
  tone?: "default" | "auto" | "positive" | "signed" | "muted";
  compact?: boolean;
  /** Hide the currency symbol */
  plain?: boolean;
  /** Render "—" for zero */
  dashZero?: boolean;
}

/** Formatted amount with tabular numbers. <Money value={invoice.total} /> */
export function Money({ value, className, tone = "default", compact, plain, dashZero }: MoneyProps) {
  const { format } = useMoney();
  const v = value ?? 0;
  if (dashZero && v === 0) return <span className={cn("num text-muted-foreground", className)}>—</span>;
  const text = format(v, { compact, symbol: !plain, signed: tone === "signed" });
  return (
    <span
      className={cn(
        "num whitespace-nowrap",
        tone === "auto" && v < 0 && "text-destructive",
        tone === "positive" && v > 0 && "text-success-soft-foreground",
        tone === "signed" && v > 0 && "text-success-soft-foreground",
        tone === "signed" && v < 0 && "text-destructive",
        tone === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {text}
    </span>
  );
}
