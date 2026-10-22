/**
 * Reorder advice: fixed rules over stock on hand and the last 30 days of net sales. The rules decide what is low,
 * how long stock lasts and how much to order. The model (when configured) only writes a short summary of them.
 */
import { addDays, currencyDecimals, toMajor, type ReorderAdvice, type ReorderItem } from "@shopbooks/shared";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { aiGatewayReady, chatText } from "./ai-gateway";
import { stockRows } from "./reports-inventory";
import { productSales } from "./reports-sales";

const SALES_DAYS = 30;
/** Reorder when less than this many days of stock are left at the recent sales rate. */
const LEAD_DAYS = 14;
const MAX_ITEMS = 25;
const STATUS_ORDER = { out: 0, low: 1 } as const;

export async function reorderAdvice(ctx: Ctx, env: Env, locationId?: string): Promise<ReorderAdvice> {
  const to = ctx.today;
  const from = addDays(to, -SALES_DAYS);
  const decimals = currencyDecimals(ctx.business.currency);

  const [stock, low, sales] = await Promise.all([
    stockRows(ctx, { locationId, mode: "nonzero" }),
    stockRows(ctx, { locationId, mode: "low" }),
    productSales(ctx, { from, to, locationId, limit: 500 }),
  ]);

  const soldBy = new Map<string, number>();
  for (const s of sales) {
    if (!s.variantId) continue;
    soldBy.set(s.variantId, (soldBy.get(s.variantId) ?? 0) + Math.max(0, s.quantity - s.returnedQuantity));
  }

  const onHandBy = new Map<string, (typeof stock)[number]>();
  for (const r of [...stock, ...low]) onHandBy.set(r.variantId, r);

  const items: ReorderItem[] = [];
  let deadCount = 0;
  let deadValue = 0;
  for (const row of onHandBy.values()) {
    const onHand = Number(row.quantity);
    const sold = soldBy.get(row.variantId) ?? 0;
    const daily = sold / SALES_DAYS;
    if (daily === 0) {
      if (onHand > 0) {
        deadCount++;
        deadValue += onHand * Number(row.costPrice);
      }
      continue;
    }
    const daysLeft = onHand > 0 ? onHand / daily : 0;
    if (onHand > 0 && daysLeft >= LEAD_DAYS) continue;
    items.push({
      variantId: row.variantId,
      name: row.variantName && row.variantName !== "Default" ? `${row.productName} — ${row.variantName}` : row.productName,
      sku: row.sku,
      onHand,
      soldLast30: sold,
      daysLeft: onHand > 0 ? Math.floor(daysLeft) : null,
      suggestedQty: Math.max(1, Math.ceil(daily * SALES_DAYS - onHand)),
      status: onHand <= 0 ? "out" : "low",
    });
  }
  items.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.daysLeft ?? -1) - (b.daysLeft ?? -1) ||
      b.soldLast30 - a.soldLast30,
  );
  const shown = items.slice(0, MAX_ITEMS);
  const advice: ReorderAdvice = {
    from,
    to,
    leadDays: LEAD_DAYS,
    items: shown,
    totalFlagged: items.length,
    deadStock: { count: deadCount, value: toMajor(Math.round(deadValue), decimals) },
    summary: null,
  };

  if (aiGatewayReady(env) && env.AI_STOCK_MODEL) {
    const facts = [
      ...shown.map(
        (i) =>
          `- [${i.status}] ${i.name}: on hand ${i.onHand}, sold ${i.soldLast30} in ${SALES_DAYS} days, ${i.daysLeft === null ? "none left" : `${i.daysLeft} days left`}, suggested order ${i.suggestedQty}`,
      ),
      `- Stock with no sales in ${SALES_DAYS} days: ${deadCount} items`,
    ];
    advice.summary = await chatText(env, env.AI_STOCK_MODEL, [
      {
        role: "system",
        content: [
          "You write a short stock and reorder note for a shop owner.",
          "Use ONLY the lines given. Write one bullet per line that is flagged, most urgent first, saying what to order and why.",
          "Mention the stock with no sales in one final bullet. Do not add other advice or numbers.",
          facts.length === 1 ? "If nothing is flagged, say stock looks healthy." : "",
        ].join("\n"),
      },
      { role: "user", content: `Period ${from} to ${to}, reorder lead time ${LEAD_DAYS} days.\n${facts.join("\n")}` },
    ]);
  }
  return advice;
}
