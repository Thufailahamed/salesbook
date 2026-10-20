"use client";

import * as React from "react";
import { currencyDecimals, formatMoney, toMajor, toMinor } from "@shopbooks/shared";
import { useOptionalSession } from "./use-session";

export interface MoneyHelpers {
  currency: string;
  locale: string;
  decimals: number;
  /** Narrow currency symbol, e.g. "$", "Rs", "€" */
  symbol: string;
  /** format(12345) → "$123.45" (input in minor units) */
  format: (minor: number | null | undefined, opts?: { symbol?: boolean; compact?: boolean; signed?: boolean }) => string;
  /** formatCompact(1234500) → "$12.3K" */
  formatCompact: (minor: number | null | undefined) => string;
  /** Major units (user input) → minor-unit integer */
  toMinor: (major: number) => number;
  /** Minor-unit integer → major units (number) */
  toMajor: (minor: number) => number;
}

function currencySymbol(currency: string, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Money helpers bound to the business currency and locale. All amounts are integers in minor units. */
export function useMoney(): MoneyHelpers {
  const session = useOptionalSession();
  const currency = session?.business.currency ?? "USD";
  const locale = session?.business.locale ?? "en-US";
  return React.useMemo<MoneyHelpers>(() => {
    const decimals = currencyDecimals(currency);
    return {
      currency,
      locale,
      decimals,
      symbol: currencySymbol(currency, locale),
      format: (minor, opts) => {
        const v = minor ?? 0;
        const s = formatMoney(v, { currency, locale, symbol: opts?.symbol, compact: opts?.compact });
        return opts?.signed && v > 0 ? `+${s}` : s;
      },
      formatCompact: (minor) => formatMoney(minor ?? 0, { currency, locale, compact: true }),
      toMinor: (major) => toMinor(major, decimals),
      toMajor: (minor) => toMajor(minor, decimals),
    };
  }, [currency, locale]);
}
