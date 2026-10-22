/**
 * Customer messaging: receipts, payment reminders and "order ready" notes by SMS (Notify.lk) or WhatsApp.
 *
 * SMS is sent from the server with the shop's own Notify.lk account. WhatsApp needs no account: the server writes the
 * message and the user's browser opens a wa.me chat with it filled in, so a person always presses send.
 * Every attempt is logged in `messages`. Reminders and receipts carry a payments.lk pay link when online payments are on.
 */
import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import {
  DEFAULT_MESSAGE_TEMPLATES,
  currencyDecimals,
  daysBetween,
  toMajor,
  type MessageComposeInput,
  type MessageKind,
  type MessageLogEntry,
  type MessagePreview,
  type MessageSendInput,
  type MessageSendResult,
  type MessageSettings,
  type MessageSettingsInput,
  type MessageStatus,
  type OverdueCustomer,
  type RemindOverdueResult,
} from "@shopbooks/shared";
import { customers, gatewayCheckouts, invoices, messageSettings, messages, users } from "../db/schema";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { newId } from "../lib/ids";
import { createInvoiceCheckout, gatewayEnabled } from "./gateway";
import { getCustomer, openInvoices } from "./payments";
import { getInvoiceRow } from "./sales";

type SettingsRow = typeof messageSettings.$inferSelect;

const DAY = 86_400_000;
const LINK_REUSE_MS = DAY;

async function loadSettings(ctx: Ctx): Promise<SettingsRow | null> {
  const [row] = await ctx.db.select().from(messageSettings).where(eq(messageSettings.businessId, ctx.businessId));
  return row ?? null;
}

const smsConfigured = (row: SettingsRow | null) =>
  row?.smsProvider === "notify_lk" && !!row.notifyUserId && !!row.notifyApiKey && !!row.senderId;

function templatesOf(row: SettingsRow | null): Record<MessageKind, string> {
  return {
    receipt: row?.receiptTemplate?.trim() || DEFAULT_MESSAGE_TEMPLATES.receipt,
    reminder: row?.reminderTemplate?.trim() || DEFAULT_MESSAGE_TEMPLATES.reminder,
    order_ready: row?.readyTemplate?.trim() || DEFAULT_MESSAGE_TEMPLATES.order_ready,
  };
}

export async function getMessageSettings(ctx: Ctx): Promise<MessageSettings> {
  const row = await loadSettings(ctx);
  return {
    smsProvider: (row?.smsProvider as MessageSettings["smsProvider"]) ?? "none",
    notifyUserId: row?.notifyUserId ?? null,
    hasApiKey: !!row?.notifyApiKey,
    senderId: row?.senderId ?? null,
    countryCode: row?.countryCode ?? "94",
    includePayLink: row?.includePayLink ?? true,
    templates: templatesOf(row),
    smsReady: smsConfigured(row),
    payLinkAvailable: await gatewayEnabled(ctx),
  };
}

export async function getMessageStatus(ctx: Ctx): Promise<MessageStatus> {
  const row = await loadSettings(ctx);
  return { smsReady: smsConfigured(row), countryCode: row?.countryCode ?? "94" };
}

export async function saveMessageSettings(ctx: Ctx, input: MessageSettingsInput): Promise<MessageSettings> {
  const prev = await loadSettings(ctx);
  const apiKey = input.notifyApiKey || prev?.notifyApiKey || null;
  if (input.smsProvider === "notify_lk" && (!input.notifyUserId || !apiKey || !input.senderId)) {
    throw badRequest("Notify.lk needs the user ID, API key and a sender ID");
  }
  const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  const values = {
    businessId: ctx.businessId,
    smsProvider: input.smsProvider,
    notifyUserId: blank(input.notifyUserId),
    notifyApiKey: apiKey,
    senderId: blank(input.senderId),
    countryCode: input.countryCode,
    includePayLink: input.includePayLink,
    receiptTemplate: blank(input.receiptTemplate),
    reminderTemplate: blank(input.reminderTemplate),
    readyTemplate: blank(input.readyTemplate),
    updatedAt: ctx.now,
  };
  await ctx.db.insert(messageSettings).values(values).onConflictDoUpdate({ target: messageSettings.businessId, set: values });
  return getMessageSettings(ctx);
}

// ---------------------------------------------------------------- composing

/** "0771234567" / "+94 77 123 4567" / "94771234567" → "94771234567". Null when it can't be a phone number. */
export function normalizePhone(raw: string | null | undefined, countryCode: string): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  const international = d.startsWith("+") || d.startsWith("00");
  d = d.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!international) {
    if (d.startsWith("0")) d = countryCode + d.slice(1);
    else if (!d.startsWith(countryCode) || d.length <= 9) d = countryCode + d;
  }
  return d.length >= 9 && d.length <= 15 ? d : null;
}

