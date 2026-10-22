/**
 * Sales and refund review for a period: rules over invoices, voids, returns and their lines. Nothing is changed. The
 * model (when configured and switched on) only writes a short note about the flags it is given.
 */
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { currencyDecimals, toMajor, type SalesReview, type SalesReviewFlag } from "@shopbooks/shared";
import { invoiceLines, invoices, saleReturns, users } from "../db/schema";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { aiOn, chatText } from "./ai-gateway";

/** A discount at or above this share of the sale is flagged. */
const DISCOUNT_SHARE = 0.2;
/** A person with this many voids, refunds and big discounts in the period is flagged. */
const STAFF_FLAG_COUNT = 3;
const MAX_FLAGS = 40;

export async function salesReview(
  ctx: Ctx,
  env: Env,
  period: { from: string; to: string },
): Promise<SalesReview> {
  const { from, to } = period;
  const decimals = currencyDecimals(ctx.business.currency);
  const money = (minor: number) => `${ctx.business.currency} ${toMajor(minor, decimals).toFixed(decimals)}`;
  const inRange = (col: typeof invoices.date | typeof saleReturns.date) => and(gte(col, from), lte(col, to));

  const [sold, voids, returns, discounted, lines] = await Promise.all([
    ctx.db
      .select({ id: invoices.id, netTotal: invoices.netTotal, createdBy: invoices.createdBy })
      .from(invoices)
      .where(and(eq(invoices.businessId, ctx.businessId), eq(invoices.status, "completed"), inRange(invoices.date))),
    ctx.db
      .select({
        id: invoices.id,
        number: invoices.number,
        total: invoices.total,
        reason: invoices.voidReason,
        by: invoices.voidedBy,
      })
      .from(invoices)
      .where(and(eq(invoices.businessId, ctx.businessId), eq(invoices.status, "void"), inRange(invoices.date))),
    ctx.db
      .select({
        id: saleReturns.id,
        number: saleReturns.number,
        invoiceId: saleReturns.invoiceId,
        total: saleReturns.total,
        reason: saleReturns.reason,
        by: saleReturns.createdBy,
      })
      .from(saleReturns)
      .where(and(eq(saleReturns.businessId, ctx.businessId), inRange(saleReturns.date))),
    ctx.db
      .select({
        id: invoices.id,
        number: invoices.number,
        subtotal: invoices.subtotal,
        discount: invoices.discountTotal,
        by: invoices.createdBy,
      })
      .from(invoices)
      .where(and(eq(invoices.businessId, ctx.businessId), eq(invoices.status, "completed"), inRange(invoices.date))),
    ctx.db
      .select({
        invoiceId: invoiceLines.invoiceId,
        unitPrice: invoiceLines.unitPrice,
        unitCost: invoiceLines.unitCost,
        name: invoiceLines.name,
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .where(and(eq(invoices.businessId, ctx.businessId), eq(invoices.status, "completed"), inRange(invoices.date))),
  ]);

  const personIds = [...new Set([...voids.map((v) => v.by), ...returns.map((r) => r.by), ...discounted.map((d) => d.by)].filter((x): x is string => !!x))];
  const people = personIds.length
    ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, personIds))
    : [];
  const nameOf = (id: string | null) => (id && people.find((p) => p.id === id)?.name) || "Unknown";

  const flags: (SalesReviewFlag & { by?: string | null })[] = [];

  for (const v of voids) {
    flags.push({
      kind: "void",
      severity: "review",
      title: `Voided ${v.number}`,
      detail: `${money(v.total)} · by ${nameOf(v.by)}${v.reason ? ` · "${v.reason}"` : " · no reason given"}`,
      href: `/sales/view?id=${v.id}`,
      by: v.by,
    });
  }
  for (const r of returns) {
    flags.push({
      kind: "refund",
      severity: r.reason ? "info" : "review",
      title: `Return ${r.number}`,
      detail: `${money(r.total)} · by ${nameOf(r.by)}${r.reason ? ` · "${r.reason}"` : " · no reason given"}`,
      href: `/sales/returns/view?id=${r.id}`,
      by: r.by,
    });
  }

  const bigDiscount = new Set<string>();
  for (const d of discounted) {
    if (d.subtotal > 0 && d.discount / d.subtotal >= DISCOUNT_SHARE) {
      bigDiscount.add(d.id);
      flags.push({
        kind: "discount",
        severity: "review",
        title: `${d.number} discounted ${Math.round((d.discount / d.subtotal) * 100)}%`,
        detail: `${money(d.discount)} off ${money(d.subtotal)} · by ${nameOf(d.by)}`,
        href: `/sales/view?id=${d.id}`,
        by: d.by,
      });
    }
  }

  const belowCost = new Map<string, { count: number; first: string }>();
  for (const l of lines) {
    if (l.unitPrice === null || l.unitCost === null || l.unitCost <= 0) continue;
    if (l.unitPrice >= l.unitCost) continue;
    const hit = belowCost.get(l.invoiceId) ?? { count: 0, first: l.name };
    hit.count++;
    belowCost.set(l.invoiceId, hit);
  }
  for (const [invoiceId, hit] of belowCost) {
    const inv = discounted.find((d) => d.id === invoiceId);
    flags.push({
      kind: "below_cost",
      severity: "review",
      title: `${inv?.number ?? "Sale"} sold below cost`,
      detail: `${hit.count} ${hit.count === 1 ? "line" : "lines"}, first: ${hit.first}`,
      href: `/sales/view?id=${invoiceId}`,
      by: inv?.by,
    });
  }

  // People with several voids, refunds or big discounts in the period.
  const counts = new Map<string, number>();
  for (const f of flags) if (f.by && f.kind !== "below_cost") counts.set(f.by, (counts.get(f.by) ?? 0) + 1);
  for (const [who, n] of counts) {
    if (n >= STAFF_FLAG_COUNT) {
      flags.push({
        kind: "staff",
        severity: "review",
        title: `${nameOf(who)}: ${n} voids, refunds and discounts`,
        detail: `Worth a look at this period's activity for ${nameOf(who)}.`,
        href: "/audit",
      });
    }
  }

  const order: Record<SalesReviewFlag["severity"], number> = { review: 0, info: 1 };
  const sorted = flags
    .map(({ by: _by, ...f }) => f)
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, MAX_FLAGS);

  const review: SalesReview = {
    from,
    to,
    invoices: sold.length,
    netSales: sold.reduce((s, x) => s + x.netTotal, 0),
    flags: sorted,
    summary: null,
  };

  if (aiOn(ctx, env, "salesReview") && env.AI_SALESREVIEW_MODEL && sorted.length > 0) {
    const facts = [
      `Period ${from} to ${to}: ${review.invoices} sales, net ${money(review.netSales)}, ${sorted.length} items flagged`,
      ...sorted.map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`),
    ];
    review.summary = await chatText(env, env.AI_SALESREVIEW_MODEL, [
      {
        role: "system",
        content: [
          "You write a short note for a shop owner about the sales period flagged below.",
          "Use ONLY the lines given. Write 2 or 3 short sentences saying what to look at first and why.",
          "Mention each kind of item you raise. Do not accuse anyone, and do not add numbers or items that are not in the lines.",
        ].join("\n"),
      },
      { role: "user", content: facts.join("\n") },
    ]);
  }
  return review;
}
