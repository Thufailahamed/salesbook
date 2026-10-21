import { and, asc, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  PAYMENT_TYPE_DEFAULT_ACCOUNT,
  businessSettingsSchema,
  locationSchema,
  paymentMethodSchema,
  sequenceUpdateSchema,
  taxRateSchema,
  type Sequence,
  type SequenceKey,
} from "@shopbooks/shared";
import {
  accounts,
  businesses,
  invoices,
  locations,
  paymentMethods,
  payments,
  products,
  sequences,
  stockLevels,
  taxRates,
} from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { clean } from "../lib/http";
import { newId } from "../lib/ids";
import { vJson } from "../lib/validate";
import { assertWithinPlan } from "../services/billing";
import { listPaymentMethods, mapBusiness, mapLocation, mapTaxRate } from "../services/me";

const app = new Hono<AppEnv>();
const manage = requirePerm("settings.manage");

// ---------------------------------------------------------------- business

app.get("/business", (c) => c.json(mapBusiness(c.get("ctx").business)));

app.put("/business", manage, vJson(businessSettingsSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = clean(c.req.valid("json"));
  if (input.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    } catch {
      throw badRequest("Unknown timezone");
    }
  }
  if (input.defaultTaxRateId) {
    const [t] = await ctx.db
      .select({ id: taxRates.id })
      .from(taxRates)
      .where(and(eq(taxRates.id, input.defaultTaxRateId), eq(taxRates.businessId, ctx.businessId)));
    if (!t) throw badRequest("Unknown tax rate");
  }
  if (input.currency && input.currency !== ctx.business.currency) {
    const [used] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(invoices)
      .where(eq(invoices.businessId, ctx.businessId));
    if ((used?.n ?? 0) > 0) throw badRequest("Currency can't be changed after sales have been recorded");
  }
  const [row] = await ctx.db
    .update(businesses)
    .set({ ...input, name: input.name ?? ctx.business.name, currency: input.currency?.toUpperCase() ?? ctx.business.currency } as never)
    .where(eq(businesses.id, ctx.businessId))
    .returning();
  return c.json(mapBusiness(row!));
});

// ---------------------------------------------------------------- locations

app.get("/locations", async (c) => {
  const ctx = c.get("ctx");
  const rows = await ctx.db
    .select()
    .from(locations)
    .where(eq(locations.businessId, ctx.businessId))
    .orderBy(asc(locations.createdAt));
  return c.json(rows.map(mapLocation));
});

async function clearOtherDefaults(c: { get: (k: "ctx") => AppEnv["Variables"]["ctx"] }, keepId: string) {
  const ctx = c.get("ctx");
  await ctx.db
    .update(locations)
    .set({ isDefault: false })
    .where(and(eq(locations.businessId, ctx.businessId), ne(locations.id, keepId)));
}

app.post("/locations", manage, vJson(locationSchema), async (c) => {
  const ctx = c.get("ctx");
  await assertWithinPlan(ctx, "locations");
  const input = clean(c.req.valid("json"));
  const id = newId();
  const [row] = await ctx.db
    .insert(locations)
    .values({
      id,
      businessId: ctx.businessId,
      name: input.name,
      code: input.code ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      isDefault: !!input.isDefault,
      isActive: input.isActive ?? true,
      createdAt: Date.now(),
    })
    .returning();
  if (input.isDefault) await clearOtherDefaults(c, id);
  return c.json(mapLocation(row!), 201);
});

app.put("/locations/:id", manage, vJson(locationSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const input = clean(c.req.valid("json"));
  const [existing] = await ctx.db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.businessId, ctx.businessId)));
  if (!existing) throw notFound("Location");
  if (existing.isDefault && input.isActive === false) throw badRequest("The default location can't be deactivated");
  const [row] = await ctx.db
    .update(locations)
    .set({
      name: input.name,
      code: input.code ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      isDefault: input.isDefault ?? existing.isDefault,
      isActive: input.isActive ?? existing.isActive,
    })
    .where(eq(locations.id, id))
    .returning();
  if (input.isDefault) await clearOtherDefaults(c, id);
  return c.json(mapLocation(row!));
});

app.delete("/locations/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const [existing] = await ctx.db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.businessId, ctx.businessId)));
  if (!existing) throw notFound("Location");
  if (existing.isDefault) throw badRequest("The default location can't be removed");
  const [{ n: invoiceCount } = { n: 0 }] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(invoices)
    .where(eq(invoices.locationId, id));
  const [{ n: stockCount } = { n: 0 }] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(stockLevels)
    .where(and(eq(stockLevels.locationId, id), ne(stockLevels.quantity, 0)));
  if (invoiceCount > 0 || stockCount > 0) {
    await ctx.db.update(locations).set({ isActive: false }).where(eq(locations.id, id));
  } else {
    await ctx.db.delete(locations).where(eq(locations.id, id));
  }
  return c.json({ ok: true as const });
});

// ---------------------------------------------------------------- tax rates

app.get("/tax-rates", async (c) => {
  const ctx = c.get("ctx");
  const rows = await ctx.db
    .select()
    .from(taxRates)
    .where(eq(taxRates.businessId, ctx.businessId))
    .orderBy(asc(taxRates.rate));
  return c.json(rows.map(mapTaxRate));
});

async function setDefaultTax(ctx: AppEnv["Variables"]["ctx"], id: string) {
  await ctx.db
    .update(taxRates)
    .set({ isDefault: false })
    .where(and(eq(taxRates.businessId, ctx.businessId), ne(taxRates.id, id)));
  await ctx.db.update(businesses).set({ defaultTaxRateId: id }).where(eq(businesses.id, ctx.businessId));
}

