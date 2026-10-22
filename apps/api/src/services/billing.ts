/** Plans, subscriptions and selling the system through the platform's own payments.lk account. */
import { and, count, desc, eq } from "drizzle-orm";
import type {
  Plan,
  PlatformOrder,
  PlatformSettings,
  PlatformSettingsInput,
  PlanPurchaseInput,
  PurchaseResult,
  RenewInput,
  SignupInput,
  SubscriptionInfo,
} from "@shopbooks/shared";
import { TRIAL_DAYS } from "@shopbooks/shared";
import type { DB } from "../db/client";
import { businesses, locations, plans, platformOrders, platformSettings, users } from "../db/schema";
import type { Env } from "../env";
import type { BusinessRow, Ctx } from "../lib/context";
import { hashPassword } from "../lib/crypto";
import { ApiError, badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { verifySignature } from "./gateway";
import { createBusiness } from "./setup";

const apiBase = (env: Env) => env.PAYMENTS_LK_API ?? "https://api.payments.lk/v1";
const DAY = 86_400_000;
const SETTINGS_ID = "platform";

type PlanRow = typeof plans.$inferSelect;
type OrderRow = typeof platformOrders.$inferSelect;
type SettingsRow = typeof platformSettings.$inferSelect;

// ---------------------------------------------------------------- mapping

export const mapPlan = (p: PlanRow, shopCount?: number): Plan => ({
  id: p.id,
  name: p.name,
  description: p.description,
  priceCents: p.priceCents,
  periodDays: p.periodDays,
  maxUsers: p.maxUsers,
  maxLocations: p.maxLocations,
  isActive: p.isActive,
  sortOrder: p.sortOrder,
  ...(shopCount !== undefined ? { shopCount } : {}),
});

export const mapOrder = (o: OrderRow): PlatformOrder => ({
  id: o.id,
  kind: o.kind as PlatformOrder["kind"],
  planName: o.planName,
  businessId: o.businessId,
  email: o.email,
  shopName: o.shopName,
  amount: o.amount,
  status: o.status as PlatformOrder["status"],
  failureMessage: o.failureMessage,
  createdAt: o.createdAt,
  paidAt: o.paidAt,
});

export function subscriptionInfo(b: Pick<BusinessRow, "status" | "planId" | "subscriptionEndsAt">, planName: string | null, now = Date.now()): SubscriptionInfo {
  const endsAt = b.subscriptionEndsAt;
  const daysLeft = endsAt == null ? null : Math.ceil((endsAt - now) / DAY);
  let state: SubscriptionInfo["state"];
  if (b.status === "suspended") state = "suspended";
  else if (endsAt != null && endsAt < now) state = "expired";
  else if (endsAt != null && daysLeft! <= 7) state = "expiring";
  else if (!b.planId && endsAt == null) state = "none";
  else state = "active";
  return { state, planId: b.planId, planName, endsAt, daysLeft };
}

export async function businessSubscription(db: DB, b: BusinessRow): Promise<SubscriptionInfo> {
  let name: string | null = null;
  if (b.planId) {
    const [p] = await db.select({ name: plans.name }).from(plans).where(eq(plans.id, b.planId));
    name = p?.name ?? null;
  }
  return subscriptionInfo(b, name);
}

// ---------------------------------------------------------------- platform settings

async function loadSettings(db: DB): Promise<SettingsRow | null> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, SETTINGS_ID));
  return row ?? null;
}

const modeOf = (k: string | null | undefined) => (k?.startsWith("sk_live_") ? ("live" as const) : k?.startsWith("sk_test_") ? ("test" as const) : null);

export async function getPlatformSettings(db: DB, origin: string): Promise<PlatformSettings> {
  const s = await loadSettings(db);
  return {
    requirePayment: s?.requirePayment ?? false,
    isEnabled: s?.isEnabled ?? false,
    hasSecretKey: !!s?.secretKey,
    hasWebhookSecret: !!s?.webhookSecret,
    mode: modeOf(s?.secretKey),
    webhookUrl: `${origin}/api/public/webhook`,
  };
}

