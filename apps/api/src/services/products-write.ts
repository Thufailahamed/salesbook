import { and, eq, inArray, or, sql } from "drizzle-orm";
import { roundHalfAway, type ProductInput, type VariantInput } from "@shopbooks/shared";
import {
  brands,
  categories,
  invoiceLines,
  locations,
  products,
  purchaseLines,
  stockLevels,
  stockLots,
  stockMovements,
  taxRates,
  units,
  variants,
} from "../db/schema";
import { insertMany, type Stmt } from "../lib/batch";
import type { Ctx } from "../lib/context";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { queueOpeningStock, type OpeningStockItem } from "./inventory";
import { reserveNumbers } from "./sequences";
import { loadStockCoster, stockTotals } from "./stock";
import { Tx } from "./tx";

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof variants.$inferSelect;

interface NormalizedVariant {
  id: string;
  existing: VariantRow | null;
  name: string;
  options: Record<string, string>;
  sku: string | null;
  barcode: string | null;
  price: number;
  wholesalePrice: number | null;
  costPrice: number;
  mrp: number | null;
  reorderLevel: number | null;
  isActive: boolean;
  sortOrder: number;
  openingStock: { locationId: string; quantity: number }[];
}

const trimOrNull = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

async function assertRefs(ctx: Ctx, input: ProductInput) {
  const must = (rows: { id: string }[], what: string) => {
    if (!rows[0]) throw badRequest(`Unknown ${what}`);
  };
  const bid = ctx.businessId;
  if (input.categoryId) {
    must(
      await ctx.db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, input.categoryId), eq(categories.businessId, bid))),
      "category",
    );
  }
  if (input.brandId) {
    must(
      await ctx.db.select({ id: brands.id }).from(brands).where(and(eq(brands.id, input.brandId), eq(brands.businessId, bid))),
      "brand",
    );
  }
  if (input.taxRateId) {
    must(
      await ctx.db
        .select({ id: taxRates.id })
        .from(taxRates)
        .where(and(eq(taxRates.id, input.taxRateId), eq(taxRates.businessId, bid))),
      "tax rate",
    );
  }
}

function initials(name: string) {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let out = words.map((w) => w[0]).join("").slice(0, 4);
  if (out.length < 2) out = (words[0] ?? "ITEM").slice(0, 4);
  return out || "ITEM";
}

function optionSuffix(options: Record<string, string>) {
  return Object.values(options)
    .map((v) =>
      v
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 3),
    )
    .filter(Boolean)
    .join("-");
}

/** Codes (sku/barcode) already used by OTHER variants in the business. */
async function usedCodes(ctx: Ctx, codes: string[], excludeVariantIds: Set<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>(); // CODE -> variant id
  const unique = [...new Set(codes.map((c) => c.toUpperCase()))];
  for (let i = 0; i < unique.length; i += 45) {
    const chunk = unique.slice(i, i + 45);
    const rows = await ctx.db
      .select({ id: variants.id, sku: variants.sku, barcode: variants.barcode })
      .from(variants)
      .where(
        and(
          eq(variants.businessId, ctx.businessId),
          or(inArray(sql`upper(${variants.sku})`, chunk), inArray(sql`upper(${variants.barcode})`, chunk)),
        ),
      );
    for (const r of rows) {
      if (excludeVariantIds.has(r.id)) continue;
      if (r.sku) out.set(r.sku.toUpperCase(), r.id);
      if (r.barcode) out.set(r.barcode.toUpperCase(), r.id);
    }
  }
  return out;
}