function render(template: string, vars: Record<string, string>) {
  return template
    .replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A pay link for the invoice: reuse a recent pending checkout for the same amount, else create one. Null if unavailable. */
async function payLink(ctx: Ctx, invoiceId: string, amount: number, origin: string): Promise<string | null> {
  try {
    const [existing] = await ctx.db
      .select({ url: gatewayCheckouts.url })
      .from(gatewayCheckouts)
      .where(
        and(
          eq(gatewayCheckouts.businessId, ctx.businessId),
          eq(gatewayCheckouts.docType, "invoice"),
          eq(gatewayCheckouts.docId, invoiceId),
          eq(gatewayCheckouts.status, "pending"),
          eq(gatewayCheckouts.amount, amount),
          gt(gatewayCheckouts.createdAt, ctx.now - LINK_REUSE_MS),
          isNotNull(gatewayCheckouts.url),
        ),
      )
      .orderBy(desc(gatewayCheckouts.createdAt))
      .limit(1);
    if (existing?.url) return existing.url;
    return (await createInvoiceCheckout(ctx, { invoiceId, amount }, origin)).url;
  } catch {
    return null; // a missing link never stops a message
  }
}

interface Composed extends MessagePreview {
  docType: "invoice" | null;
  docId: string | null;
}

async function compose(ctx: Ctx, input: MessageComposeInput, origin: string): Promise<Composed> {
  const cfg = await loadSettings(ctx);
  const cc = cfg?.countryCode ?? "94";
  const decimals = currencyDecimals(ctx.business.currency);
  const money = (minor: number) =>
    `${ctx.business.currency} ${new Intl.NumberFormat("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(toMajor(minor, decimals))}`;
  const wantLink = (cfg?.includePayLink ?? true) && (await gatewayEnabled(ctx));

  const inv = input.invoiceId ? await getInvoiceRow(ctx, input.invoiceId) : null;
  if (input.kind === "receipt" && !inv) throw badRequest("Choose the invoice to send a receipt for");
  if (inv && inv.status !== "completed") throw badRequest("This invoice is void");
  const customerId = input.customerId ?? inv?.customerId ?? null;
  if (input.kind === "reminder" && !customerId) throw badRequest("Choose the customer to remind");
  const customer = customerId ? await getCustomer(ctx, customerId) : null;

  const vars: Record<string, string> = {
    customer: customer?.name ?? inv?.customerName ?? "there",
    shop: ctx.business.name,
    invoice: inv?.number ?? "",
    date: inv?.date ?? "",
    total: inv ? money(inv.total) : "",
    paid: inv ? money(inv.amountPaid) : "",
    amount: "",
    count: "",
    oldest: "",
    balance_line: "",
    link_line: "",
    invoice_part: inv ? ` ${inv.number}` : "",
  };

  let linkInvoiceId: string | null = null;
  let linkAmount = 0;
  if (input.kind === "reminder") {
    const docs = await openInvoices(ctx, customerId!);
    if (docs.length === 0) throw badRequest("Nothing is owed by this customer");
    const total = docs.reduce((s, d) => s + d.amountDue, 0);
    const oldest = Math.max(0, ...docs.map((d) => daysBetween(d.dueDate ?? d.date, ctx.today)));
    vars.amount = money(total);
    vars.count = docs.length === 1 ? `invoice ${docs[0]!.number}` : `${docs.length} invoices`;
    vars.oldest = oldest > 0 ? `${oldest} day${oldest === 1 ? "" : "s"} overdue` : "not yet due";
    if (docs.length === 1) {
      linkInvoiceId = docs[0]!.id;
      linkAmount = docs[0]!.amountDue;
    }
  } else if (input.kind === "receipt" && inv && inv.amountDue > 0) {
    vars.balance_line = ` Balance due: ${money(inv.amountDue)}.`;
    linkInvoiceId = inv.id;
    linkAmount = inv.amountDue;
  }
  if (wantLink && linkInvoiceId) {
    const url = await payLink(ctx, linkInvoiceId, linkAmount, origin);
    if (url) vars.link_line = ` Pay online: ${url}`;
  }

  return {
    kind: input.kind,
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? inv?.customerName ?? null,
    phone: normalizePhone(input.phone?.trim() || customer?.phone, cc),
    body: render(templatesOf(cfg)[input.kind], vars),
    docType: inv ? "invoice" : null,
    docId: inv?.id ?? null,
  };
}

export async function previewMessage(ctx: Ctx, input: MessageComposeInput, origin: string): Promise<MessagePreview> {
  ctx.require("messaging.send");
  const { docType: _t, docId: _d, ...preview } = await compose(ctx, input, origin);
  return preview;
}

// ---------------------------------------------------------------- sending

/** Notify.lk: POST form fields user_id, api_key, sender_id, to, message → { status: "success" | "error", message? }. */
async function sendNotifyLk(ctx: Ctx, cfg: SettingsRow, phone: string, body: string): Promise<string | null> {
  const url = ctx.env.NOTIFY_LK_API ?? "https://app.notify.lk/api/v1/send";
  const form = new URLSearchParams({
    user_id: cfg.notifyUserId!,
    api_key: cfg.notifyApiKey!,
    sender_id: cfg.senderId!,
    to: phone,
    message: body,
  });
  const res = await fetch(url, { method: "POST", body: form }).catch(() => {
    throw new Error("Could not reach Notify.lk. Try again in a moment.");
  });
  const json = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: unknown } | null;
  if (!res.ok || json?.status !== "success") {
    throw new Error(`Notify.lk: ${json?.message ?? `send failed (${res.status})`}`);
  }
  return typeof json.data === "string" ? json.data : null;
}

