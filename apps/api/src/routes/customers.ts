import { and, asc, desc, eq, gt, like, ne, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import {
  applyCreditSchema,
  creditRefundSchema,
  customerSchema,
  partyListQuerySchema,
  partyPaymentSchema,
  statementQuerySchema,
} from "@shopbooks/shared";
import { customers, giftCards, invoices, payments, quotations, saleReturns } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import type { Ctx } from "../lib/context";
import { conflict } from "../lib/errors";
import { clean, likeQ, pageParams, paged } from "../lib/http";
import { newId } from "../lib/ids";
import { vJson, vQuery } from "../lib/validate";
import {
  mapCustomer,
  mapOpenDoc,
  customerStatement,
  defaultLocationId,
  statementRange,
} from "../services/parties-read";
import {
  applyCustomerCredit,
  getCustomer,
  openInvoices,
  receiveCustomerPayment,
  refundCustomerCredit,
} from "../services/payments";
import { Tx } from "../services/tx";

const app = new Hono<AppEnv>();
const view = requirePerm("customers.view");
const manage = requirePerm("customers.manage");

async function assertUniquePhone(ctx: Ctx, phone: string | null | undefined, exceptId?: string) {
  if (!phone) return;
  const conds: SQL[] = [eq(customers.businessId, ctx.businessId), eq(customers.phone, phone), eq(customers.isActive, true)];
  if (exceptId) conds.push(ne(customers.id, exceptId));
  const [dup] = await ctx.db.select({ name: customers.name }).from(customers).where(and(...conds)).limit(1);
  if (dup) throw conflict(`${dup.name} already uses the phone number ${phone}`);
}

function assertZeroBalances(c: { name: string; dueBalance: number; creditBalance: number }) {
  if (c.dueBalance !== 0) throw conflict(`${c.name} still owes money. Settle the balance before archiving.`);
  if (c.creditBalance !== 0) {
    throw conflict(`${c.name} still has store credit. Use or refund it before archiving.`);
  }
}

app.get("/", view, vQuery(partyListQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(customers.businessId, ctx.businessId)];
  const status = q.status ?? "active";
  if (status === "active") conds.push(eq(customers.isActive, true));
  if (status === "archived") conds.push(eq(customers.isActive, false));
  if (q.balance === "due") conds.push(gt(customers.dueBalance, 0));
  if (q.balance === "credit") conds.push(gt(customers.creditBalance, 0));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(or(like(customers.name, term), like(customers.phone, term), like(customers.email, term))!);
  }
  const where = and(...conds);
  const dir = q.order === "asc" ? asc : desc;
  const orderBy =
    q.sort === "due"
      ? [dir(customers.dueBalance), asc(customers.name)]
      : q.sort === "credit"
        ? [dir(customers.creditBalance), asc(customers.name)]
        : q.sort === "spent"
          ? [dir(customers.totalSpent), asc(customers.name)]
          : q.sort === "recent"
            ? [dir(customers.lastPurchaseAt), asc(customers.name)]
            : q.sort === "created"
              ? [dir(customers.createdAt)]
              : [q.order === "desc" ? desc(customers.name) : asc(customers.name)];
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select()
      .from(customers)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        due: sql<number>`coalesce(sum(${customers.dueBalance}), 0)`,
        credit: sql<number>`coalesce(sum(${customers.creditBalance}), 0)`,
      })
      .from(customers)
      .where(where),
  ]);
  return c.json({
    ...paged(rows.map(mapCustomer), count?.n ?? 0, q),
    totals: { due: Number(count?.due ?? 0), credit: Number(count?.credit ?? 0) },
  });
});

app.post("/", manage, vJson(customerSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = clean(c.req.valid("json"));
  await assertUniquePhone(ctx, input.phone);
  const id = newId();
  const opening = input.openingBalance ?? 0;
  const tx = new Tx(ctx);
  tx.add(
    ctx.db.insert(customers).values({
      id,
      businessId: ctx.businessId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxNumber: input.taxNumber ?? null,
      type: input.type,
      priceTier: input.priceTier,
      allowCredit: input.allowCredit,
      creditLimit: input.creditLimit,
      dueBalance: opening,
      loyaltyPoints: ctx.can("settings.manage") ? (input.loyaltyPoints ?? 0) : 0,
      birthday: input.birthday ?? null,
      notes: input.notes ?? null,
      isActive: input.isActive,
      createdAt: ctx.now,
    }),
  );
  if (opening > 0) {
    const invoiceId = newId();
    const number = `OB-${newId().slice(-8)}`;
    const locationId = await defaultLocationId(ctx);
    const sys = await ctx.accounts();
    tx.add(
      ctx.db.insert(invoices).values({
        id: invoiceId,
        businessId: ctx.businessId,
        number,
        kind: "opening_balance",
        date: ctx.today,
        dueDate: ctx.today,
        status: "completed",
        paymentStatus: "unpaid",
        locationId,
        customerId: id,
        customerName: input.name,
        priceTier: input.priceTier,
        taxInclusive: ctx.business.taxInclusive,
        total: opening,
        amountDue: opening,
        note: "Opening balance",
        createdBy: ctx.userId,
        createdAt: ctx.now,
      }),
    );
    tx.journal({
      date: ctx.today,
      memo: `Opening balance — ${input.name}`,
      sourceType: "opening_balance",
      sourceId: invoiceId,
      sourceNumber: number,
      locationId,
      lines: [
        { accountId: sys.receivable, debit: opening, partyType: "customer", partyId: id },
        { accountId: sys.opening_equity, credit: opening },
      ],
    });
  }
  tx.audit("customer.create", `Created customer ${input.name}`, "customer", id);
  await tx.commit();
  return c.json(mapCustomer(await getCustomer(ctx, id)), 201);
});

