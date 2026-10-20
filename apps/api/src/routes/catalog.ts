import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { brandSchema, categorySchema, unitSchema, type Brand, type Category, type Unit } from "@shopbooks/shared";
import { brands, categories, products, units } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import type { Stmt } from "../lib/batch";
import { runBatch } from "../lib/batch";
import type { Ctx } from "../lib/context";
import { badRequest, conflict, notFound } from "../lib/errors";
import { clean } from "../lib/http";
import { newId } from "../lib/ids";
import { vJson } from "../lib/validate";

const app = new Hono<AppEnv>();
const view = requirePerm("products.view");
const manage = requirePerm("products.manage");

// ---------------------------------------------------------------- categories

async function listCategories(ctx: Ctx): Promise<Category[]> {
  const rows = await ctx.db
    .select({
      c: categories,
      productCount: sql<number>`(SELECT count(*) FROM products p WHERE p.category_id = ${categories.id} AND p.business_id = ${ctx.businessId})`,
    })
    .from(categories)
    .where(eq(categories.businessId, ctx.businessId))
    .orderBy(asc(categories.name));
  return rows.map(({ c, productCount }) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    color: c.color,
    description: c.description,
    productCount: Number(productCount) || 0,
  }));
}

async function assertCategoryParent(ctx: Ctx, parentId: string | null | undefined, selfId?: string): Promise<string | null> {
  if (!parentId) return null;
  if (parentId === selfId) throw badRequest("A category can't be its own parent");
  const all = await ctx.db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.businessId, ctx.businessId));
  const byId = new Map(all.map((c) => [c.id, c.parentId]));
  if (!byId.has(parentId)) throw badRequest("Unknown parent category");
  if (selfId) {
    // Prevent cycles: walk up from the new parent.
    let cur: string | null | undefined = parentId;
    let guard = 0;
    while (cur && guard++ < 100) {
      if (cur === selfId) throw badRequest("That would create a circular category hierarchy");
      cur = byId.get(cur) ?? null;
    }
  }
  return parentId;
}

app.get("/categories", view, async (c) => c.json(await listCategories(c.get("ctx"))));

app.post("/categories", manage, vJson(categorySchema), async (c) => {
  const ctx = c.get("ctx");
  const input = clean(c.req.valid("json"));
  const parentId = await assertCategoryParent(ctx, input.parentId);
  const id = newId();
  await ctx.db.insert(categories).values({
    id,
    businessId: ctx.businessId,
    name: input.name,
    parentId,
    color: input.color ?? null,
    description: input.description ?? null,
    createdAt: Date.now(),
  });
  const all = await listCategories(ctx);
  return c.json(all.find((x) => x.id === id), 201);
});

app.put("/categories/:id", manage, vJson(categorySchema), async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const input = clean(c.req.valid("json"));
  const parentId = await assertCategoryParent(ctx, input.parentId, id);
  const [row] = await ctx.db
    .update(categories)
    .set({ name: input.name, parentId, color: input.color ?? null, description: input.description ?? null })
    .where(and(eq(categories.id, id), eq(categories.businessId, ctx.businessId)))
    .returning();
  if (!row) throw notFound("Category");
  const all = await listCategories(ctx);
  return c.json(all.find((x) => x.id === id));
});

app.delete("/categories/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const [row] = await ctx.db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.businessId, ctx.businessId)));
  if (!row) throw notFound("Category");
  await runBatch(ctx.db, [
    ctx.db
      .update(products)
      .set({ categoryId: null })
      .where(and(eq(products.businessId, ctx.businessId), eq(products.categoryId, id))) as unknown as Stmt,
    ctx.db
      .update(categories)
      .set({ parentId: null })
      .where(and(eq(categories.businessId, ctx.businessId), eq(categories.parentId, id))) as unknown as Stmt,
    ctx.db.delete(categories).where(and(eq(categories.id, id), eq(categories.businessId, ctx.businessId))) as unknown as Stmt,
  ]);
  return c.json({ ok: true as const });
});

