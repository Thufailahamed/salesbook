import { and, desc, eq, like, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  dateInTimeZone,
  type GiftCard,
  type GiftCardInput,
  type GiftCardStatus,
  type GiftCardTransaction,
} from "@shopbooks/shared";
import { customers, giftCards, journalEntries, payments, users } from "../db/schema";
import type { Ctx } from "../lib/context";
import { badRequest, conflict, notFound } from "../lib/errors";
import { likeQ, pageParams, paged } from "../lib/http";
import { newId, randomCode } from "../lib/ids";
import {
  getCustomer,
  getOpenShift,
  methodTender,
  paymentInsert,
  requireMethod,
  type GiftCardRow,
} from "./payments";
import { reserveNumbers } from "./sequences";
import { Tx } from "./tx";

const creator = alias(users, "creator");

function giftCardSelect(ctx: Ctx) {
  return ctx.db
    .select({ g: giftCards, customerName: customers.name, createdByName: creator.name })
    .from(giftCards)
    .leftJoin(customers, eq(customers.id, giftCards.customerId))
    .leftJoin(creator, eq(creator.id, giftCards.createdBy));
}

type GiftCardSelectRow = Awaited<ReturnType<ReturnType<typeof giftCardSelect>["where"]>>[number];

function effectiveStatus(ctx: Ctx, g: GiftCardRow): GiftCardStatus {
  if (g.status === "active" && g.expiresOn && g.expiresOn < ctx.today) return "expired";
  return g.status as GiftCardStatus;
}

function mapGiftCard(ctx: Ctx, r: GiftCardSelectRow): GiftCard {
  return {
    id: r.g.id,
    code: r.g.code,
    initialValue: r.g.initialValue,
    balance: r.g.balance,
    status: effectiveStatus(ctx, r.g),
    expiresOn: r.g.expiresOn,
    customerId: r.g.customerId,
    customerName: r.customerName ?? null,
    note: r.g.note,
    paid: r.g.paid,
    issuedAt: r.g.issuedAt,
    createdByName: r.createdByName ?? null,
  };
}

export async function getGiftCardRow(ctx: Ctx, id: string): Promise<GiftCardRow> {
  const [row] = await ctx.db
    .select()
    .from(giftCards)
    .where(and(eq(giftCards.id, id), eq(giftCards.businessId, ctx.businessId)));
  if (!row) throw notFound("Gift card");
  return row;
}

async function transactionsFor(ctx: Ctx, card: GiftCardRow): Promise<GiftCardTransaction[]> {
  const [pays, voids] = await Promise.all([
    ctx.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.businessId, ctx.businessId),
          eq(payments.giftCardId, card.id),
          eq(payments.status, "completed"),
          ne(payments.source, "gift_card_sale"),
        ),
      ),
    ctx.db
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.businessId, ctx.businessId),
          eq(journalEntries.sourceType, "gift_card"),
          eq(journalEntries.sourceId, card.id),
          like(journalEntries.memo, "%voided%"),
        ),
      ),
  ]);
  const list: GiftCardTransaction[] = [
    {
      id: `${card.id}-issue`,
      date: dateInTimeZone(ctx.business.timezone, card.issuedAt),
      createdAt: card.issuedAt,
      type: "issue",
      amount: card.initialValue,
      reference: card.paid ? null : "Promotional",
      refType: "gift_card",
      refId: card.id,
    },
    ...pays.map(
      (p): GiftCardTransaction => ({
        id: p.id,
        date: p.date,
        createdAt: p.createdAt,
        type: p.direction === "in" ? "redeem" : "refund",
        amount: p.direction === "in" ? -p.amount : p.amount,
        reference: p.number,
        refType: "payment",
        refId: p.id,
      }),
    ),
    ...voids.map(
      (j): GiftCardTransaction => ({
        id: j.id,
        date: j.date,
        createdAt: j.createdAt,
        type: "void",
        amount: -j.totalDebit,
        reference: j.number,
        refType: "journal",
        refId: j.id,
      }),
    ),
  ];
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getGiftCardDto(ctx: Ctx, id: string): Promise<GiftCard> {
  const [row] = await giftCardSelect(ctx).where(and(eq(giftCards.id, id), eq(giftCards.businessId, ctx.businessId)));
  if (!row) throw notFound("Gift card");
  return { ...mapGiftCard(ctx, row), transactions: await transactionsFor(ctx, row.g) };
}

export async function lookupGiftCard(ctx: Ctx, code: string): Promise<GiftCard> {
  const [row] = await giftCardSelect(ctx).where(
    and(eq(giftCards.businessId, ctx.businessId), sql`upper(${giftCards.code}) = upper(${code.trim()})`),
  );
  if (!row) throw notFound("Gift card");
  return mapGiftCard(ctx, row);
}

export async function listGiftCards(
  ctx: Ctx,
  q: { page: number; pageSize: number; q?: string; status?: GiftCardStatus; customerId?: string },
) {
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(giftCards.businessId, ctx.businessId)];
  if (q.customerId) conds.push(eq(giftCards.customerId, q.customerId));
  if (q.status === "expired") {
    conds.push(eq(giftCards.status, "active"), sql`${giftCards.expiresOn} < ${ctx.today}`);
  } else if (q.status === "active") {
    conds.push(eq(giftCards.status, "active"), or(sql`${giftCards.expiresOn} IS NULL`, sql`${giftCards.expiresOn} >= ${ctx.today}`)!);
  } else if (q.status) {
    conds.push(eq(giftCards.status, q.status));
  }
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(giftCards.code, term), like(customers.name, term))!);
  }
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    giftCardSelect(ctx).where(where).orderBy(desc(giftCards.issuedAt)).limit(limit).offset(offset),
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        balance: sql<number>`coalesce(sum(case when ${giftCards.status} = 'active' then ${giftCards.balance} else 0 end), 0)`,
      })
      .from(giftCards)
      .leftJoin(customers, eq(customers.id, giftCards.customerId))
      .where(where),
  ]);
  return {
    ...paged(
      rows.map((r) => mapGiftCard(ctx, r)),
      count?.n ?? 0,
      q,
    ),
    totals: { outstanding: Number(count?.balance ?? 0) },
  };
}