/** Validates & normalizes the product payload. */
async function normalize(ctx: Ctx, input: ProductInput, existingProduct: ProductRow | null, existingVariants: VariantRow[]) {
  await assertRefs(ctx, input);
  let allowDecimal = false;
  if (input.unitId) {
    const [u] = await ctx.db
      .select()
      .from(units)
      .where(and(eq(units.id, input.unitId), eq(units.businessId, ctx.businessId)));
    if (!u) throw badRequest("Unknown unit");
    allowDecimal = u.allowDecimal;
  }

  const trackInventory = input.type === "service" ? false : input.trackInventory;
  const hasVariants = input.hasVariants;
  let options: { name: string; values: string[] }[] = [];

  const existingById = new Map(existingVariants.map((v) => [v.id, v]));
  for (const v of input.variants) {
    if (v.id && !existingById.has(v.id)) throw badRequest("A variant does not belong to this product");
  }

  if (!hasVariants) {
    if (input.variants.length !== 1) throw badRequest("A product without variants must have exactly one price/SKU row");
  } else {
    if (input.options.length === 0) throw badRequest("Add at least one option (e.g. Size or Color) for a product with variants");
    const names = new Set<string>();
    options = input.options.map((o) => {
      const name = o.name.trim();
      const key = name.toLowerCase();
      if (names.has(key)) throw badRequest(`Option "${name}" is listed twice`);
      names.add(key);
      const values = [...new Set(o.values.map((v) => v.trim()).filter(Boolean))];
      if (values.length === 0) throw badRequest(`Option "${name}" needs at least one value`);
      return { name, values };
    });
  }

  const combos = new Set<string>();
  const normalized: NormalizedVariant[] = input.variants.map((v: VariantInput, i) => {
    let opts: Record<string, string> = {};
    let name = "";
    if (hasVariants) {
      for (const o of options) {
        const raw = Object.entries(v.options ?? {}).find(([k]) => k.trim().toLowerCase() === o.name.toLowerCase())?.[1];
        const value = raw?.trim();
        if (!value) throw badRequest(`Every variant needs a value for "${o.name}"`);
        const match = o.values.find((x) => x.toLowerCase() === value.toLowerCase());
        if (!match) throw badRequest(`"${value}" is not one of the values for "${o.name}"`);
        opts[o.name] = match;
      }
      const key = options.map((o) => opts[o.name]!.toLowerCase()).join("\u0000");
      if (combos.has(key)) throw badRequest(`Duplicate variant: ${options.map((o) => opts[o.name]).join(" / ")}`);
      combos.add(key);
      name = v.name?.trim() || options.map((o) => opts[o.name]).join(" / ");
    } else {
      opts = {};
      name = "";
    }
    const existing = v.id ? existingById.get(v.id)! : null;
    for (const s of v.openingStock ?? []) {
      if (!allowDecimal && !Number.isInteger(s.quantity)) throw badRequest("Opening stock must be whole units for this unit");
    }
    return {
      id: existing?.id ?? newId(),
      existing,
      name,
      options: opts,
      sku: trimOrNull(v.sku),
      barcode: trimOrNull(v.barcode),
      price: v.price,
      wholesalePrice: v.wholesalePrice ?? null,
      costPrice: v.costPrice ?? 0,
      mrp: v.mrp ?? null,
      reorderLevel: v.reorderLevel ?? null,
      isActive: v.isActive ?? true,
      sortOrder: i,
      openingStock: existing ? [] : (v.openingStock ?? []).filter((s) => s.quantity > 0),
    };
  });

  // ---- code uniqueness (sku / barcode) within the request and against other variants
  const seen = new Map<string, string>(); // CODE -> variant id in request
  for (const v of normalized) {
    for (const code of [v.sku, v.barcode]) {
      if (!code) continue;
      const k = code.toUpperCase();
      const owner = seen.get(k);
      if (owner && owner !== v.id) throw conflict(`The code "${code}" is used by more than one variant`);
      seen.set(k, v.id);
    }
  }
  // Codes held by this product's own variants (kept, re-ordered or being replaced) don't count as clashes.
  const exclude = new Set(existingVariants.map((v) => v.id));
  const taken = await usedCodes(ctx, [...seen.keys()], exclude);
  for (const v of normalized) {
    for (const code of [v.sku, v.barcode]) {
      if (code && taken.has(code.toUpperCase())) {
        throw conflict(`The code "${code}" is already used by another product`);
      }
    }
  }

  // ---- auto-generate missing SKUs
  const missing = normalized.filter((v) => !v.sku);
  if (missing.length > 0) {
    const base = initials(input.name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const stem = `${base}-${String(1000 + Math.floor(Math.random() * 9000))}`;
      const candidates = missing.map((v) => {
        const suffix = hasVariants ? optionSuffix(v.options) : "";
        return suffix ? `${stem}-${suffix}` : stem;
      });
      const dupInRequest = candidates.some((cnd, i) => candidates.indexOf(cnd) !== i || seen.has(cnd.toUpperCase()));
      if (dupInRequest) continue;
      const clash = await usedCodes(ctx, candidates, exclude);
      if (clash.size === 0) {
        missing.forEach((v, i) => {
          v.sku = candidates[i]!;
          seen.set(candidates[i]!.toUpperCase(), v.id);
        });
        break;
      }
    }
    // Fallback: unique by id suffix.
    for (const v of missing) if (!v.sku) v.sku = `${base}-${v.id.slice(-6)}`;
  }

  // ---- opening stock locations
  const locIds = [...new Set(normalized.flatMap((v) => v.openingStock.map((s) => s.locationId)))];
  if (locIds.length > 0) {
    const locs = await ctx.db
      .select()
      .from(locations)
      .where(and(eq(locations.businessId, ctx.businessId), inArray(locations.id, locIds)));
    for (const id of locIds) {
      const l = locs.find((x) => x.id === id);
      if (!l) throw badRequest("Unknown location for opening stock");
      if (!l.isActive) throw badRequest(`${l.name} is inactive`);
    }
  }

  void existingProduct;
  return { trackInventory, hasVariants, options, normalized, locIds };
}

