/** payments.lk hosted-checkout integration: create checkouts for invoices, settle them from signed webhooks. */
import { and, eq } from "drizzle-orm";
import type { CreateCheckoutInput, GatewayCheckout, GatewaySettings, GatewaySettingsInput, Role } from "@shopbooks/shared";
import type { DB } from "../db/client";
import { businesses, gatewayCheckouts, gatewaySettings, paymentMethods, users } from "../db/schema";
import type { Env } from "../env";
import { createCtx, type Ctx } from "../lib/context";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { safeOrigin } from "./billing";
import { addInvoicePayment, getInvoiceRow } from "./sales";

const apiBase = (env: Env) => env.PAYMENTS_LK_API ?? "https://api.payments.lk/v1";
const MAX_SKEW_SECONDS = 300;

type SettingsRow = typeof gatewaySettings.$inferSelect;

async function loadSettings(db: DB, businessId: string): Promise<SettingsRow | null> {
  const [row] = await db.select().from(gatewaySettings).where(eq(gatewaySettings.businessId, businessId));
  return row ?? null;
}

const modeOf = (key: string | null | undefined) =>
  key?.startsWith("sk_live_") ? ("live" as const) : key?.startsWith("sk_test_") ? ("test" as const) : null;

export async function getGatewaySettings(ctx: Ctx, origin: string): Promise<GatewaySettings> {
  const row = await loadSettings(ctx.db, ctx.businessId);
  return {
    isEnabled: row?.isEnabled ?? false,
    hasSecretKey: !!row?.secretKey,
    hasWebhookSecret: !!row?.webhookSecret,
    mode: modeOf(row?.secretKey),
    methodId: row?.methodId ?? null,
    webhookUrl: `${origin}/api/gateway/webhook/${ctx.businessId}`,
  };
}

export async function saveGatewaySettings(ctx: Ctx, input: GatewaySettingsInput, origin: string) {
  const prev = await loadSettings(ctx.db, ctx.businessId);
  const secretKey = input.secretKey || prev?.secretKey || null;
  const webhookSecret = input.webhookSecret || prev?.webhookSecret || null;
  if (secretKey && !modeOf(secretKey)) throw badRequest("The secret key must start with sk_test_ or sk_live_");
  if (input.methodId) {
    const [m] = await ctx.db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, input.methodId), eq(paymentMethods.businessId, ctx.businessId)));
    if (!m) throw badRequest("Unknown payment method");
  }
  if (input.isEnabled && (!secretKey || !webhookSecret || !input.methodId)) {
    throw badRequest("Add the secret key, webhook secret and a payment method before enabling online payments");
  }
  const values = {
    businessId: ctx.businessId,
    isEnabled: input.isEnabled,
    secretKey,
    webhookSecret,
    methodId: input.methodId ?? null,
    updatedAt: ctx.now,
  };
  await ctx.db.insert(gatewaySettings).values(values).onConflictDoUpdate({ target: gatewaySettings.businessId, set: values });
  return getGatewaySettings(ctx, origin);
}

/** Whether online payment is available (used to show the "Pay online" action). */
export async function gatewayEnabled(ctx: Ctx) {
  const row = await loadSettings(ctx.db, ctx.businessId);
  return !!(row?.isEnabled && row.secretKey && row.methodId);
}

export async function createInvoiceCheckout(ctx: Ctx, input: CreateCheckoutInput, fallbackOrigin: string): Promise<GatewayCheckout> {
  ctx.require("customers.payments");
  const cfg = await loadSettings(ctx.db, ctx.businessId);
  if (!cfg?.isEnabled || !cfg.secretKey || !cfg.methodId) throw badRequest("Online payments are not enabled");
  const inv = await getInvoiceRow(ctx, input.invoiceId);
  if (inv.status !== "completed") throw badRequest("This invoice is void");
  if (inv.amountDue <= 0) throw badRequest("This invoice is already fully paid");
  const amount = input.amount ?? inv.amountDue;
  if (amount <= 0 || amount > inv.amountDue) throw badRequest("Amount must be between 0 and the balance due");

  const id = newId();
  const origin = safeOrigin(ctx.env, input.returnOrigin, fallbackOrigin);
  const back = `${origin}/sales/view?id=${inv.id}`;
    const body = (await res.json().catch(() => null)) as { id?: string; url?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.url) {
    throw badRequest(`payments.lk: ${body?.error?.message ?? `checkout failed (${res.status})`}`);
  }
  await ctx.db.insert(gatewayCheckouts).values({
    id,
    businessId: ctx.businessId,
    docType: "invoice",
    docId: inv.id,
    amount,
    status: "pending",
    providerCheckoutId: body.id }).catch(() => {
    throw badRequest("Could not reach payments.lk. Please try again in a moment.");
  });
null,
    url: body.url,
    createdBy: ctx.userId,
    createdAt: ctx.now,
  });
  return { id, url: body.url, amount, status: "pending" };
}

