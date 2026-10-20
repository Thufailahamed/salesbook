import { allocateProportionally, roundHalfAway } from "./money";

/**
 * Document calculation engine shared by the POS (live totals) and the API (authoritative totals).
 * Used for sales invoices, quotations and purchase bills so both sides always agree to the cent.
 *
 * Algorithm per line:
 *   gross        = qty * unitPrice
 *   lineDiscount = amount or % of gross
 *   docDiscount  = document discount allocated pro-rata over (gross - lineDiscount)
 *   base         = gross - lineDiscount - docDiscount     (incl. tax when taxInclusive)
 *   tax          = taxInclusive ? base * r/(100+r) : base * r/100
 *   net          = taxInclusive ? base - tax : base
 *   total        = net + tax
 * Document: total = Σ line totals + shipping, then optional cash rounding.
 */

export type DiscountType = "amount" | "percent";

export interface CalcLineInput {
  quantity: number;
  /** Minor units. Inclusive of tax when `taxInclusive` is true. */
  unitPrice: number;
  discountType?: DiscountType | null;
  /** amount: minor units for the whole line; percent: 0..100 */
  discountValue?: number | null;
  /** Percent, e.g. 8 for 8% */
  taxRate?: number | null;
}

export interface CalcOptions {
  taxInclusive: boolean;
  docDiscountType?: DiscountType | null;
  docDiscountValue?: number | null;
  /** Extra charge added after tax (delivery, alterations, freight). Minor units. */
  shipping?: number | null;
  /** Round the grand total to the nearest increment in minor units (0 = off). */
  roundingIncrement?: number | null;
}

export interface CalcLineResult {
  gross: number;
  lineDiscount: number;
  docDiscount: number;
  net: number;
  tax: number;
  total: number;
}

export interface CalcResult {
  lines: CalcLineResult[];
  /** Σ gross - line discounts (price terms, incl. tax if inclusive). */
  subtotal: number;
  itemDiscount: number;
  docDiscount: number;
  discountTotal: number;
  /** Σ net (taxable amount, excl. tax). */
  netTotal: number;
  taxTotal: number;
  shipping: number;
  roundOff: number;
  total: number;
}

function discountAmount(base: number, type: DiscountType | null | undefined, value: number | null | undefined) {
  if (!type || !value || value <= 0 || base <= 0) return 0;
  if (type === "percent") return Math.min(base, roundHalfAway((base * Math.min(value, 100)) / 100));
  return Math.min(base, roundHalfAway(value));
}

export function calculateDocument(lines: CalcLineInput[], opts: CalcOptions): CalcResult {
  const partial = lines.map((l) => {
    const gross = roundHalfAway((l.quantity || 0) * (l.unitPrice || 0));
    const lineDiscount = discountAmount(gross, l.discountType, l.discountValue);
    return { gross, lineDiscount, after: gross - lineDiscount, rate: Math.max(0, l.taxRate ?? 0) };
  });

  const subtotal = partial.reduce((s, p) => s + p.after, 0);
  const itemDiscount = partial.reduce((s, p) => s + p.lineDiscount, 0);
  const docDiscount = discountAmount(subtotal, opts.docDiscountType, opts.docDiscountValue);
  const allocations = allocateProportionally(
    docDiscount,
    partial.map((p) => p.after),
  );

  const results: CalcLineResult[] = partial.map((p, i) => {
    const docDisc = allocations[i] ?? 0;
    const base = p.after - docDisc;
    let tax: number;
    let net: number;
    if (opts.taxInclusive) {
      tax = p.rate > 0 ? roundHalfAway((base * p.rate) / (100 + p.rate)) : 0;
      net = base - tax;
    } else {
      net = base;
      tax = p.rate > 0 ? roundHalfAway((base * p.rate) / 100) : 0;
    }
    return { gross: p.gross, lineDiscount: p.lineDiscount, docDiscount: docDisc, net, tax, total: net + tax };
  });

  const netTotal = results.reduce((s, r) => s + r.net, 0);
  const taxTotal = results.reduce((s, r) => s + r.tax, 0);
  const shipping = Math.max(0, roundHalfAway(opts.shipping ?? 0));
  const preRound = results.reduce((s, r) => s + r.total, 0) + shipping;
  const inc = opts.roundingIncrement ?? 0;
  const total = inc > 0 ? roundHalfAway(preRound / inc) * inc : preRound;

  return {
    lines: results,
    subtotal,
    itemDiscount,
    docDiscount,
    discountTotal: itemDiscount + docDiscount,
    netTotal,
    taxTotal,
    shipping,
    roundOff: total - preRound,
    total,
  };
}

/** Proportional slice of an original line (used for returns so original discounts/taxes are respected). */
export function proportionalLine(
  original: { quantity: number; net: number; tax: number },
  quantity: number,
): { net: number; tax: number; total: number } {
  if (original.quantity <= 0) return { net: 0, tax: 0, total: 0 };
  const ratio = Math.min(1, quantity / original.quantity);
  const net = roundHalfAway(original.net * ratio);
  const tax = roundHalfAway(original.tax * ratio);
  return { net, tax, total: net + tax };
}

export function paymentStatusOf(total: number, paid: number): "paid" | "partial" | "unpaid" {
  if (total <= 0 || paid >= total) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}
