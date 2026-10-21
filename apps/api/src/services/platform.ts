/** Platform admin queries and mutations across all shops. */
import { and, count, desc, eq, gte, inArray, like, lt, max, ne, or, sql, type SQL } from "drizzle-orm";
import type {
  PlanInput,
  PlatformAdmin,
  PlatformShop,
  PlatformShopDetail,
  PlatformShopUpdateInput,
  PlatformStats,
  PlatformUserUpdateInput,
} from "@shopbooks/shared";
import type { DB } from "../db/client";
import {
  businesses,
  customers,
  invoices,
  locations,
  plans,
  platformAdmins,
  platformOrders,
  products,
  sessions,
  users,
} from "../db/schema";
import { hashPassword } from "../lib/crypto";
import { badRequest, notFound } from "../lib/errors";
import { likeQ, pageParams, paged } from "../lib/http";
import { newId } from "../lib/ids";
import { mapOrder, mapPlan, subscriptionInfo } from "./billing";

type BizRow = typeof businesses.$inferSelect;
const DAY = 86_400_000;
const n = (v: unknown) => Number(v ?? 0);

async function planNames(db: DB): Promise<Map<string, string>> {
  const rows = await db.select({ id: plans.id, name: plans.name }).from(plans);
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function userCounts(db: DB, ids?: string[]): Promise<Map<string, number>> {
  const q = db.select({ id: users.businessId, c: count() }).from(users).groupBy(users.businessId);
  const rows = ids ? await q.where(inArray(users.businessId, ids)) : await q;
  return new Map(rows.map((r) => [r.id, r.c]));
}

function mapShop(b: BizRow, names: Map<string, string>, userCount: number): PlatformShop {
  const planName = b.planId ? (names.get(b.planId) ?? null) : null;
  return {
    id: b.id,
    name: b.name,
    email: b.email,
    currency: b.currency,
    status: b.status as PlatformShop["status"],
    planId: b.planId,
    planName,
    subscriptionEndsAt: b.subscriptionEndsAt,
    subscription: subscriptionInfo(b, planName),
    userCount,
    createdAt: b.createdAt,
  };
}

// ---------------------------------------------------------------- dashboard

export async function platformStats(db: DB): Promise<PlatformStats> {
  const now = Date.now();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [[shops], [userN], [revAll], [rev30], [pending], recent, orders, names] = await Promise.all([
    db
      .select({
        total: count(),
        suspended: sql<number>`coalesce(sum(case when ${businesses.status} = 'suspended' then 1 else 0 end), 0)`,
        expired: sql<number>`coalesce(sum(case when ${businesses.status} = 'active' and ${businesses.subscriptionEndsAt} is not null and ${businesses.subscriptionEndsAt} < ${now} then 1 else 0 end), 0)`,
        fresh: sql<number>`coalesce(sum(case when ${businesses.createdAt} >= ${monthStart.getTime()} then 1 else 0 end), 0)`,
      })
      .from(businesses),
    db.select({ c: count() }).from(users),
    db
      .select({ s: sql<number>`coalesce(sum(${platformOrders.amount}), 0)`, c: count() })
      .from(platformOrders)
      .where(eq(platformOrders.status, "paid")),
    db
      .select({ s: sql<number>`coalesce(sum(${platformOrders.amount}), 0)` })
      .from(platformOrders)
      .where(and(eq(platformOrders.status, "paid"), gte(platformOrders.paidAt, now - 30 * DAY))),
    db.select({ c: count() }).from(platformOrders).where(eq(platformOrders.status, "pending")),
    db.select().from(businesses).orderBy(desc(businesses.createdAt)).limit(6),
    db.select().from(platformOrders).where(ne(platformOrders.status, "pending")).orderBy(desc(platformOrders.createdAt)).limit(6),
    planNames(db),
  ]);
  const counts = await userCounts(db, recent.map((r) => r.id));
  const total = n(shops?.total);
  const suspended = n(shops?.suspended);
  const expired = n(shops?.expired);
  return {
    shops: { total, suspended, expired, active: total - suspended - expired, newThisMonth: n(shops?.fresh) },
    users: n(userN?.c),
    revenue: { total: n(revAll?.s), last30Days: n(rev30?.s), orders: n(revAll?.c) },
    pendingOrders: n(pending?.c),
    recentShops: recent.map((b) => mapShop(b, names, counts.get(b.id) ?? 0)),
    recentOrders: orders.map(mapOrder),
  };
}

// ---------------------------------------------------------------- shops

export async function listShops(db: DB, q: { page: number; pageSize: number; q?: string; status?: "active" | "suspended" | "expired" }) {
  const now = Date.now();
  const conds: SQL[] = [];
  if (q.q) conds.push(or(like(businesses.name, likeQ(q.q)), like(businesses.email, likeQ(q.q)))!);
  if (q.status === "suspended") conds.push(eq(businesses.status, "suspended"));
  if (q.status === "expired") conds.push(and(eq(businesses.status, "active"), lt(businesses.subscriptionEndsAt, now))!);
  if (q.status === "active") {
    conds.push(eq(businesses.status, "active"));
    conds.push(or(sql`${businesses.subscriptionEndsAt} is null`, gte(businesses.subscriptionEndsAt, now))!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const { limit, offset } = pageParams(q);
  const [rows, [tot], names] = await Promise.all([
    db.select().from(businesses).where(where).orderBy(desc(businesses.createdAt)).limit(limit).offset(offset),
    db.select({ c: count() }).from(businesses).where(where),
    planNames(db),
  ]);
  const counts = await userCounts(db, rows.map((r) => r.id));
  return paged(rows.map((b) => mapShop(b, names, counts.get(b.id) ?? 0)), n(tot?.c), q);
}

export async function shopDetail(db: DB, id: string): Promise<PlatformShopDetail> {
  const [b] = await db.select().from(businesses).where(eq(businesses.id, id));
  if (!b) throw notFound("Shop");
  const [names, shopUsers, [loc], [prod], [cust], [inv], orders] = await Promise.all([
    planNames(db),
    db.select().from(users).where(eq(users.businessId, id)),
    db.select({ c: count() }).from(locations).where(eq(locations.businessId, id)),
    db.select({ c: count() }).from(products).where(eq(products.businessId, id)),
    db.select({ c: count() }).from(customers).where(eq(customers.businessId, id)),
    db.select({ c: count(), last: max(invoices.createdAt) }).from(invoices).where(eq(invoices.businessId, id)),
    db.select().from(platformOrders).where(eq(platformOrders.businessId, id)).orderBy(desc(platformOrders.createdAt)).limit(50),
  ]);
  return {
    ...mapShop(b, names, shopUsers.length),
    phone: b.phone,
    country: b.country,
    timezone: b.timezone,
    users: shopUsers.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, lastLoginAt: u.lastLoginAt })),
    usage: { locations: n(loc?.c), products: n(prod?.c), customers: n(cust?.c), invoices: n(inv?.c), lastInvoiceAt: inv?.last ?? null },
    orders: orders.map(mapOrder),
  };
}