async function logMessage(
  ctx: Ctx,
  m: {
    kind: MessageKind;
    channel: "sms" | "whatsapp";
    customerId: string | null;
    docType: string | null;
    docId: string | null;
    phone: string;
    body: string;
    status: "sent" | "opened" | "failed";
    error?: string | null;
    providerRef?: string | null;
  },
): Promise<MessageLogEntry> {
  const row = {
    id: newId(),
    businessId: ctx.businessId,
    kind: m.kind,
    channel: m.channel,
    customerId: m.customerId,
    docType: m.docType,
    docId: m.docId,
    toPhone: m.phone,
    body: m.body,
    status: m.status,
    error: m.error ?? null,
    providerRef: m.providerRef ?? null,
    createdBy: ctx.userId,
    createdAt: ctx.now,
  };
  await ctx.db.insert(messages).values(row);
  const customer = m.customerId ? await getCustomer(ctx, m.customerId).catch(() => null) : null;
  return {
    id: row.id,
    kind: m.kind,
    channel: m.channel,
    customerId: m.customerId,
    customerName: customer?.name ?? null,
    toPhone: m.phone,
    body: m.body,
    status: m.status,
    error: row.error,
    createdAt: ctx.now,
    createdByName: ctx.userName,
  };
}

export async function sendMessage(ctx: Ctx, input: MessageSendInput, origin: string): Promise<MessageSendResult> {
  ctx.require("messaging.send");
  const cfg = await loadSettings(ctx);
  if (input.channel === "sms" && !smsConfigured(cfg)) throw badRequest("SMS is not set up. Add your Notify.lk details in Settings → Messaging.");
  const c = await compose(ctx, input, origin);
  if (!c.phone) throw badRequest(c.customerName ? `${c.customerName} has no valid phone number` : "Enter a phone number to send to");
  const body = input.body ?? c.body;
  const base = { kind: input.kind, customerId: c.customerId, docType: c.docType, docId: c.docId, phone: c.phone, body };

  if (input.channel === "whatsapp") {
    const message = await logMessage(ctx, { ...base, channel: "whatsapp", status: "opened" });
    return { message, whatsappUrl: `https://wa.me/${c.phone}?text=${encodeURIComponent(body)}` };
  }
  try {
    const ref = await sendNotifyLk(ctx, cfg!, c.phone, body);
    return { message: await logMessage(ctx, { ...base, channel: "sms", status: "sent", providerRef: ref }), whatsappUrl: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Could not send";
    await logMessage(ctx, { ...base, channel: "sms", status: "failed", error });
    throw badRequest(error);
  }
}

// ---------------------------------------------------------------- overdue customers

export async function overdueCustomers(ctx: Ctx): Promise<OverdueCustomer[]> {
  ctx.require("messaging.send");
  const rows = await ctx.db
    .select({
      customerId: invoices.customerId,
      date: invoices.date,
      dueDate: invoices.dueDate,
      amountDue: invoices.amountDue,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, ctx.businessId),
        eq(invoices.status, "completed"),
        eq(invoices.kind, "sale"),
        gt(invoices.amountDue, 0),
        isNotNull(invoices.customerId),
      ),
    );

  const byCustomer = new Map<string, { total: number; overdue: number; count: number; oldest: number; hasOverdue: boolean }>();
  for (const r of rows) {
    const days = daysBetween(r.dueDate ?? r.date, ctx.today);
    const agg = byCustomer.get(r.customerId!) ?? { total: 0, overdue: 0, count: 0, oldest: 0, hasOverdue: false };
    agg.total += r.amountDue;
    agg.count += 1;
    if (days > 0) {
      agg.overdue += r.amountDue;
      agg.hasOverdue = true;
      agg.oldest = Math.max(agg.oldest, days);
    }
    byCustomer.set(r.customerId!, agg);
  }
  const ids = [...byCustomer].filter(([, a]) => a.hasOverdue).map(([id]) => id);
  if (ids.length === 0) return [];

  const people: { id: string; name: string; phone: string | null }[] = [];
  const last = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    people.push(
      ...(await ctx.db
        .select({ id: customers.id, name: customers.name, phone: customers.phone })
        .from(customers)
        .where(and(eq(customers.businessId, ctx.businessId), inArray(customers.id, chunk)))),
    );
    const reminded = await ctx.db
      .select({ customerId: messages.customerId, at: sql<number>`max(${messages.createdAt})` })
      .from(messages)
      .where(
        and(
          eq(messages.businessId, ctx.businessId),
          eq(messages.kind, "reminder"),
          inArray(messages.status, ["sent", "opened"]),
          inArray(messages.customerId, chunk),
        ),
      )
      .groupBy(messages.customerId);
    for (const r of reminded) if (r.customerId) last.set(r.customerId, r.at);
  }

  const cc = (await loadSettings(ctx))?.countryCode ?? "94";
  return people
    .map((p): OverdueCustomer => {
      const a = byCustomer.get(p.id)!;
      return {
        customerId: p.id,
        name: p.name,
        phone: normalizePhone(p.phone, cc),
        totalDue: a.total,
        overdueDue: a.overdue,
        invoiceCount: a.count,
        oldestDaysOverdue: a.oldest,
        lastRemindedAt: last.get(p.id) ?? null,
      };
    })
    .sort((a, b) => b.overdueDue - a.overdueDue);
}

