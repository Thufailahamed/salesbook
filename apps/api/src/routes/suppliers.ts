import { and, asc, desc, eq, gt, like, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import {
  applyCreditSchema,
  creditRefundSchema,
  partyListQuerySchema,
  partyPaymentSchema,
  statementQuerySchema,
  supplierSchema,
} from "@shopbooks/shared";
import { expenses, payments, purchaseReturns, purchases, suppliers } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { conflict } from "../lib/errors";
import { clean, likeQ, pageParams, paged } from "../lib/http";
import { newId } from "../lib/ids";
import { vJson, vQuery } from "../lib/validate";
import {
  defaultLocationId,
  mapOpenDoc,
  mapSupplier,
  statementRange,
  supplierStatement,
} from "../services/parties-read";
import {
  applySupplierCredit,
  getSupplier,
  openBills,
  paySupplier,
  supplierRefundCredit,
} from "../services/payments";
import { Tx } from "../services/tx";

const app = new Hono<AppEnv>();
const view = requirePerm("suppliers.view");
const manage = requirePerm("suppliers.manage");

function assertZeroBalances(s: { name: string; dueBalance: number; creditBalance: number }) {
  if (s.dueBalance !== 0) throw conflict(`You still owe ${s.name}. Settle the balance before archiving.`);
  if (s.creditBalance !== 0) {
    throw conflict(`${s.name} still owes you a credit. Apply or recover it before archiving.`);
  }
}

app.get("/", view, vQuery(partyListQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(suppliers.businessId, ctx.businessId)];
  const status = q.status ?? "active";
  if (status === "active") conds.push(eq(suppliers.isActive, true));
  if (status === "archived") conds.push(eq(suppliers.isActive, false));
  if (q.balance === "due") conds.push(gt(suppliers.dueBalance, 0));
  if (q.balance === "credit") conds.push(gt(suppliers.creditBalance, 0));
  if (q.q) {
    const term = likeQ(q.q);
    conds.push(
      or(
        like(suppliers.name, term),
        like(suppliers.contactName, term),
        like(suppliers.phone, term),
        like(suppliers.email, term),
      )!,
    );
  }
  const where = and(...conds);
  const dir = q.order === "asc" ? asc : desc;
  const orderBy =
    q.sort === "due"
      ? [dir(suppliers.dueBalance), asc(suppliers.name)]
      : q.sort === "credit"
        ? [dir(suppliers.creditBalance), asc(suppliers.name)]
        : q.sort === "purchased"
          ? [dir(suppliers.totalPurchased), asc(suppliers.name)]
          : q.sort === "recent"
            ? [dir(suppliers.lastPurchaseAt), asc(suppliers.name)]
            : [q.order === "desc" ? desc(suppliers.name) : asc(suppliers.name)];
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select()
      .from(suppliers)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    ctx.db
      .select({
        n: sql<number>`count(*)`,
        due: sql<number>`coalesce(sum(${suppliers.dueBalance}), 0)`,
        credit: sql<number>`coalesce(sum(${suppliers.creditBalance}), 0)`,
      })
      .from(suppliers)
      .where(where),
  ]);
  return c.json({
    ...paged(rows.map(mapSupplier), count?.n ?? 0, q),
    totals: { due: Number(count?.due ?? 0), credit: Number(count?.credit ?? 0) },
  });
});

app.post("/", manage, vJson(supplierSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = clean(c.req.valid("json"));
  const id = newId();
  const opening = input.openingBalance ?? 0;
  const tx = new Tx(ctx);
  tx.add(
    ctx.db.insert(suppliers).values({
      id,
      businessId: ctx.businessId,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxNumber: input.taxNumber ?? null,
      paymentTermsDays: input.paymentTermsDays,
      dueBalance: opening,
      notes: input.notes ?? null,
      isActive: input.isActive,
      createdAt: ctx.now,
    }),
  );
  if (opening > 0) {
    const purchaseId = newId();
    const number = `OB-${newId().slice(-8)}`;
    const locationId = await defaultLocationId(ctx);
    const sys = await ctx.accounts();
    tx.add(
      ctx.db.insert(purchases).values({
        id: purchaseId,
        businessId: ctx.businessId,
        number,
        kind: "opening_balance",
        status: "received",
        supplierId: id,
        locationId,
        orderDate: ctx.today,
        receivedDate: ctx.today,
        dueDate: ctx.today,
        taxInclusive: false,
        total: opening,
        amountDue: opening,
        paymentStatus: "unpaid",
        note: "Opening balance",
        createdBy: ctx.userId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      }),
    );
    tx.journal({
      date: ctx.today,
      memo: `Opening balance — ${input.name}`,
      sourceType: "opening_balance",
      sourceId: purchaseId,
      sourceNumber: number,
      locationId,
      lines: [
        { accountId: sys.opening_equity, debit: opening },
        { accountId: sys.payable, credit: opening, partyType: "supplier", partyId: id },
      ],
    });
  }
  tx.audit("supplier.create", `Created supplier ${input.name}`, "supplier", id);
  await tx.commit();
  return c.json(mapSupplier(await getSupplier(ctx, id)), 201);
});