export async function updateShop(db: DB, id: string, input: PlatformShopUpdateInput) {
  const [b] = await db.select().from(businesses).where(eq(businesses.id, id));
  if (!b) throw notFound("Shop");
  const set: Partial<typeof businesses.$inferInsert> = {};
  if (input.status) set.status = input.status;
  if (input.planId !== undefined) {
    if (input.planId) {
      const [p] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, input.planId));
      if (!p) throw badRequest("Unknown plan");
    }
    set.planId = input.planId ?? null;
  }
  if (input.subscriptionEndsOn !== undefined) {
    set.subscriptionEndsAt = input.subscriptionEndsOn ? Date.parse(`${input.subscriptionEndsOn}T23:59:59Z`) : null;
  }
  if (input.extendDays) {
    const base = Math.max(Date.now(), set.subscriptionEndsAt ?? b.subscriptionEndsAt ?? Date.now());
    set.subscriptionEndsAt = base + input.extendDays * DAY;
  }
  if (Object.keys(set).length === 0) throw badRequest("Nothing to update");
  await db.update(businesses).set(set).where(eq(businesses.id, id));
  if (input.status === "suspended") {
    // Kick everyone out immediately.
    await db.delete(sessions).where(eq(sessions.businessId, id));
  }
  return shopDetail(db, id);
}