async function codeExists(ctx: Ctx, code: string) {
  const [row] = await ctx.db
    .select({ id: giftCards.id })
    .from(giftCards)
    .where(and(eq(giftCards.businessId, ctx.businessId), sql`upper(${giftCards.code}) = ${code}`));
  return !!row;
}

export async function issueGiftCard(ctx: Ctx, input: GiftCardInput): Promise<GiftCard> {
  ctx.require("giftcards.manage");
  let code = input.code?.trim().toUpperCase().replace(/\s+/g, "") || "";
  if (code) {
    if (!/^[A-Z0-9-]{4,40}$/.test(code)) throw badRequest("Gift card codes use 4–40 letters, digits or dashes");
    if (await codeExists(ctx, code)) throw conflict(`Gift card ${code} already exists`);
  } else {
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = randomCode(12);
      if (!(await codeExists(ctx, candidate))) code = candidate;
    }
    if (!code) throw new Error("Could not generate a unique gift card code");
  }
  if (input.customerId) await getCustomer(ctx, input.customerId);
  if (input.expiresOn && input.expiresOn < ctx.today) throw badRequest("The expiry date is in the past");
  const method = input.paid ? await requireMethod(ctx, input.methodId) : null;
  const sys = await ctx.accounts();

  const card: GiftCardRow = {
    id: newId(),
    businessId: ctx.businessId,
    code,
    initialValue: input.value,
    balance: input.value,
    status: "active",
    expiresOn: input.expiresOn ?? null,
    customerId: input.customerId ?? null,
    note: input.note?.trim() || null,
    paid: input.paid,
    createdBy: ctx.userId,
    issuedAt: ctx.now,
  };

  const tx = new Tx(ctx);
  tx.add(ctx.db.insert(giftCards).values(card));
  if (method) {
    const { receipt } = await reserveNumbers(ctx, { receipt: 1 });
    const shift = method.type === "cash" ? await getOpenShift(ctx) : null;
    const { stmt } = paymentInsert(ctx, {
      number: receipt[0]!,
      date: ctx.today,
      direction: "in",
      source: "gift_card_sale",
      partyType: card.customerId ? "customer" : "none",
      partyId: card.customerId,
      tender: { ...methodTender(method, input.value, input.reference ?? null), giftCard: card },
      shiftId: shift?.id,
      locationId: shift?.locationId,
      note: `Gift card ${code} sold`,
    });
    tx.add(stmt);
  }
  tx.journal({
    date: ctx.today,
    memo: method ? `Gift card ${code} issued (sold)` : `Gift card ${code} issued (promotional)`,
    sourceType: "gift_card",
    sourceId: card.id,
    sourceNumber: code,
    lines: [
      { accountId: method ? method.accountId : sys.marketing, debit: input.value },
      {
        accountId: sys.gift_card,
        credit: input.value,
        ...(card.customerId ? { partyType: "customer" as const, partyId: card.customerId } : {}),
      },
    ],
  });
  tx.audit("gift_card.issue", `Issued gift card ${code}`, "gift_card", card.id, { value: input.value, paid: input.paid });
  await tx.commit();
  return getGiftCardDto(ctx, card.id);
}

export async function updateGiftCard(
  ctx: Ctx,
  id: string,
  input: { status?: "active" | "void"; expiresOn?: string | null; note?: string | null; customerId?: string | null },
): Promise<GiftCard> {
  ctx.require("giftcards.manage");
  const card = await getGiftCardRow(ctx, id);
  const patch: Partial<GiftCardRow> = {};
  const tx = new Tx(ctx);

  if (input.status === "void" && card.status !== "void") {
    if (card.balance > 0) {
      const sys = await ctx.accounts();
      tx.journal({
        date: ctx.today,
        memo: `Gift card ${card.code} voided — unused balance recognised`,
        sourceType: "gift_card",
        sourceId: card.id,
        sourceNumber: card.code,
        lines: [
          { accountId: sys.gift_card, debit: card.balance },
          { accountId: sys.other_income, credit: card.balance, memo: "Gift card breakage" },
        ],
      });
    }
    patch.status = "void";
    patch.balance = 0;
  } else if (input.status === "active" && card.status !== "active") {
    if (card.status === "void") throw badRequest("A voided gift card can't be reactivated");
    if (card.balance <= 0) throw badRequest("This gift card has been fully redeemed");
    patch.status = "active";
  }
  if (input.expiresOn !== undefined) patch.expiresOn = input.expiresOn || null;
  if (input.note !== undefined) patch.note = input.note?.trim() || null;
  if (input.customerId !== undefined) {
    if (input.customerId) await getCustomer(ctx, input.customerId);
    patch.customerId = input.customerId || null;
  }
  if (Object.keys(patch).length === 0) return getGiftCardDto(ctx, id);

  tx.add(ctx.db.update(giftCards).set(patch).where(eq(giftCards.id, card.id)));
  tx.audit(
    patch.status === "void" ? "gift_card.void" : "gift_card.update",
    patch.status === "void" ? `Voided gift card ${card.code}` : `Updated gift card ${card.code}`,
    "gift_card",
    card.id,
  );
  await tx.commit();
  return getGiftCardDto(ctx, id);
}

