import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type {
  Product,
  ProductListItem,
  ProductOption,
  ProductType,
  PromotionTerms,
  SellableItem,
  Variant,
  VariantStock,
} from "@shopbooks/shared";
import { brands, categories, locations, products, stockLevels, taxRates, units, variants } from "../db/schema";
import type { Ctx } from "../lib/context";
import { notFound } from "../lib/errors";
import { likeQ, pageParams, paged } from "../lib/http";
import { promotionsFor } from "./promotions";
import { displayName } from "./stock";

// ---------------------------------------------------------------- product detail

export async function getProductDto(ctx: Ctx, id: string): Promise<Product> {
  const [row] = await ctx.db
    .select({
      p: products,
      categoryName: categories.name,
      brandName: brands.name,
      unitName: units.name,
      unitShortName: units.shortName,
      allowDecimal: units.allowDecimal,
      taxRate: taxRates.rate,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(units, eq(units.id, products.unitId))
    .leftJoin(taxRates, eq(taxRates.id, products.taxRateId))
    .where(and(eq(products.id, id), eq(products.businessId, ctx.businessId)));
  if (!row) throw notFound("Product");

  const vrows = await ctx.db
    .select()
    .from(variants)
    .where(and(eq(variants.productId, id), eq(variants.businessId, ctx.businessId)))
    .orderBy(asc(variants.sortOrder), asc(variants.createdAt));

  const stockByVariant = new Map<string, VariantStock[]>();
  const ids = vrows.map((v) => v.id);
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const srows = await ctx.db
      .select({
        variantId: stockLevels.variantId,
        locationId: stockLevels.locationId,
        locationName: locations.name,
        quantity: stockLevels.quantity,
      })
      .from(stockLevels)
      .innerJoin(locations, eq(locations.id, stockLevels.locationId))
      .where(inArray(stockLevels.variantId, chunk))
      .orderBy(asc(locations.name));
    for (const s of srows) {
      const list = stockByVariant.get(s.variantId) ?? [];
      list.push({ locationId: s.locationId, locationName: s.locationName, quantity: s.quantity });
      stockByVariant.set(s.variantId, list);
    }
  }

  const p = row.p;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    type: p.type as ProductType,
    categoryId: p.categoryId,
    categoryName: row.categoryName ?? null,
    brandId: p.brandId,
    brandName: row.brandName ?? null,
    unitId: p.unitId,
    unitName: row.unitName ?? null,
    unitShortName: row.unitShortName ?? null,
    allowDecimal: !!row.allowDecimal,
    taxRateId: p.taxRateId,
    taxRate: row.taxRate ?? 0,
    trackInventory: p.trackInventory,
    hasVariants: p.hasVariants,
    options: (p.options ?? []) as ProductOption[],
    imageUrl: p.imageUrl,
    tags: p.tags,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    variants: vrows.map((v): Variant => {
      const byLoc = stockByVariant.get(v.id) ?? [];
      return {
        id: v.id,
        productId: v.productId,
        name: v.name,
        options: v.options ?? {},
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
        wholesalePrice: v.wholesalePrice,
        costPrice: v.costPrice,
        mrp: v.mrp,
        reorderLevel: v.reorderLevel,
        isActive: v.isActive,
        stock: Math.round(byLoc.reduce((s, l) => s + l.quantity, 0) * 1000) / 1000,
        stockByLocation: byLoc,
      };
    }),
  };
}

// ---------------------------------------------------------------- product list

export interface ProductListQuery {
  page: number;
  pageSize: number;
  q?: string;
  categoryId?: string;
  brandId?: string;
  status?: "active" | "archived" | "all";
  stock?: "low" | "out" | "in";
  type?: "standard" | "service";
  locationId?: string;
  sort?: string;
  order?: "asc" | "desc";
}

/** Stock of one variant (correlated on `variantIdSql`), optionally at a location. */
function variantStockSql(variantIdSql: SQL, locationId?: string) {
  return locationId
    ? sql`(SELECT coalesce(sum(sl.quantity), 0) FROM stock_levels sl WHERE sl.variant_id = ${variantIdSql} AND sl.location_id = ${locationId})`
    : sql`(SELECT coalesce(sum(sl.quantity), 0) FROM stock_levels sl WHERE sl.variant_id = ${variantIdSql})`;
}