export async function savePlatformSettings(db: DB, input: PlatformSettingsInput, origin: string) {
  const prev = await loadSettings(db);
  const secretKey = input.secretKey || prev?.secretKey || null;
  const webhookSecret = input.webhookSecret || prev?.webhookSecret || null;
  if (secretKey && !modeOf(secretKey)) throw badRequest("The secret key must start with sk_test_ or sk_live_");
  if ((input.isEnabled || input.requirePayment) && (!secretKey || !webhookSecret)) {
    throw badRequest("Add the secret key and webhook secret before enabling payments");
  }
  if (input.requirePayment && !input.isEnabled) throw badRequest("Enable payments.lk to require payment on signup");
  const values = { id: SETTINGS_ID, requirePayment: input.requirePayment, isEnabled: input.isEnabled, secretKey, webhookSecret, updatedAt: Date.now() };
  await db.insert(platformSettings).values(values).onConflictDoUpdate({ target: platformSettings.id, set: values });
  return getPlatformSettings(db, origin);
}

/** Active plans + whether signup needs payment (public). */
export async function publicPlans(db: DB) {
  const [s, rows] = await Promise.all([loadSettings(db), db.select().from(plans).where(eq(plans.isActive, true))]);
  rows.sort((a, b) => a.sortOrder - b.sortOrder || a.priceCents - b.priceCents);
  return { paymentRequired: !!(s?.requirePayment && s.isEnabled), plans: rows.map((p) => mapPlan(p)) };
}

/**
 * Plan for a free (no-payment) signup: the requested plan, or the first active plan when none is given,
 * so shops can't skip plans by calling the API directly. Paid plans start a TRIAL_DAYS trial; free plans
 * never expire. Returns undefined when no plans are set up (legacy behaviour: no plan, never expires).
 */
export async function trialSubscription(db: DB, planId: string | null | undefined, now = Date.now()) {
  const { plans: active } = await publicPlans(db);
  if (!active.length) return undefined;
  const plan = planId ? active.find((p) => p.id === planId) : active[0];
  if (!plan) throw badRequest("That plan is not available");
  return { planId: plan.id, endsAt: plan.priceCents > 0 ? now + TRIAL_DAYS * DAY : null };
}

// ---------------------------------------------------------------- payments.lk calls

/** Only return to this API's own origin or an origin allowed by CORS_ORIGINS (no open redirects). */
export function safeOrigin(env: Env, requested: string | undefined, fallback: string) {
  const allowed = [fallback, ...(env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim())].filter(Boolean);
  return (requested && allowed.includes(requested.replace(/\/$/, "")) ? requested : fallback).replace(/\/$/, "");
}

