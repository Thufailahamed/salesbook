import { and, eq } from "drizzle-orm";
import type { PromotionTerms } from "@shopbooks/shared";
import { promotions } from "../db/schema";
import type { Ctx } from "../lib/context";

/**
 * Offers running today, keyed by variant id. A variant-specific offer beats a product-wide one.
 * Only the business's active offers are loaded (a shop has a handful at a time), so filtering in memory is fine.
 */
export async function promotionsFor(
  ctx: Ctx,
  items: { variantId: string; productId: string }[],
): Promise<Map<string, PromotionTerms>> {
  const map = new Map<string, PromotionTerms>();
  if (items.length === 0) return map;
  const running = (
    await ctx.db
      .select()
      .from(promotions)
      .where(and(eq(promotions.businessId, ctx.businessId), eq(promotions.isActive, true)))
  ).filter((p) => p.startDate <= ctx.today && (!p.endDate || p.endDate >= ctx.today));
  if (running.length === 0) return map;

  const toTerms = (p: (typeof running)[number]): PromotionTerms => ({
    promotionId: p.id,
    name: p.name,
    kind: p.kind as PromotionTerms["kind"],
    value: p.value,
    endDate: p.endDate,
  });
  for (const item of items) {
    const own = running.find((p) => p.variantId === item.variantId);
    const product = own ?? running.find((p) => !p.variantId && p.productId === item.productId);
    if (product) map.set(item.variantId, toTerms(product));
  }
  return map;
}