// ---------------------------------------------------------------- brands

async function listBrands(ctx: Ctx): Promise<Brand[]> {
  const rows = await ctx.db
    .select({
      b: brands,
      productCount: sql<number>`(SELECT count(*) FROM products p WHERE p.brand_id = ${brands.id} AND p.business_id = ${ctx.businessId})`,
    })
    .from(brands)
    .where(eq(brands.businessId, ctx.businessId))
    .orderBy(asc(brands.name));
  return rows.map(({ b, productCount }) => ({ id: b.id, name: b.name, productCount: Number(productCount) || 0 }));
}

app.get("/brands", view, async (c) => c.json(await listBrands(c.get("ctx"))));

app.post("/brands", manage, vJson(brandSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const id = newId();
  await ctx.db.insert(brands).values({ id, businessId: ctx.businessId, name: input.name.trim(), createdAt: Date.now() });
  return c.json({ id, name: input.name.trim(), productCount: 0 } satisfies Brand, 201);
});

app.put("/brands/:id", manage, vJson(brandSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const [row] = await ctx.db
    .update(brands)
    .set({ name: input.name.trim() })
    .where(and(eq(brands.id, id), eq(brands.businessId, ctx.businessId)))
    .returning();
  if (!row) throw notFound("Brand");
  const all = await listBrands(ctx);
  return c.json(all.find((x) => x.id === id));
});

app.delete("/brands/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const [row] = await ctx.db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, id), eq(brands.businessId, ctx.businessId)));
  if (!row) throw notFound("Brand");
  await runBatch(ctx.db, [
    ctx.db
      .update(products)
      .set({ brandId: null })
      .where(and(eq(products.businessId, ctx.businessId), eq(products.brandId, id))) as unknown as Stmt,
    ctx.db.delete(brands).where(and(eq(brands.id, id), eq(brands.businessId, ctx.businessId))) as unknown as Stmt,
  ]);
  return c.json({ ok: true as const });
});

// ---------------------------------------------------------------- units

function mapUnit(u: typeof units.$inferSelect): Unit {
  return { id: u.id, name: u.name, shortName: u.shortName, allowDecimal: u.allowDecimal };
}

app.get("/units", view, async (c) => {
  const ctx = c.get("ctx");
  const rows = await ctx.db.select().from(units).where(eq(units.businessId, ctx.businessId)).orderBy(asc(units.name));
  return c.json(rows.map(mapUnit));
});

app.post("/units", manage, vJson(unitSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const [row] = await ctx.db
    .insert(units)
    .values({
      id: newId(),
      businessId: ctx.businessId,
      name: input.name.trim(),
      shortName: input.shortName.trim(),
      allowDecimal: input.allowDecimal,
      createdAt: Date.now(),
    })
    .returning();
  return c.json(mapUnit(row!), 201);
});

app.put("/units/:id", manage, vJson(unitSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const [row] = await ctx.db
    .update(units)
    .set({ name: input.name.trim(), shortName: input.shortName.trim(), allowDecimal: input.allowDecimal })
    .where(and(eq(units.id, id), eq(units.businessId, ctx.businessId)))
    .returning();
  if (!row) throw notFound("Unit");
  return c.json(mapUnit(row));
});

app.delete("/units/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const [row] = await ctx.db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, id), eq(units.businessId, ctx.businessId)));
  if (!row) throw notFound("Unit");
  const [{ n } = { n: 0 }] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(and(eq(products.businessId, ctx.businessId), eq(products.unitId, id)));
  if (Number(n) > 0) throw conflict("This unit is used by products. Change those products first.");
  await ctx.db.delete(units).where(and(eq(units.id, id), eq(units.businessId, ctx.businessId)));
  return c.json({ ok: true as const });
});

export default app;