function variantInsertRow(ctx: Ctx, productId: string, v: NormalizedVariant) {
  return {
    id: v.id,
    businessId: ctx.businessId,
    productId,
    name: v.name,
    options: v.options,
    sku: v.sku,
    barcode: v.barcode,
    price: v.price,
    wholesalePrice: v.wholesalePrice,
    costPrice: v.costPrice,
    mrp: v.mrp,
    reorderLevel: v.reorderLevel,
    isActive: v.isActive,
    sortOrder: v.sortOrder,
    createdAt: ctx.now,
  };
}

async function queueOpeningStockFor(ctx: Ctx, tx: Tx, productId: string, list: NormalizedVariant[], trackInventory: boolean) {
  if (!trackInventory) return;
  const byLoc = new Map<string, OpeningStockItem[]>();
  for (const v of list) {
    for (const s of v.openingStock) {
      const items = byLoc.get(s.locationId) ?? [];
      items.push({ variantId: v.id, productId, quantity: s.quantity, unitCost: v.costPrice });
      byLoc.set(s.locationId, items);
    }
  }
  if (byLoc.size === 0) return;
  const { adjustment } = await reserveNumbers(ctx, { adjustment: byLoc.size });
  let i = 0;
  for (const [locationId, items] of byLoc) {
    await queueOpeningStock(ctx, tx, { locationId, number: adjustment[i++]!, date: ctx.today, items });
  }
}

export async function createProduct(ctx: Ctx, input: ProductInput): Promise<string> {
  ctx.require("products.manage");
  const n = await normalize(ctx, input, null, []);
  const productId = newId();
  const tx = new Tx(ctx);
  tx.add(
    ctx.db.insert(products).values({
      id: productId,
      businessId: ctx.businessId,
      name: input.name.trim(),
      description: trimOrNull(input.description),
      type: input.type,
      categoryId: input.categoryId || null,
      brandId: input.brandId || null,
      unitId: input.unitId || null,
      taxRateId: input.taxRateId || null,
      trackInventory: n.trackInventory,
      hasVariants: n.hasVariants,
      options: n.options,
      imageUrl: trimOrNull(input.imageUrl),
      tags: trimOrNull(input.tags),
      isActive: input.isActive,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }) as unknown as Stmt,
  );
  tx.add(insertMany(ctx.db, variants, n.normalized.map((v) => variantInsertRow(ctx, productId, v))));
  await queueOpeningStockFor(ctx, tx, productId, n.normalized, n.trackInventory);
  tx.audit("product.create", `Created product ${input.name.trim()}`, "product", productId);
  await tx.commit();
  return productId;
}

