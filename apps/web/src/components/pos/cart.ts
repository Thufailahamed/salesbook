import { lineCredit } from "@/components/return-lines-picker";
import {
  calculateDocument,
  type CalcResult,
  type DiscountType,
  type Invoice,
  type PriceTier,
  type ReturnableLine,
  type SellableItem,
} from "@shopbooks/shared";

/** A line in the POS cart. Money in minor units. */
export interface CartLine {
  key: string;
  variantId: string | null;
  productId: string | null;
  name: string;
  variantName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  /** Catalog price for the active tier (to detect overrides) */
  listPrice: number;
  retailPrice: number;
  wholesalePrice: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  taxRate: number;
  allowDecimal: boolean;
  trackInventory: boolean;
  /** Stock at the POS location when added */
  stock: number;
  imageUrl: string | null;
  unitShortName: string | null;
  note: string | null;
}

export interface ReturnSelection {
  invoice: Invoice;
  lines: ReturnableLine[];
  /** invoiceLineId → quantity / restock */
  picks: Record<string, { quantity: number; restock: boolean }>;
  reason: string;
}

/** Everything that survives a "hold" (stored as JSON on the server). */
export interface CartState {
  lines: CartLine[];
  customerId: string | null;
  docDiscountType: DiscountType | null;
  docDiscountValue: number | null;
  shipping: number;
  note: string;
  salespersonId: string | null;
  quotationId: string | null;
}

export const emptyCart = (): CartState => ({
  lines: [],
  customerId: null,
  docDiscountType: null,
  docDiscountValue: null,
  shipping: 0,
  note: "",
  salespersonId: null,
  quotationId: null,
});

let seq = 0;
export const lineKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export function tierPrice(retail: number, wholesale: number | null, tier: PriceTier): number {
  return tier === "wholesale" && wholesale != null ? wholesale : retail;
}

export function lineFromItem(item: SellableItem, tier: PriceTier): CartLine {
  const price = tierPrice(item.price, item.wholesalePrice, tier);
  return {
    key: lineKey(),
    variantId: item.variantId,
    productId: item.productId,
    name: item.productName,
    variantName: item.variantName,
    sku: item.sku,
    quantity: 1,
    unitPrice: price,
    listPrice: price,
    retailPrice: item.price,
    wholesalePrice: item.wholesalePrice,
    discountType: null,
    discountValue: null,
    taxRate: item.taxRate,
    allowDecimal: item.allowDecimal,
    trackInventory: item.trackInventory,
    stock: item.stock,
    imageUrl: item.imageUrl,
    unitShortName: item.unitShortName,
    note: null,
  };
}

/** Add an item: bumps the quantity of an identical, undiscounted line, else appends. */
export function addItem(lines: CartLine[], item: SellableItem, tier: PriceTier): CartLine[] {
  const price = tierPrice(item.price, item.wholesalePrice, tier);
  const idx = lines.findIndex((l) => l.variantId === item.variantId && l.unitPrice === price && !l.discountType && !l.note);
  if (idx >= 0) return lines.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
  return [...lines, lineFromItem(item, tier)];
}

/** Re-price lines that still carry the catalog price when the price tier changes. */
export function repriceForTier(lines: CartLine[], tier: PriceTier): CartLine[] {
  return lines.map((l) => {
    if (!l.variantId) return l;
    const next = tierPrice(l.retailPrice, l.wholesalePrice, tier);
    return l.unitPrice === l.listPrice ? { ...l, unitPrice: next, listPrice: next } : { ...l, listPrice: next };
  });
}

export function cartTotals(cart: CartState, opts: { taxInclusive: boolean; roundingIncrement: number }): CalcResult {
  return calculateDocument(
    cart.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountType: l.discountType,
      discountValue: l.discountValue,
      taxRate: l.taxRate,
    })),
    {
      taxInclusive: opts.taxInclusive,
      docDiscountType: cart.docDiscountType,
      docDiscountValue: cart.docDiscountValue,
      shipping: cart.shipping,
      roundingIncrement: opts.roundingIncrement,
    },
  );
}

/** Credit for the selected return lines — mirrors the API's proportional maths. */
export function returnCredit(sel: ReturnSelection | null): { total: number; count: number } {
  if (!sel) return { total: 0, count: 0 };
  let total = 0;
  let count = 0;
  for (const l of sel.lines) {
    const q = sel.picks[l.id]?.quantity ?? 0;
    if (q <= 0) continue;
    count += q;
    total += lineCredit(l, q);
  }
  return { total, count };
}

/** How a return credit settles against the original invoice and the new sale. */
export function settlement(saleTotal: number, hasSale: boolean, retTotal: number, originalDue: number) {
  const appliedToOriginal = Math.min(retTotal, Math.max(0, originalDue));
  const creditAvail = retTotal - appliedToOriginal;
  const appliedToExchange = hasSale ? Math.min(creditAvail, saleTotal) : 0;
  const remainingSale = (hasSale ? saleTotal : 0) - appliedToExchange;
  const refundDue = creditAvail - appliedToExchange;
  return { appliedToOriginal, appliedToExchange, remainingSale, refundDue };
}