export async function updateShopUser(db: DB, userId: string, input: PlatformUserUpdateInput) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw notFound("User");
  const set: Partial<typeof users.$inferInsert> = {};
  if (input.isActive !== undefined) set.isActive = input.isActive;
  if (input.password) set.passwordHash = await hashPassword(input.password);
  if (Object.keys(set).length === 0) throw badRequest("Nothing to update");
  await db.update(users).set(set).where(eq(users.id, userId));
  if (input.password || input.isActive === false) await db.delete(sessions).where(eq(sessions.userId, userId));
  return shopDetail(db, u.businessId);
}

// ---------------------------------------------------------------- orders

export async function listOrders(db: DB, q: { page: number; pageSize: number; q?: string; status?: "pending" | "paid" | "failed" | "expired" }) {
  const conds: SQL[] = [];
  if (q.status) conds.push(eq(platformOrders.status, q.status));
  if (q.q) conds.push(or(like(platformOrders.email, likeQ(q.q)), like(platformOrders.shopName, likeQ(q.q)))!);
  const where = conds.length ? and(...conds) : undefined;
  const { limit, offset } = pageParams(q);
  const [rows, [tot]] = await Promise.all([
    db.select().from(platformOrders).where(where).orderBy(desc(platformOrders.createdAt)).limit(limit).offset(offset),
    db.select({ c: count() }).from(platformOrders).where(where),
  ]);
  return paged(rows.map(mapOrder), n(tot?.c), q);
}

// ---------------------------------------------------------------- plans

export async function listPlans(db: DB) {
  const [rows, usage] = await Promise.all([
    db.select().from(plans),
    db.select({ id: businesses.planId, c: count() }).from(businesses).groupBy(businesses.planId),
  ]);
  const by = new Map(usage.map((u) => [u.id, u.c]));
  rows.sort((a, b) => a.sortOrder - b.sortOrder || a.priceCents - b.priceCents);
  return rows.map((p) => mapPlan(p, by.get(p.id) ?? 0));
}

export async function createPlan(db: DB, input: PlanInput) {
  const row = { id: newId(), createdAt: Date.now(), name: input.name, description: input.description ?? null, priceCents: input.priceCents, periodDays: input.periodDays, maxUsers: input.maxUsers, maxLocations: input.maxLocations, isActive: input.isActive ?? true, sortOrder: input.sortOrder ?? 0 };
  await db.insert(plans).values(row);
  return mapPlan(row, 0);
}

export async function updatePlan(db: DB, id: string, input: PlanInput) {
  const [p] = await db.select().from(plans).where(eq(plans.id, id));
  if (!p) throw notFound("Plan");
  const set = { name: input.name, description: input.description ?? null, priceCents: input.priceCents, periodDays: input.periodDays, maxUsers: input.maxUsers, maxLocations: input.maxLocations, isActive: input.isActive ?? p.isActive, sortOrder: input.sortOrder ?? p.sortOrder };
  await db.update(plans).set(set).where(eq(plans.id, id));
  return mapPlan({ ...p, ...set });
}

/** Plans in use are deactivated instead of deleted. */
export async function deletePlan(db: DB, id: string) {
  const [p] = await db.select().from(plans).where(eq(plans.id, id));
  if (!p) throw notFound("Plan");
  const [inUse] = await db.select({ c: count() }).from(businesses).where(eq(businesses.planId, id));
  const [ordered] = await db.select({ c: count() }).from(platformOrders).where(eq(platformOrders.planId, id));
  if (n(inUse?.c) > 0 || n(ordered?.c) > 0) {
    await db.update(plans).set({ isActive: false }).where(eq(plans.id, id));
    return { deleted: false as const };
  }
  await db.delete(plans).where(eq(plans.id, id));
  return { deleted: true as const };
}

// ---------------------------------------------------------------- admins

export const mapAdmin = (a: typeof platformAdmins.$inferSelect): PlatformAdmin => ({
  id: a.id,
  name: a.name,
  email: a.email,
  isActive: a.isActive,
  lastLoginAt: a.lastLoginAt,
  createdAt: a.createdAt,
});