async function variantUsage(ctx: Ctx, variantIds: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  for (let i = 0; i < variantIds.length; i += 90) {
    const chunk = variantIds.slice(i, i + 90);
    const [m, il, pl] = await Promise.all([
      ctx.db.selectDistinct({ id: stockMovements.variantId }).from(stockMovements).where(inArray(stockMovements.variantId, chunk)),
      ctx.db
        .selectDistinct({ id: invoiceLines.variantId })
        .from(invoiceLines)
        .where(and(eq(invoiceLines.businessId, ctx.businessId), inArray(invoiceLines.variantId, chunk))),
      ctx.db
        .selectDistinct({ id: purchaseLines.variantId })
        .from(purchaseLines)
        .where(and(eq(purchaseLines.businessId, ctx.businessId), inArray(purchaseLines.variantId, chunk))),
    ]);
    for (const r of [...m, ...il, ...pl]) if (r.id) used.add(r.id);
  }
  return used;
}

export async function updateProduct(ctx: Ctx, productId: string, input: ProductInput): Promise<void> {
  ctx.require("products.manage");
  const [existing] = await ctx.db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.businessId, ctx.businessId)));
  if (!existing) throw notFound("Product");
  const existingVariants = await ctx.db.select().from(variants).where(eq(variants.productId, productId));
  const n = await normalize(ctx, input, existing, existingVariants);

  const wasTracked = existing.trackInventory && existing.type !== "service";
  const totals = await stockTotals(
    ctx,
    existingVariants.map((v) => v.id),
  );
  if (wasTracked && !n.trackInventory) {
    const onHand = [...totals.values()].reduce((s, q) => s + Math.abs(q), 0);
    if (onHand > 0) throw badRequest("Adjust stock to zero before turning off inventory tracking");
  }

  const tx = new Tx(ctx);
  tx.add(
    ctx.db
      .update(products)
      .set({
        name: input.name.trim(),
        description: trimOrNull(input.description),
        type: input.type,
        categoryId: input.categoryId || null,
        brandId: input.brandId || null,
        unitId: input.unitId || null,
        taxRateId: input.taxRateId || null,
        trackInventory: n.trackInventory,
        hasVariants: n.hasVariants,
        options: n.options,
        imageUrl: trimOrNull(input.imageUrl),
        tags: trimOrNull(input.tags),
        isActive: input.isActive,
        updatedAt: ctx.now,
      })
      .where(eq(products.id, productId)) as unknown as Stmt,
  );

  const sys = await ctx.accounts();
  let revaluation = 0;
  const revalued: string[] = [];
  const levels = await loadStockCoster(
    ctx,
    existingVariants.map((v) => v.id),
    new Map(existingVariants.map((v) => [v.id, v.costPrice])),
  );
  for (const v of n.normalized) {
    if (!v.existing) continue;
    tx.add(
      ctx.db
        .update(variants)
        .set({
          name: v.name,
          options: v.options,
          sku: v.sku,
          barcode: v.barcode,
          price: v.price,
          wholesalePrice: v.wholesalePrice,
          costPrice: v.costPrice,
          mrp: v.mrp,
          reorderLevel: v.reorderLevel,
          isActive: v.isActive,
          sortOrder: v.sortOrder,
        })
        .where(eq(variants.id, v.id)) as unknown as Stmt,
    );
    // Keep the ledger in sync with stock value when the average cost is edited manually.
    if (n.trackInventory && v.costPrice !== v.existing.costPrice) {
      let delta = 0;
      for (const lv of levels.entries(v.id)) {
        const value = roundHalfAway(lv.quantity * v.costPrice);
        delta += value - lv.value;
        tx.add(
          ctx.db
            .update(stockLevels)
            .set({ value })
            .where(and(eq(stockLevels.variantId, v.id), eq(stockLevels.locationId, lv.locationId))) as unknown as Stmt,
        );
      }
      if (delta !== 0) {
        revaluation += delta;
        revalued.push(v.name || input.name.trim());
      }
    }
  }
  if (revaluation !== 0) {
    tx.journal({
      date: ctx.today,
      memo: `Cost revaluation — ${input.name.trim()}${revalued.length > 1 ? ` (${revalued.length} variants)` : ""}`,
      sourceType: "adjustment",
      sourceId: productId,
      sourceNumber: null,
      lines: [
        { accountId: sys.inventory, debit: revaluation },
        { accountId: sys.inventory_adjustments, credit: revaluation },
      ],
    });
  }

  const added = n.normalized.filter((v) => !v.existing);
  tx.add(insertMany(ctx.db, variants, added.map((v) => variantInsertRow(ctx, productId, v))));
  await queueOpeningStockFor(ctx, tx, productId, added, n.trackInventory);

  const keep = new Set(n.normalized.map((v) => v.id));
  const removed = existingVariants.filter((v) => !keep.has(v.id));
  if (removed.length > 0) {
    const used = await variantUsage(
      ctx,
      removed.map((v) => v.id),
    );
    const archive = removed.filter((v) => used.has(v.id) || Math.abs(totals.get(v.id) ?? 0) > 0).map((v) => v.id);
    const drop = removed.filter((v) => !archive.includes(v.id)).map((v) => v.id);
    if (archive.length > 0) {
      tx.add(ctx.db.update(variants).set({ isActive: false }).where(inArray(variants.id, archive)) as unknown as Stmt);
    }
    if (drop.length > 0) {
      tx.add(ctx.db.delete(stockLevels).where(inArray(stockLevels.variantId, drop)) as unknown as Stmt);
      tx.add(ctx.db.delete(stockLots).where(inArray(stockLots.variantId, drop)) as unknown as Stmt);
      tx.add(ctx.db.delete(variants).where(inArray(variants.id, drop)) as unknown as Stmt);
    }
  }

  tx.audit("product.update", `Updated product ${input.name.trim()}`, "product", productId);
  await tx.commit();
}

