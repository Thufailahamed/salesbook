import { roundHalfAway } from "./money";

/** percent = % off the tier price; fixed_price = a special price (minor units). */
export const PROMOTION_KINDS = ["percent", "fixed_price"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

/** The part of a promotion the POS needs to price a line. */
export interface PromotionTerms {
  promotionId: string;
  name: string;
  kind: PromotionKind;
  /** Percent (e.g. 15 = 15% off) or special price in minor units. */
  value: number;
  /** Last business day the promotion applies, null = open-ended. */
  endDate: string | null;
}

/** Unit price after a promotion. A fixed price never raises the tier price. */
export function promoPrice(base: number, promo: Pick<PromotionTerms, "kind" | "value"> | null | undefined): number {
  if (!promo) return base;
  if (promo.kind === "percent") return Math.max(0, roundHalfAway(base * (1 - promo.value / 100)));
  return Math.min(base, promo.value);
}

/** Human label for an offer, e.g. "15% off" or "Special Rs 99". */
export function promoLabel(promo: Pick<PromotionTerms, "kind" | "value">, formatMoney: (minor: number) => string): string {
  return promo.kind === "percent" ? `${promo.value}% off` : `Special ${formatMoney(promo.value)}`;
}