export async function listProducts(ctx: Ctx, q: ProductListQuery) {
  const { limit, offset } = pageParams(q);
  const threshold = ctx.business.lowStockThreshold;
  const pid = sql`${products.id}`;

  const totalStock = q.locationId
    ? sql<number>`(SELECT coalesce(sum(sl.quantity), 0) FROM stock_levels sl JOIN variants vs ON vs.id = sl.variant_id WHERE vs.product_id = ${pid} AND sl.location_id = ${q.locationId})`
    : sql<number>`(SELECT coalesce(sum(sl.quantity), 0) FROM stock_levels sl JOIN variants vs ON vs.id = sl.variant_id WHERE vs.product_id = ${pid})`;
  const lowExists = sql<number>`EXISTS (SELECT 1 FROM variants vl WHERE vl.product_id = ${pid} AND vl.is_active = 1 AND ${variantStockSql(
    sql.raw("vl.id"),
    q.locationId,
  )} <= coalesce(vl.reorder_level, ${threshold}))`;
  const tracked = sql`(${products.trackInventory} = 1 AND ${products.type} <> 'service')`;

  const conds: SQL[] = [eq(products.businessId, ctx.businessId)];
  const status = q.status ?? "active";
  if (status === "active") conds.push(eq(products.isActive, true));
  if (status === "archived") conds.push(eq(products.isActive, false));
  if (q.categoryId) conds.push(eq(products.categoryId, q.categoryId));
  if (q.brandId) conds.push(eq(products.brandId, q.brandId));
  if (q.type) conds.push(eq(products.type, q.type));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(
      sql`(${products.name} LIKE ${term} OR ${products.tags} LIKE ${term} OR EXISTS (SELECT 1 FROM variants vq WHERE vq.product_id = ${pid} AND (vq.sku LIKE ${term} OR vq.barcode LIKE ${term} OR vq.name LIKE ${term})))`,
    );
  }
  if (q.stock === "out") conds.push(sql`${tracked} AND ${totalStock} <= 0`);
  if (q.stock === "in") conds.push(sql`${tracked} AND ${totalStock} > 0`);
  if (q.stock === "low") conds.push(sql`${tracked} AND ${totalStock} > 0 AND ${lowExists}`);
  const where = and(...conds);

  const dir = q.order === "desc" ? "desc" : "asc";
  let orderBy: SQL;
  switch (q.sort) {
    case "updatedAt":
      orderBy = q.order === "asc" ? asc(products.updatedAt) : desc(products.updatedAt);
      break;
    case "createdAt":
      orderBy = q.order === "asc" ? asc(products.createdAt) : desc(products.createdAt);
      break;
    case "stock":
      orderBy = dir === "desc" ? sql`${totalStock} desc` : sql`${totalStock} asc`;
      break;
    case "price":
      orderBy =
        dir === "desc"
          ? sql`(SELECT min(price) FROM variants vp WHERE vp.product_id = ${pid}) desc`
          : sql`(SELECT min(price) FROM variants vp WHERE vp.product_id = ${pid}) asc`;
      break;
    default:
      orderBy = dir === "desc" ? sql`${products.name} COLLATE NOCASE desc` : sql`${products.name} COLLATE NOCASE asc`;
  }

  const activeVar = sql`(CASE WHEN EXISTS (SELECT 1 FROM variants va WHERE va.product_id = ${pid} AND va.is_active = 1) THEN 1 ELSE 0 END)`;
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select({
        p: products,
        categoryName: categories.name,
        brandName: brands.name,
        variantCount: sql<number>`(SELECT count(*) FROM variants vc WHERE vc.product_id = ${pid} AND vc.is_active = 1)`,
        sku: sql<string | null>`(SELECT vk.sku FROM variants vk WHERE vk.product_id = ${pid} ORDER BY vk.is_active DESC, vk.sort_order ASC LIMIT 1)`,
        priceMin: sql<number>`(SELECT coalesce(min(vp.price), 0) FROM variants vp WHERE vp.product_id = ${pid} AND (vp.is_active = 1 OR ${activeVar} = 0))`,
        priceMax: sql<number>`(SELECT coalesce(max(vp.price), 0) FROM variants vp WHERE vp.product_id = ${pid} AND (vp.is_active = 1 OR ${activeVar} = 0))`,
        costMin: sql<number>`(SELECT coalesce(min(vp.cost_price), 0) FROM variants vp WHERE vp.product_id = ${pid} AND (vp.is_active = 1 OR ${activeVar} = 0))`,
        totalStock,
        lowStock: lowExists,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(where)
      .orderBy(orderBy, asc(products.id))
      .limit(limit)
      .offset(offset),
    ctx.db.select({ n: sql<number>`count(*)` }).from(products).where(where),
  ]);

  const data = rows.map((r): ProductListItem => {
    const isTracked = r.p.trackInventory && r.p.type !== "service";
    return {
      id: r.p.id,
      name: r.p.name,
      type: r.p.type as ProductType,
      imageUrl: r.p.imageUrl,
      categoryId: r.p.categoryId,
      categoryName: r.categoryName ?? null,
      brandName: r.brandName ?? null,
      hasVariants: r.p.hasVariants,
      variantCount: Number(r.variantCount) || 0,
      sku: r.sku ?? null,
      priceMin: Number(r.priceMin) || 0,
      priceMax: Number(r.priceMax) || 0,
      costMin: Number(r.costMin) || 0,
      totalStock: Math.round((Number(r.totalStock) || 0) * 1000) / 1000,
      trackInventory: isTracked,
      lowStock: isTracked && !!Number(r.lowStock),
      isActive: r.p.isActive,
      updatedAt: r.p.updatedAt,
    };
  });
  return paged(data, Number(count?.n ?? 0), q);
}