export async function deleteProduct(ctx: Ctx, productId: string): Promise<"archived" | "deleted"> {
  ctx.require("products.manage");
  const [existing] = await ctx.db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.businessId, ctx.businessId)));
  if (!existing) throw notFound("Product");
  const vs = await ctx.db.select({ id: variants.id }).from(variants).where(eq(variants.productId, productId));
  const ids = vs.map((v) => v.id);
  const used = await variantUsage(ctx, ids);
  const totals = await stockTotals(ctx, ids);
  const hasStock = [...totals.values()].some((q) => q !== 0);

  const tx = new Tx(ctx);
  if (used.size > 0 || hasStock) {
    tx.add(
      ctx.db.update(products).set({ isActive: false, updatedAt: ctx.now }).where(eq(products.id, productId)) as unknown as Stmt,
    );
    tx.audit("product.archive", `Archived product ${existing.name}`, "product", productId);
    await tx.commit();
    return "archived";
  }
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    tx.add(ctx.db.delete(stockLevels).where(inArray(stockLevels.variantId, chunk)) as unknown as Stmt);
    tx.add(ctx.db.delete(stockLots).where(inArray(stockLots.variantId, chunk)) as unknown as Stmt);
  }
  tx.add(ctx.db.delete(variants).where(eq(variants.productId, productId)) as unknown as Stmt);
  tx.add(ctx.db.delete(products).where(eq(products.id, productId)) as unknown as Stmt);
  tx.audit("product.delete", `Deleted product ${existing.name}`, "product", productId);
  await tx.commit();
  return "deleted";
}
