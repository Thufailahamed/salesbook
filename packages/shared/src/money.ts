/**
 * Money helpers.
 *
 * Every monetary amount that crosses the API boundary or is stored in the
 * database is an INTEGER in minor units (e.g. cents). Only the UI converts to
 * major units for display and input.
 */

/** Round half away from zero, guarding against binary float artefacts (1.005 * 100). */
export function roundHalfAway(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) + 1e-9)) || 0;
}

/** Round a quantity to 3 decimals (supports fractional units like metres or kg). */
export function roundQty(n: number): number {
  return roundHalfAway(n * 1000) / 1000;
}

export function pow10(decimals: number): number {
  return 10 ** decimals;
}

export function toMinor(major: number, decimals = 2): number {
  return roundHalfAway(major * pow10(decimals));
}

export function toMajor(minor: number, decimals = 2): number {
  return minor / pow10(decimals);
}

/** Number of minor-unit decimals for a currency (ISO 4217). */
export function currencyDecimals(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, locale: string, compact: boolean, withSymbol: boolean) {
  const key = `${currency}|${locale}|${compact}|${withSymbol}`;
  let f = formatterCache.get(key);
  if (!f) {
    const decimals = currencyDecimals(currency);
    f = new Intl.NumberFormat(locale || "en-US", {
      style: withSymbol ? "currency" : "decimal",
      currency,
      currencyDisplay: "narrowSymbol",
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: compact ? 0 : decimals,
      maximumFractionDigits: compact ? 1 : decimals,
    });
    formatterCache.set(key, f);
  }
  return f;
}

export interface FormatMoneyOptions {
  currency: string;
  locale?: string;
  compact?: boolean;
  /** Show currency symbol (default true). */
  symbol?: boolean;
}

/** Format an amount given in minor units. */
export function formatMoney(minor: number, opts: FormatMoneyOptions): string {
  const decimals = currencyDecimals(opts.currency);
  return formatter(opts.currency, opts.locale ?? "en-US", !!opts.compact, opts.symbol !== false).format(
    toMajor(minor || 0, decimals),
  );
}

/** Split `total` across `weights` proportionally so the parts sum exactly to `total` (largest remainder). */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sumW <= 0 || total === 0) {
    const out = new Array(n).fill(0);
    if (total !== 0) out[0] = total;
    return out;
  }
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => (Math.max(0, w) / sumW) * abs);
  const floors = raw.map((r) => Math.floor(r + 1e-9));
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r + 1e-9) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    floors[order[k]!.i]! += 1;
  }
  return floors.map((f) => f * sign);
}