async function createProviderCheckout(env: Env, secretKey: string, order: OrderRow, successUrl: string, cancelUrl: string) {
  const res = await fetch(`${apiBase(env)}/checkouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json", "Idempotency-Key": `shopbooks-order-${order.id}` },
    body: JSON.stringify({
      amountCents: order.amount,
      description: `ShopBooks ${order.planName} plan`,
      reference: order.id,
      customer: { email: order.email, name: order.shopName },
      successUrl,
      cancelUrl,
    }),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; url?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.url) throw badRequest(`payments.lk: ${body?.error?.message ?? `checkout failed (${res.status})`}`);
  return { id: body.id ?? null, url: body.url };
}

async function startOrder(db: DB, env: Env, order: OrderRow, successUrl: string, cancelUrl: string): Promise<PurchaseResult> {
  const s = await loadSettings(db);
  if (!s?.isEnabled || !s.secretKey) throw badRequest("Online payments are not available right now");
  await db.insert(platformOrders).values(order);
  try {
    const co = await createProviderCheckout(env, s.secretKey, order, successUrl, cancelUrl).catch((e) => {
      if (e instanceof ApiError) throw e;
      throw badRequest("Could not reach payments.lk. Please try again in a moment.");
    });
    await db.update(platformOrders).set({ providerCheckoutId: co.id, url: co.url }).where(eq(platformOrders.id, order.id));
    return { orderId: order.id, url: co.url };
  } catch (e) {
    await db.update(platformOrders).set({ status: "failed", failureMessage: (e as Error).message }).where(eq(platformOrders.id, order.id));
    throw e;
  }
}

async function loadPlan(db: DB, planId: string): Promise<PlanRow> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan || !plan.isActive) throw badRequest("That plan is not available");
  if (plan.priceCents <= 0) throw badRequest("That plan is free and can't be purchased online");
  return plan;
}

const blankOrder = (plan: PlanRow) => ({
  id: newId(),
  planId: plan.id,
  planName: plan.name,
  amount: plan.priceCents,
  periodDays: plan.periodDays,
  status: "pending",
  businessId: null,
  providerCheckoutId: null,
  providerPaymentId: null,
  url: null,
  failureMessage: null,
  signupData: null,
  passwordHash: null,
  createdAt: Date.now(),
  paidAt: null,
});

/** Public: stores the sign-up details (password hashed) and opens a payments.lk checkout. The shop is created by the webhook. */
export async function createPurchase(db: DB, env: Env, input: PlanPurchaseInput, fallbackOrigin: string): Promise<PurchaseResult> {
  const plan = await loadPlan(db, input.planId);
  const email = input.signup.email.toLowerCase();
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) throw conflict("An account with this email already exists. Sign in instead.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.signup.timezone });
  } catch {
    throw badRequest("Unknown timezone");
  }
  const { password, ...rest } = input.signup;
  const order: OrderRow = {
    ...blankOrder(plan),
    kind: "signup",
    email,
    shopName: input.signup.businessName,
    signupData: JSON.stringify({ ...rest, email }),
    passwordHash: await hashPassword(password),
  };
  const origin = safeOrigin(env, input.returnOrigin, fallbackOrigin);
  return startOrder(db, env, order, `${origin}/signup/complete?order=${order.id}`, `${origin}/signup?cancelled=1`);
}

export async function createRenewal(ctx: Ctx, input: RenewInput, fallbackOrigin: string): Promise<PurchaseResult> {
  ctx.require("settings.manage");
  const plan = await loadPlan(ctx.db, input.planId);
  const order: OrderRow = { ...blankOrder(plan), kind: "renewal", businessId: ctx.businessId, email: ctx.business.email ?? "", shopName: ctx.business.name };
  const origin = safeOrigin(ctx.env, input.returnOrigin, fallbackOrigin);
  return startOrder(ctx.db, ctx.env, order, `${origin}/settings?tab=billing&order=${order.id}`, `${origin}/settings?tab=billing&cancelled=1`);
}

export async function publicOrderStatus(db: DB, orderId: string) {
  const [o] = await db.select().from(platformOrders).where(eq(platformOrders.id, orderId));
  if (!o) throw notFound("Order");
  return { status: o.status as PlatformOrder["status"], kind: o.kind as PlatformOrder["kind"], failureMessage: o.failureMessage };
}

export async function shopBilling(ctx: Ctx) {
  const [sub, planRows, orders, s] = await Promise.all([
    businessSubscription(ctx.db, ctx.business),
    ctx.db.select().from(plans).where(eq(plans.isActive, true)),
    ctx.db.select().from(platformOrders).where(eq(platformOrders.businessId, ctx.businessId)).orderBy(desc(platformOrders.createdAt)).limit(50),
    loadSettings(ctx.db),
  ]);
  planRows.sort((a, b) => a.sortOrder - b.sortOrder || a.priceCents - b.priceCents);
  return {
    subscription: sub,
    plans: planRows.filter((p) => p.priceCents > 0).map((p) => mapPlan(p)),
    paymentEnabled: !!s?.isEnabled,
    orders: orders.map(mapOrder),
  };
}

// ---------------------------------------------------------------- plan limits

export async function assertWithinPlan(ctx: Ctx, what: "users" | "locations") {
  if (!ctx.business.planId) return;
  const [plan] = await ctx.db.select().from(plans).where(eq(plans.id, ctx.business.planId));
  if (!plan) return;
  const limit = what === "users" ? plan.maxUsers : plan.maxLocations;
  if (!limit) return;
  const table = what === "users" ? users : locations;
  const [{ n }] = await ctx.db
    .select({ n: count() })
    .from(table)
    .where(and(eq(table.businessId, ctx.businessId), eq(table.isActive, true)));
  if (n >= limit) throw badRequest(`Your ${plan.name} plan allows up to ${limit} ${what}. Upgrade your plan to add more.`);
}

// ---------------------------------------------------------------- webhook

/** Handles a verified platform webhook: settles the order and creates / extends the shop. */
export async function handlePlatformWebhook(db: DB, env: Env, raw: string, signature: string | undefined) {
  const cfg = await loadSettings(db);
  if (!cfg?.webhookSecret || !cfg.secretKey) throw notFound("Gateway");
  if (!(await verifySignature(signature, raw, cfg.webhookSecret))) throw badRequest("Invalid signature");

  const event = JSON.parse(raw) as { type?: string; data?: Record<string, any> };
  const data = event.data ?? {};
  if (event.type === "test.ping") return "ping";
  const reference: string | undefined = data.reference ?? data.payment?.reference ?? data.object?.reference;
  if (!reference) return "ignored: no reference";
  const [order] = await db.select().from(platformOrders).where(eq(platformOrders.id, reference));
  if (!order) return "ignored: unknown order";
  if (order.status === "paid") return "already settled";

  if (event.type === "payment.failed" || event.type === "checkout.expired") {
    await db
      .update(platformOrders)
      .set({ status: event.type === "checkout.expired" ? "expired" : "failed", failureMessage: data.failureMessage ?? null })
      .where(and(eq(platformOrders.id, order.id), eq(platformOrders.status, "pending")));
    return event.type;
  }
  if (event.type !== "payment.succeeded") return `ignored: ${event.type}`;

  // Confirm with the API instead of trusting the payload.
  if (!order.providerCheckoutId) throw badRequest("Order has no checkout");
  const res = await fetch(`${apiBase(env)}/checkouts/${order.providerCheckoutId}`, { headers: { Authorization: `Bearer ${cfg.secretKey}` } });
  if (!res.ok) throw badRequest("Could not confirm the payment with payments.lk"); // non-2xx => payments.lk retries
  const remote = (await res.json()) as { payment?: { id?: string; status?: string; amountCents?: number } };
  if (remote.payment?.status !== "succeeded" && remote.payment?.status !== "partially_refunded") return "not succeeded yet";
  if (remote.payment.amountCents !== order.amount) {
    await db.update(platformOrders).set({ status: "failed", failureMessage: "Amount mismatch" }).where(eq(platformOrders.id, order.id));
    return "amount mismatch";
  }
  await fulfilOrder(db, order, remote.payment.id ?? null);
  return "settled";
}

async function fulfilOrder(db: DB, order: OrderRow, providerPaymentId: string | null) {
  const now = Date.now();
  const periodMs = order.periodDays * DAY;
  let businessId = order.businessId;

  if (order.kind === "signup") {
    const email = order.email;
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists) {
      await db
        .update(platformOrders)
        .set({ status: "failed", failureMessage: "That email already has an account — refund required", providerPaymentId })
        .where(eq(platformOrders.id, order.id));
      return;
    }
    const signup = { ...(JSON.parse(order.signupData ?? "{}") as Omit<SignupInput, "password">), password: "" } as SignupInput;
    const created = await createBusiness(db, signup, order.passwordHash ?? "");
    businessId = created.businessId;
    await db
      .update(businesses)
      .set({ planId: order.planId, subscriptionEndsAt: now + periodMs, status: "active" })
      .where(eq(businesses.id, businessId));
  } else {
    if (!businessId) throw notFound("Shop");
    const [b] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    if (!b) throw notFound("Shop");
    // Renewing early stacks on the remaining time; an admin suspension is not lifted by paying.
    const base = Math.max(now, b.subscriptionEndsAt ?? now);
    await db.update(businesses).set({ planId: order.planId, subscriptionEndsAt: base + periodMs }).where(eq(businesses.id, businessId));
  }
  await db
    .update(platformOrders)
    .set({ status: "paid", paidAt: now, businessId, providerPaymentId, passwordHash: null })
    .where(eq(platformOrders.id, order.id));
}
