import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { promotionSchema, type Promotion, type PromotionStatus } from "@shopbooks/shared";
import { products, promotions, variants } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import type { Ctx } from "../lib/context";
import { notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { vJson } from "../lib/validate";
import { displayName } from "../services/stock";

const app = new Hono<AppEnv>();
const view = requirePerm("products.view");
const manage = requirePerm("products.manage");

type PromoRow = typeof promotions.$inferSelect;

/** Product and variant names for every item in the business, so offers can be listed by name. */
async function itemNames(ctx: Ctx) {
  const productRows = await ctx.db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.businessId, ctx.businessId));
  const variantRows = await ctx.db
    .select({ id: variants.id, productId: variants.productId, variantName: variants.name })
    .from(variants)
    .where(eq(variants.businessId, ctx.businessId));
  const productName = new Map(productRows.map((p) => [p.id, p.name]));
  const variantName = new Map(
    variantRows.map((v) => [v.id, displayName(productName.get(v.productId) ?? "Removed product", v.variantName)]),
  );
  return { productName, variantName };
}

function toDto(p: PromoRow, names: Awaited<ReturnType<typeof itemNames>>, today: string): Promotion {
  const status: PromotionStatus = !p.isActive
    ? "paused"
    : p.startDate > today
      ? "scheduled"
      : p.endDate && p.endDate < today
        ? "expired"
        : "active";
  const itemName = p.variantId
    ? (names.variantName.get(p.variantId) ?? "Removed item")
    : (names.productName.get(p.productId ?? "") ?? "Removed item");
  return {
    id: p.id,
    name: p.name,
    productId: p.productId,
    productName: p.productId ? (names.productName.get(p.productId) ?? null) : null,
    variantId: p.variantId,
    itemName,
    kind: p.kind as Promotion["kind"],
    value: p.value,
    startDate: p.startDate,
    endDate: p.endDate,
    isActive: p.isActive,
    status,
    createdAt: p.createdAt,
  };
}

/** Checks the item belongs to this business and returns the product it sits under. */
async function resolveItem(ctx: Ctx, input: { productId?: string | null; variantId?: string | null }) {
  if (input.variantId) {
    const [v] = await ctx.db
      .select({ productId: variants.productId, businessId: variants.businessId })
      .from(variants)
      .where(eq(variants.id, input.variantId));
    if (!v || v.businessId !== ctx.businessId) throw notFound("Variant");
    return { productId: v.productId, variantId: input.variantId };
  }
  const [p] = await ctx.db
    .select({ id: products.id, businessId: products.businessId })
    .from(products)
    .where(eq(products.id, input.productId ?? ""));
  if (!p || p.businessId !== ctx.businessId) throw notFound("Product");
  return { productId: p.id, variantId: null };
}

app.get("/", view, async (c) => {
  const ctx = c.get("ctx");
  const rows = await ctx.db
    .select()
    .from(promotions)
    .where(eq(promotions.businessId, ctx.businessId));
  const names = await itemNames(ctx);
  const dtos = rows.map((r) => toDto(r, names, ctx.today));
  // Running offers first, then scheduled, paused and expired; newest first within each group.
  const rank: Record<PromotionStatus, number> = { active: 0, scheduled: 1, paused: 2, expired: 3 };
  dtos.sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt - a.createdAt);
  return c.json(dtos);
});

app.post("/", manage, vJson(promotionSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const target = await resolveItem(ctx, input);
  const now = ctx.now;
  const id = newId();
  await ctx.db.insert(promotions).values({
    id,
    businessId: ctx.businessId,
    name: input.name,
    productId: target.productId,
    variantId: target.variantId,
    kind: input.kind,
    value: input.value,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    isActive: input.isActive,
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await ctx.db.select().from(promotions).where(eq(promotions.id, id));
  return c.json(toDto(row!, await itemNames(ctx), ctx.today), 201);
});

app.put("/:id", manage, vJson(promotionSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const [existing] = await ctx.db
    .select()
    .from(promotions)
    .where(eq(promotions.id, id));
  if (!existing || existing.businessId !== ctx.businessId) throw notFound("Promotion");
  const target = await resolveItem(ctx, input);
  await ctx.db
    .update(promotions)
    .set({
      name: input.name,
      productId: target.productId,
      variantId: target.variantId,
      kind: input.kind,
      value: input.value,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      isActive: input.isActive,
      updatedAt: ctx.now,
    })
    .where(eq(promotions.id, id));
  const [row] = await ctx.db.select().from(promotions).where(eq(promotions.id, id));
  return c.json(toDto(row!, await itemNames(ctx), ctx.today));
});

app.delete("/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const [existing] = await ctx.db
    .select({ businessId: promotions.businessId })
    .from(promotions)
    .where(eq(promotions.id, id));
  if (!existing || existing.businessId !== ctx.businessId) throw notFound("Promotion");
  await ctx.db.delete(promotions).where(eq(promotions.id, id));
  return c.json({ ok: true });
});

export default app;