// ---------------------------------------------------------------- webhook

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies `Payments-Signature: t=<ts>,v1=<hex>[,v1=<hex>]` = HMAC-SHA256(secret, `${t}.${rawBody}`). */
export async function verifySignature(header: string | undefined, raw: string, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > MAX_SKEW_SECONDS) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  return sigs.some((s) => safeEqual(s, expected));
}

interface ProviderEvent {
  type?: string;
  data?: Record<string, any>;
}

/** Handles one verified webhook. Returns a short status string for logging. */
export async function handleWebhook(db: DB, env: Env, businessId: string, raw: string, signature: string | undefined) {
  const cfg = await loadSettings(db, businessId);
  if (!cfg?.webhookSecret) throw notFound("Gateway");
  if (!(await verifySignature(signature, raw, cfg.webhookSecret))) throw badRequest("Invalid signature");

  const event = JSON.parse(raw) as ProviderEvent;
  const data = event.data ?? {};
  if (event.type === "test.ping") return "ping";
  const reference: string | undefined = data.reference ?? data.payment?.reference ?? data.object?.reference;
  if (!reference) return "ignored: no reference";

  const [checkout] = await db
    .select()
    .from(gatewayCheckouts)
    .where(and(eq(gatewayCheckouts.id, reference), eq(gatewayCheckouts.businessId, businessId)));
  if (!checkout) return "ignored: unknown checkout";
  if (checkout.status === "paid") return "already settled";

  if (event.type === "payment.failed" || event.type === "checkout.expired") {
    await db
      .update(gatewayCheckouts)
      .set({
        status: event.type === "checkout.expired" ? "expired" : "failed",
        failureMessage: data.failureMessage ?? null,
      })
      .where(and(eq(gatewayCheckouts.id, checkout.id), eq(gatewayCheckouts.status, "pending")));
    return event.type;
  }
  if (event.type !== "payment.succeeded") return `ignored: ${event.type}`;

  // Don't trust the payload alone: confirm with the API using the secret key.
  if (!cfg.secretKey || !cfg.methodId || !checkout.providerCheckoutId) throw badRequest("Gateway is not configured");
  const res = await fetch(`${apiBase(env)}/checkouts/${checkout.providerCheckoutId}`, {
    headers: { Authorization: `Bearer ${cfg.secretKey}` },
  });
  if (!res.ok) throw badRequest("Could not confirm the payment with payments.lk"); // 4xx/5xx makes payments.lk retry
  const remote = (await res.json()) as { payment?: { id?: string; status?: string; amountCents?: number } };
  if (remote.payment?.status !== "succeeded" && remote.payment?.status !== "partially_refunded") return "not succeeded yet";
  if (remote.payment.amountCents !== checkout.amount) {
    await db.update(gatewayCheckouts).set({ status: "failed", failureMessage: "Amount mismatch" }).where(eq(gatewayCheckouts.id, checkout.id));
    return "amount mismatch";
  }

  const [row] = await db
    .select({ user: users, business: businesses })
    .from(users)
    .innerJoin(businesses, eq(businesses.id, users.businessId))
    .where(and(eq(users.id, checkout.createdBy), eq(users.businessId, businessId)));
  if (!row) throw notFound("User");
  const ctx = createCtx({
    db,
    env,
    business: row.business,
    userId: row.user.id,
    userName: row.user.name,
    role: row.user.role as Role,
    ip: null,
  });
  await addInvoicePayment(ctx, checkout.docId, {
    payments: [
      {
        tender: "method",
        methodId: cfg.methodId,
        amount: checkout.amount,
        reference: remote.payment.id ?? checkout.providerPaymentId ?? checkout.providerCheckoutId,
      },
    ],
  });
  await db
    .update(gatewayCheckouts)
    .set({ status: "paid", paidAt: Date.now(), providerPaymentId: remote.payment.id ?? null })
    .where(eq(gatewayCheckouts.id, checkout.id));
  return "settled";
}