app.get("/:id", view, async (c) => c.json(mapCustomer(await getCustomer(c.get("ctx"), c.req.param("id")))));

app.put("/:id", manage, vJson(customerSchema), async (c) => {
  const ctx = c.get("ctx");
  const existing = await getCustomer(ctx, c.req.param("id"));
  const input = clean(c.req.valid("json"));
  if (existing.isActive && input.isActive === false) assertZeroBalances(existing);
  await assertUniquePhone(ctx, input.phone, existing.id);
  const tx = new Tx(ctx);
  tx.add(
    ctx.db
      .update(customers)
      .set({
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        taxNumber: input.taxNumber ?? null,
        type: input.type,
        priceTier: input.priceTier,
        allowCredit: input.allowCredit,
        creditLimit: input.creditLimit,
        birthday: input.birthday ?? null,
        notes: input.notes ?? null,
        isActive: input.isActive,
        ...(input.loyaltyPoints !== undefined && ctx.can("settings.manage") ? { loyaltyPoints: input.loyaltyPoints } : {}),
      })
      .where(eq(customers.id, existing.id)),
  );
  tx.audit("customer.update", `Updated customer ${input.name}`, "customer", existing.id);
  await tx.commit();
  return c.json(mapCustomer(await getCustomer(ctx, existing.id)));
});

app.delete("/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const existing = await getCustomer(ctx, c.req.param("id"));
  assertZeroBalances(existing);
  const counts = await Promise.all([
    ctx.db.select({ n: sql<number>`count(*)` }).from(invoices).where(eq(invoices.customerId, existing.id)),
    ctx.db.select({ n: sql<number>`count(*)` }).from(saleReturns).where(eq(saleReturns.customerId, existing.id)),
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(payments)
      .where(and(eq(payments.partyType, "customer"), eq(payments.partyId, existing.id))),
    ctx.db.select({ n: sql<number>`count(*)` }).from(quotations).where(eq(quotations.customerId, existing.id)),
    ctx.db.select({ n: sql<number>`count(*)` }).from(giftCards).where(eq(giftCards.customerId, existing.id)),
  ]);
  const hasHistory = counts.some(([r]) => (r?.n ?? 0) > 0);
  const tx = new Tx(ctx);
  if (hasHistory) {
    tx.add(ctx.db.update(customers).set({ isActive: false }).where(eq(customers.id, existing.id)));
    tx.audit("customer.archive", `Archived customer ${existing.name}`, "customer", existing.id);
  } else {
    tx.add(ctx.db.delete(customers).where(eq(customers.id, existing.id)));
    tx.audit("customer.delete", `Deleted customer ${existing.name}`, "customer", existing.id);
  }
  await tx.commit();
  return c.json({ ok: true as const });
});

app.get("/:id/statement", view, vQuery(statementQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const customer = await getCustomer(ctx, c.req.param("id"));
  const { from, to } = statementRange(ctx, c.req.valid("query"));
  return c.json(await customerStatement(ctx, customer, from, to));
});

app.get("/:id/open-invoices", view, async (c) => {
  const ctx = c.get("ctx");
  const customer = await getCustomer(ctx, c.req.param("id"));
  return c.json((await openInvoices(ctx, customer.id)).map(mapOpenDoc));
});

app.post("/:id/payments", vJson(partyPaymentSchema), async (c) => {
  return c.json(await receiveCustomerPayment(c.get("ctx"), c.req.param("id"), c.req.valid("json")), 201);
});

app.post("/:id/apply-credit", vJson(applyCreditSchema), async (c) => {
  return c.json(mapCustomer(await applyCustomerCredit(c.get("ctx"), c.req.param("id"), c.req.valid("json"))));
});

app.post("/:id/refund-credit", vJson(creditRefundSchema), async (c) => {
  return c.json(await refundCustomerCredit(c.get("ctx"), c.req.param("id"), c.req.valid("json")), 201);
});

export default app;