// ---------------------------------------------------------------- sellable items (POS / pickers)

function sellableSelect(ctx: Ctx, locationId?: string) {
  return ctx.db
    .select({
      v: variants,
      productName: products.name,
      productTags: products.tags,
      type: products.type,
      trackInventory: products.trackInventory,
      taxRateId: products.taxRateId,
      imageUrl: products.imageUrl,
      categoryId: products.categoryId,
      categoryName: categories.name,
      unitShortName: units.shortName,
      allowDecimal: units.allowDecimal,
      taxRate: taxRates.rate,
      stock: sql<number>`${variantStockSql(sql`${variants.id}`, locationId)}`,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(units, eq(units.id, products.unitId))
    .leftJoin(taxRates, eq(taxRates.id, products.taxRateId));
}

type SellableRow = Awaited<ReturnType<ReturnType<typeof sellableSelect>["where"]>>[number];

function mapSellable(r: SellableRow, promotion: PromotionTerms | null): SellableItem {
  const tracked = r.trackInventory && r.type !== "service";
  return {
    variantId: r.v.id,
    promotion,
    productId: r.v.productId,
    productName: r.productName,
    variantName: r.v.name,
    displayName: displayName(r.productName, r.v.name),
    options: r.v.options ?? {},
    sku: r.v.sku,
    barcode: r.v.barcode,
    price: r.v.price,
    wholesalePrice: r.v.wholesalePrice,
    costPrice: r.v.costPrice,
    mrp: r.v.mrp,
    taxRateId: r.taxRateId,
    taxRate: r.taxRateId ? (r.taxRate ?? 0) : 0,
    type: r.type as ProductType,
    trackInventory: tracked,
    stock: Math.round((Number(r.stock) || 0) * 1000) / 1000,
    imageUrl: r.imageUrl,
    unitShortName: r.unitShortName ?? null,
    allowDecimal: !!r.allowDecimal,
    categoryId: r.categoryId,
    categoryName: r.categoryName ?? null,
  };
}

export async function searchSellable(
  ctx: Ctx,
  q: { q?: string; locationId?: string; categoryId?: string; limit: number; includeServices: boolean },
): Promise<SellableItem[]> {
  const conds: SQL[] = [
    eq(variants.businessId, ctx.businessId),
    eq(variants.isActive, true),
    eq(products.isActive, true),
  ];
  if (q.categoryId) conds.push(eq(products.categoryId, q.categoryId));
  if (!q.includeServices) conds.push(sql`${products.type} <> 'service'`);
  const term = q.q?.trim() ?? "";
  if (term) {
    const tokens = term.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const t of tokens) {
      const like = likeQ(t);
      conds.push(
        sql`(${products.name} LIKE ${like} OR ${variants.name} LIKE ${like} OR ${variants.sku} LIKE ${like} OR ${variants.barcode} LIKE ${like} OR ${products.tags} LIKE ${like})`,
      );
    }
  }
  // Exact code / prefix matches first. (A bare constant like `ORDER BY 0` is read by SQLite as a column position.)
  const order = [sql`${products.name} COLLATE NOCASE`, asc(variants.sortOrder)];
  if (term) {
    order.unshift(
      sql`CASE WHEN upper(${variants.barcode}) = upper(${term}) OR upper(${variants.sku}) = upper(${term}) THEN 0 WHEN ${products.name} LIKE ${`${term}%`} THEN 1 ELSE 2 END`,
    );
  }
  const rows = await sellableSelect(ctx, q.locationId)
    .where(and(...conds))
    .orderBy(...order)
    .limit(q.limit);
  const promos = await promotionsFor(ctx, rows.map((r) => ({ variantId: r.v.id, productId: r.v.productId })));
  return rows.map((r) => mapSellable(r, promos.get(r.v.id) ?? null));
}

export async function lookupSellable(ctx: Ctx, code: string, locationId?: string): Promise<SellableItem> {
  const c = code.trim();
  if (!c) throw notFound("Product");
  const rows = await sellableSelect(ctx, locationId)
    .where(
      and(
        eq(variants.businessId, ctx.businessId),
        eq(variants.isActive, true),
        eq(products.isActive, true),
        sql`(upper(${variants.barcode}) = upper(${c}) OR upper(${variants.sku}) = upper(${c}))`,
      ),
    )
    .orderBy(sql`CASE WHEN upper(${variants.barcode}) = upper(${c}) THEN 0 ELSE 1 END`)
    .limit(1);
  if (!rows[0]) throw notFound("Product");
  const promos = await promotionsFor(ctx, [{ variantId: rows[0].v.id, productId: rows[0].v.productId }]);
  return mapSellable(rows[0], promos.get(rows[0].v.id) ?? null);
}

/**
 * Sellable variants matching any of the terms, most matching terms first. Used by the AI product search when the
 * normal search finds nothing. Short terms (sizes like "M") only count as whole words, so they don't match everything.
 */
export async function searchSellableByTerms(
  ctx: Ctx,
  q: { terms: string[]; locationId?: string; limit: number },
): Promise<SellableItem[]> {
  const terms = [...new Set(q.terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 1))].slice(0, 12);
  if (terms.length === 0) return [];
  const ors = terms.map((t) => {
    const like = likeQ(t);
    return sql`(${products.name} LIKE ${like} OR ${variants.name} LIKE ${like} OR ${variants.sku} LIKE ${like} OR ${variants.barcode} LIKE ${like} OR ${products.tags} LIKE ${like})`;
  });
  const rows = await sellableSelect(ctx, q.locationId)
    .where(
      and(
        eq(variants.businessId, ctx.businessId),
        eq(variants.isActive, true),
        eq(products.isActive, true),
        sql`${products.type} <> 'service'`,
        sql`(${sql.join(ors, sql` OR `)})`,
      ),
    )
    .limit(300);

  const matches = (hay: string, t: string) =>
    t.length <= 2 ? new RegExp(`(^|[^a-z0-9])${t.replace(/[^a-z0-9]/g, "")}($|[^a-z0-9])`).test(hay) : hay.includes(t);
  const scored = rows.map((r) => {
    const hay = `${r.productName} ${r.productTags ?? ""} ${r.v.name} ${r.v.sku ?? ""} ${r.v.barcode ?? ""}`.toLowerCase();
    return { r, score: terms.filter((t) => matches(hay, t)).length };
  });
  scored.sort((a, b) => b.score - a.score || a.r.productName.localeCompare(b.r.productName));
  const top = scored.filter((s) => s.score > 0).slice(0, q.limit);
  const promos = await promotionsFor(ctx, top.map((s) => ({ variantId: s.r.v.id, productId: s.r.v.productId })));
  return top.map((s) => mapSellable(s.r, promos.get(s.r.v.id) ?? null));
}
