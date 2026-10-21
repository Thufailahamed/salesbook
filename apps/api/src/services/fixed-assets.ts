import type { FixedAsset } from "@shopbooks/shared";

/** Months are counted as year × 12 + (month − 1), so consecutive months differ by one. */
export function monthIndex(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return y! * 12 + (m! - 1);
}

export function monthEnd(index: number): string {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** The last month that has fully ended by `throughDate`. */
export function lastDepreciableMonth(throughDate: string): number {
  const idx = monthIndex(throughDate);
  return throughDate === monthEnd(idx) ? idx : idx - 1;
}

/**
 * Straight-line depreciation starts the month after acquisition. The accumulated charge is computed from the
 * total months elapsed rather than month by month, so rounding never drifts and never exceeds cost − salvage.
 */
export function accumulatedAt(asset: Pick<FixedAsset, "acquiredOn" | "cost" | "salvage" | "usefulLifeMonths">, lastMonth: number): number {
  const start = monthIndex(asset.acquiredOn) + 1;
  const months = Math.min(asset.usefulLifeMonths, lastMonth - start + 1);
  if (months <= 0) return 0;
  return Math.round(((asset.cost - asset.salvage) * months) / asset.usefulLifeMonths);
}

export function monthlyCharge(cost: number, salvage: number, usefulLifeMonths: number): number {
  return Math.round((cost - salvage) / usefulLifeMonths);
}