/** One-tap "remind all overdue customers" by SMS. WhatsApp reminders are sent one chat at a time from the browser. */
export async function remindOverdueBySms(
  ctx: Ctx,
  input: { customerIds: string[]; skipRecentHours: number },
  origin: string,
): Promise<RemindOverdueResult> {
  ctx.require("messaging.bulk");
  const cfg = await loadSettings(ctx);
  if (!smsConfigured(cfg)) throw badRequest("SMS is not set up. Add your Notify.lk details in Settings → Messaging.");
  const overdue = new Map((await overdueCustomers(ctx)).map((c) => [c.customerId, c]));
  const result: RemindOverdueResult = { sent: 0, failed: [], skipped: [] };

  for (const id of new Set(input.customerIds)) {
    const c = overdue.get(id);
    if (!c) {
      result.skipped.push({ customerId: id, name: "Customer", reason: "Nothing overdue" });
      continue;
    }
    if (!c.phone) {
      result.skipped.push({ customerId: id, name: c.name, reason: "No phone number" });
      continue;
    }
    if (c.lastRemindedAt && ctx.now - c.lastRemindedAt < input.skipRecentHours * 3_600_000) {
      result.skipped.push({ customerId: id, name: c.name, reason: "Reminded recently" });
      continue;
    }
    try {
      await sendMessage(ctx, { kind: "reminder", customerId: id, channel: "sms" }, origin);
      result.sent += 1;
    } catch (e) {
      result.failed.push({ customerId: id, name: c.name, error: e instanceof Error ? e.message : "Could not send" });
    }
  }
  return result;
}

// ---------------------------------------------------------------- log

export async function listMessages(ctx: Ctx, q: { customerId?: string; limit: number }): Promise<MessageLogEntry[]> {
  ctx.require("messaging.send");
  const conds = [eq(messages.businessId, ctx.businessId)];
  if (q.customerId) conds.push(eq(messages.customerId, q.customerId));
  const rows = await ctx.db
    .select({ m: messages, customerName: customers.name, userName: users.name })
    .from(messages)
    .leftJoin(customers, eq(customers.id, messages.customerId))
    .leftJoin(users, eq(users.id, messages.createdBy))
    .where(and(...conds))
    .orderBy(desc(messages.createdAt))
    .limit(q.limit);
  return rows.map((r) => ({
    id: r.m.id,
    kind: r.m.kind as MessageKind,
    channel: r.m.channel as "sms" | "whatsapp",
    customerId: r.m.customerId,
    customerName: r.customerName ?? null,
    toPhone: r.m.toPhone,
    body: r.m.body,
    status: r.m.status as "sent" | "opened" | "failed",
    error: r.m.error,
    createdAt: r.m.createdAt,
    createdByName: r.userName ?? null,
  }));
}
