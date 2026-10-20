import { and, asc, eq } from "drizzle-orm";
import {
  permissionsFor,
  type Business,
  type Location,
  type MeResponse,
  type PaymentMethod,
  type PaymentMethodType,
  type Role,
  type TaxRate,
  type User,
} from "@shopbooks/shared";
import { accounts, locations, paymentMethods, taxRates, users } from "../db/schema";
import type { BusinessRow, Ctx } from "../lib/context";
import { notFound } from "../lib/errors";

export function mapBusiness(b: BusinessRow): Business {
  return {
    id: b.id,
    name: b.name,
    legalName: b.legalName,
    email: b.email,
    phone: b.phone,
    website: b.website,
    address: b.address,
    city: b.city,
    country: b.country,
    taxNumber: b.taxNumber,
    currency: b.currency,
    locale: b.locale,
    timezone: b.timezone,
    logoUrl: b.logoUrl,
    taxInclusive: b.taxInclusive,
    allowNegativeStock: b.allowNegativeStock,
    requireShift: b.requireShift,
    roundingIncrement: b.roundingIncrement,
    lowStockThreshold: b.lowStockThreshold,
    defaultTaxRateId: b.defaultTaxRateId,
    invoiceFooter: b.invoiceFooter,
    receiptFooter: b.receiptFooter,
    invoiceTerms: b.invoiceTerms,
    receiptWidth: b.receiptWidth === "58mm" ? "58mm" : "80mm",
    loyaltyEnabled: b.loyaltyEnabled,
    loyaltyEarnPer: b.loyaltyEarnPer,
    loyaltyPointValue: b.loyaltyPointValue,
    loyaltyMinRedeem: b.loyaltyMinRedeem,
    returnWindowDays: b.returnWindowDays,
    creditDueDays: b.creditDueDays,
    createdAt: b.createdAt,
  };
}

export function mapLocation(l: typeof locations.$inferSelect): Location {
  return {
    id: l.id,
    name: l.name,
    code: l.code,
    address: l.address,
    phone: l.phone,
    isDefault: l.isDefault,
    isActive: l.isActive,
  };
}

export function mapTaxRate(t: typeof taxRates.$inferSelect): TaxRate {
  return { id: t.id, name: t.name, rate: t.rate, isDefault: t.isDefault, isActive: t.isActive };
}

export function mapUser(u: typeof users.$inferSelect): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    defaultLocationId: u.defaultLocationId,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export async function listPaymentMethods(ctx: Ctx): Promise<PaymentMethod[]> {
  const rows = await ctx.db
    .select({ pm: paymentMethods, accountName: accounts.name })
    .from(paymentMethods)
    .leftJoin(accounts, eq(accounts.id, paymentMethods.accountId))
    .where(eq(paymentMethods.businessId, ctx.businessId))
    .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name));
  return rows.map(({ pm, accountName }) => ({
    id: pm.id,
    name: pm.name,
    type: pm.type as PaymentMethodType,
    accountId: pm.accountId,
    accountName,
    isActive: pm.isActive,
    sortOrder: pm.sortOrder,
  }));
}

export async function buildMe(ctx: Ctx): Promise<MeResponse> {
  const [user] = await ctx.db
    .select()
    .from(users)
    .where(and(eq(users.id, ctx.userId), eq(users.businessId, ctx.businessId)));
  if (!user) throw notFound("User");
  const [locs, taxes, methods] = await Promise.all([
    ctx.db.select().from(locations).where(eq(locations.businessId, ctx.businessId)).orderBy(asc(locations.createdAt)),
    ctx.db.select().from(taxRates).where(eq(taxRates.businessId, ctx.businessId)).orderBy(asc(taxRates.rate)),
    listPaymentMethods(ctx),
  ]);
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as Role,
      defaultLocationId: user.defaultLocationId,
    },
    business: mapBusiness(ctx.business),
    locations: locs.map(mapLocation),
    taxRates: taxes.map(mapTaxRate),
    paymentMethods: methods,
    permissions: permissionsFor(user.role as Role),
  };
}