app.get("/:id", view, async (c) => c.json(mapSupplier(await getSupplier(c.get("ctx"), c.req.param("id")))));

app.put("/:id", manage, vJson(supplierSchema), async (c) => {
  const ctx = c.get("ctx");
  const existing = await getSupplier(ctx, c.req.param("id"));
  const input = clean(c.req.valid("json"));
  if (existing.isActive && input.isActive === false) assertZeroBalances(existing);
  const tx = new Tx(ctx);
  tx.add(
    ctx.db
      .update(suppliers)
      .set({
        name: input.name,
        contactName: input.contactName ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        taxNumber: input.taxNumber ?? null,
        paymentTermsDays: input.paymentTermsDays,
        notes: input.notes ?? null,
        isActive: input.isActive,
      })
      .where(eq(suppliers.id, existing.id)),
  );
  tx.audit("supplier.update", `Updated supplier ${input.name}`, "supplier", existing.id);
  await tx.commit();
  return c.json(mapSupplier(await getSupplier(ctx, existing.id)));
});

app.delete("/:id", manage, async (c) => {
  const ctx = c.get("ctx");
  const existing = await getSupplier(ctx, c.req.param("id"));
  assertZeroBalances(existing);
  const counts = await Promise.all([
    ctx.db.select({ n: sql<number>`count(*)` }).from(purchases).where(eq(purchases.supplierId, existing.id)),
    ctx.db.select({ n: sql<number>`count(*)` }).from(purchaseReturns).where(eq(purchaseReturns.supplierId, existing.id)),
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(payments)
      .where(and(eq(payments.partyType, "supplier"), eq(payments.partyId, existing.id))),
    ctx.db.select({ n: sql<number>`count(*)` }).from(expenses).where(eq(expenses.supplierId, existing.id)),
  ]);
  const hasHistory = counts.some(([r]) => (r?.n ?? 0) > 0);
  const tx = new Tx(ctx);
  if (hasHistory) {
    tx.add(ctx.db.update(suppliers).set({ isActive: false }).where(eq(suppliers.id, existing.id)));
    tx.audit("supplier.archive", `Archived supplier ${existing.name}`, "supplier", existing.id);
  } else {
    tx.add(ctx.db.delete(suppliers).where(eq(suppliers.id, existing.id)));
    tx.audit("supplier.delete", `Deleted supplier ${existing.name}`, "supplier", existing.id);
  }
  await tx.commit();
  return c.json({ ok: true as const });
});

app.get("/:id/statement", view, vQuery(statementQuerySchema), async (c) => {
  const ctx = c.get("ctx");
  const supplier = await getSupplier(ctx, c.req.param("id"));
  const { from, to } = statementRange(ctx, c.req.valid("query"));
  return c.json(await supplierStatement(ctx, supplier, from, to));
});

app.get("/:id/open-bills", view, async (c) => {
  const ctx = c.get("ctx");
  const supplier = await getSupplier(ctx, c.req.param("id"));
  return c.json((await openBills(ctx, supplier.id)).map(mapOpenDoc));
});

app.post("/:id/payments", vJson(partyPaymentSchema), async (c) => {
  return c.json(await paySupplier(c.get("ctx"), c.req.param("id"), c.req.valid("json")), 201);
});

app.post("/:id/apply-credit", vJson(applyCreditSchema), async (c) => {
  return c.json(mapSupplier(await applySupplierCredit(c.get("ctx"), c.req.param("id"), c.req.valid("json"))));
});

app.post("/:id/refund-credit", vJson(creditRefundSchema), async (c) => {
  return c.json(await supplierRefundCredit(c.get("ctx"), c.req.param("id"), c.req.valid("json")), 201);
});

export default app;