app.post("/tax-rates", manage, vJson(taxRateSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const id = newId();
  const [row] = await ctx.db
    .insert(taxRates)
    .values({
      id,
      businessId: ctx.businessId,
      name: input.name,
      rate: input.rate,
      isDefault: !!input.isDefault,
      isActive: input.isActive ?? true,
      createdAt: Date.now(),
    })
    .returning();
  if (input.isDefault) await setDefaultTax(ctx, id);
  return c.json(mapTaxRate(row!), 201);
});

app.put("/tax-rates/:id", manage, vJson(taxRateSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const [row] = await ctx.db
    .update(taxRates)
    .set({ name: input.name, rate: input.rate, isDefault: input.isDefault ?? undefined, isActive: input.isActive ?? undefined })
    .where(and(eq(taxRates.id, id), eq(taxRates.businessId, ctx.businessId)))
    .returning();
  if (!row) throw notFound("Tax rate");
  if (input.isDefault) await setDefaultTax(ctx, id);
  return c.json(mapTaxRate(row));
});

app.delete("/tax-rates/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  if (ctx.business.defaultTaxRateId === id) throw badRequest("Choose another default tax rate first");
  const [{ n } = { n: 0 }] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(and(eq(products.businessId, ctx.businessId), eq(products.taxRateId, id)));
  if (n > 0) {
    await ctx.db.update(taxRates).set({ isActive: false }).where(and(eq(taxRates.id, id), eq(taxRates.businessId, ctx.businessId)));
  } else {
    await ctx.db.delete(taxRates).where(and(eq(taxRates.id, id), eq(taxRates.businessId, ctx.businessId)));
  }
  return c.json({ ok: true as const });
});

// ---------------------------------------------------------------- payment methods

app.get("/payment-methods", async (c) => c.json(await listPaymentMethods(c.get("ctx"))));

async function resolveMethodAccount(ctx: AppEnv["Variables"]["ctx"], accountId: string | null | undefined, type: keyof typeof PAYMENT_TYPE_DEFAULT_ACCOUNT) {
  if (accountId) {
    const [acc] = await ctx.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.businessId, ctx.businessId)));
    if (!acc || acc.type !== "asset") throw badRequest("Payment methods must settle into an asset account (cash or bank)");
    return acc.id;
  }
  const sys = await ctx.accounts();
  return sys[PAYMENT_TYPE_DEFAULT_ACCOUNT[type]];
}

app.post("/payment-methods", manage, vJson(paymentMethodSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const accountId = await resolveMethodAccount(ctx, input.accountId, input.type);
  await ctx.db.insert(paymentMethods).values({
    id: newId(),
    businessId: ctx.businessId,
    name: input.name,
    type: input.type,
    accountId,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 99,
    createdAt: Date.now(),
  });
  const all = await listPaymentMethods(ctx);
  return c.json(all.find((m) => m.name === input.name && m.accountId === accountId) ?? all[all.length - 1], 201);
});

app.put("/payment-methods/:id", manage, vJson(paymentMethodSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const accountId = await resolveMethodAccount(ctx, input.accountId, input.type);
  const [row] = await ctx.db
    .update(paymentMethods)
    .set({
      name: input.name,
      type: input.type,
      accountId,
      isActive: input.isActive ?? undefined,
      sortOrder: input.sortOrder ?? undefined,
    })
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.businessId, ctx.businessId)))
    .returning();
  if (!row) throw notFound("Payment method");
  const all = await listPaymentMethods(ctx);
  return c.json(all.find((m) => m.id === id));
});

app.delete("/payment-methods/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const [{ n } = { n: 0 }] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(payments)
    .where(eq(payments.methodId, id));
  const active = await ctx.db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.businessId, ctx.businessId), eq(paymentMethods.isActive, true)));
  if (active.length <= 1 && active[0]?.id === id) throw conflict("Keep at least one active payment method");
  if (n > 0) {
    await ctx.db.update(paymentMethods).set({ isActive: false }).where(and(eq(paymentMethods.id, id), eq(paymentMethods.businessId, ctx.businessId)));
  } else {
    await ctx.db.delete(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.businessId, ctx.businessId)));
  }
  return c.json({ ok: true as const });
});

// ---------------------------------------------------------------- numbering

app.get("/sequences", async (c) => {
  const ctx = c.get("ctx");
  const rows = await ctx.db.select().from(sequences).where(eq(sequences.businessId, ctx.businessId));
  return c.json(
    rows.map((r): Sequence => ({ key: r.key as SequenceKey, prefix: r.prefix, nextValue: r.nextValue, padding: r.padding })),
  );
});

app.put("/sequences/:key", manage, vJson(sequenceUpdateSchema), async (c) => {
  const ctx = c.get("ctx");
  const key = c.req.param("key");
  const input = c.req.valid("json");
  const [current] = await ctx.db
    .select()
    .from(sequences)
    .where(and(eq(sequences.businessId, ctx.businessId), eq(sequences.key, key)));
  if (!current) throw notFound("Sequence");
  if (input.nextValue !== undefined && input.nextValue < current.nextValue && input.prefix === current.prefix) {
    throw badRequest("The next number can't go backwards with the same prefix (numbers must stay unique)");
  }
  const [row] = await ctx.db
    .update(sequences)
    .set({ prefix: input.prefix, nextValue: input.nextValue ?? current.nextValue, padding: input.padding ?? current.padding })
    .where(and(eq(sequences.businessId, ctx.businessId), eq(sequences.key, key)))
    .returning();
  return c.json({ key: row!.key, prefix: row!.prefix, nextValue: row!.nextValue, padding: row!.padding });
});

export default app;
