import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { addDays, cashMovementSchema, listQuerySchema, shiftCloseSchema, shiftOpenSchema } from "@shopbooks/shared";
import { accounts, cashMovements, shifts, users } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import type { Stmt } from "../lib/batch";
import type { Ctx } from "../lib/context";
import { badRequest, forbidden } from "../lib/errors";
import { pageParams, paged } from "../lib/http";
import { newId } from "../lib/ids";
import { vJson, vQuery } from "../lib/validate";
import { getOpenShift } from "../services/payments";
import { zonedDayStart } from "../services/reports-utils";
import { getLocation } from "../services/sales";
import { reserveNumbers } from "../services/sequences";
import {
  computeShift,
  computeShifts,
  getShiftReport,
  getShiftRow,
  mapCashMovement,
  shiftSelect,
  type ShiftSelectRow,
} from "../services/shifts";
import { Tx } from "../services/tx";

const app = new Hono<AppEnv>();
app.use("*", requirePerm("registers.use", "registers.viewAll"));

const shiftListQuery = listQuerySchema.extend({
  userId: z.string().optional(),
  locationId: z.string().optional(),
  status: z.enum(["open", "closed"]).optional(),
});

function assertCanSee(ctx: Ctx, row: ShiftSelectRow) {
  if (row.s.userId !== ctx.userId && !ctx.can("registers.viewAll")) throw forbidden("This shift belongs to another user");
}

app.get("/", vQuery(shiftListQuery), async (c) => {
  const ctx = c.get("ctx");
  const q = c.req.valid("query");
  const { limit, offset } = pageParams(q);
  const conds: SQL[] = [eq(shifts.businessId, ctx.businessId)];
  const userId = ctx.can("registers.viewAll") ? q.userId : ctx.userId;
  if (userId) conds.push(eq(shifts.userId, userId));
  if (q.locationId) conds.push(eq(shifts.locationId, q.locationId));
  if (q.status) conds.push(eq(shifts.status, q.status));
  if (q.from) conds.push(gte(shifts.openedAt, zonedDayStart(q.from, ctx.business.timezone)));
  if (q.to) conds.push(lt(shifts.openedAt, zonedDayStart(addDays(q.to, 1), ctx.business.timezone)));
  if (q.q) conds.push(sql`(${shifts.number} LIKE ${`%${q.q}%`} OR ${users.name} LIKE ${`%${q.q}%`})`);
  const where = and(...conds);
  const [rows, [count]] = await Promise.all([
    shiftSelect(ctx).where(where).orderBy(desc(shifts.openedAt)).limit(limit).offset(offset),
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(shifts)
      .leftJoin(users, eq(users.id, shifts.userId))
      .where(where),
  ]);
  return c.json(paged(await computeShifts(ctx, rows), Number(count?.n ?? 0), q));
});

app.get("/current", vQuery(z.object({ locationId: z.string().optional() })), async (c) => {
  const ctx = c.get("ctx");
  const row = await getOpenShift(ctx, c.req.valid("query").locationId || null);
  return c.json({ shift: row ? await computeShift(ctx, row) : null });
});

app.post("/open", requirePerm("registers.use"), vJson(shiftOpenSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const location = await getLocation(ctx, input.locationId);
  const existing = await getOpenShift(ctx);
  if (existing) throw badRequest(`You already have an open shift (${existing.number}). Close it first.`);
  const { shift } = await reserveNumbers(ctx, { shift: 1 });
  const id = newId();
  const tx = new Tx(ctx);
  tx.add(
    ctx.db.insert(shifts).values({
      id,
      businessId: ctx.businessId,
      number: shift[0]!,
      locationId: location.id,
      userId: ctx.userId,
      status: "open",
      openedAt: ctx.now,
      openingFloat: input.openingFloat,
      note: input.note ?? null,
    }) as unknown as Stmt,
  );
  tx.audit("shift.open", `Opened shift ${shift[0]} at ${location.name}`, "shift", id, { openingFloat: input.openingFloat });
  await tx.commit();
  return c.json(await computeShift(ctx, await getShiftRow(ctx, id)), 201);
});

app.get("/:id", async (c) => {
  const ctx = c.get("ctx");
  const row = await getShiftRow(ctx, c.req.param("id"));
  assertCanSee(ctx, row);
  return c.json(await getShiftReport(ctx, row.s.id));
});

app.post("/:id/movements", vJson(cashMovementSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const row = await getShiftRow(ctx, c.req.param("id"));
  assertCanSee(ctx, row);
  if (row.s.status !== "open") throw badRequest("This shift is closed");
  const sys = await ctx.accounts();
  let counterId = sys.bank;
  if (input.accountId) {
    const [acc] = await ctx.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.businessId, ctx.businessId)));
    if (!acc || !acc.isActive) throw badRequest("Choose an active account");
    if (acc.id === sys.cash) throw badRequest("Choose an account other than Cash on Hand");
    counterId = acc.id;
  }
  if (input.type === "pay_out") {
    const current = await computeShift(ctx, row);
    if (input.amount > current.expectedCash) throw badRequest("Pay-out exceeds the cash expected in the drawer");
  }
  const id = newId();
  const tx = new Tx(ctx);
  tx.add(
    ctx.db.insert(cashMovements).values({
      id,
      businessId: ctx.businessId,
      shiftId: row.s.id,
      type: input.type,
      amount: input.amount,
      accountId: counterId,
      reason: input.reason,
      userId: ctx.userId,
      createdAt: ctx.now,
    }) as unknown as Stmt,
  );
  const label = input.type === "pay_in" ? "Cash pay-in" : "Cash pay-out";
  tx.journal({
    date: ctx.today,
    memo: `${label} (${row.s.number}): ${input.reason}`,
    sourceType: "cash_movement",
    sourceId: id,
    sourceNumber: row.s.number,
    locationId: row.s.locationId,
    lines:
      input.type === "pay_in"
        ? [
            { accountId: sys.cash, debit: input.amount },
            { accountId: counterId, credit: input.amount },
          ]
        : [
            { accountId: counterId, debit: input.amount },
            { accountId: sys.cash, credit: input.amount },
          ],
  });
  tx.audit(`shift.${input.type}`, `${label} of ${input.amount} on ${row.s.number}: ${input.reason}`, "shift", row.s.id);
  await tx.commit();
  const [m] = await ctx.db
    .select({ m: cashMovements, accountName: accounts.name, userName: users.name })
    .from(cashMovements)
    .leftJoin(accounts, eq(accounts.id, cashMovements.accountId))
    .leftJoin(users, eq(users.id, cashMovements.userId))
    .where(eq(cashMovements.id, id));
  return c.json(mapCashMovement(m!), 201);
});

app.post("/:id/close", vJson(shiftCloseSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const row = await getShiftRow(ctx, c.req.param("id"));
  if (row.s.userId !== ctx.userId && !ctx.can("registers.viewAll")) throw forbidden("Only the cashier or a manager can close this shift");
  if (row.s.status !== "open") throw badRequest("This shift is already closed");
  const current = await computeShift(ctx, row);
  const expected = current.expectedCash;
  const difference = input.countedCash - expected;
  const sys = await ctx.accounts();
  const tx = new Tx(ctx);
  tx.add(
    ctx.db
      .update(shifts)
      .set({
        status: "closed",
        closedAt: ctx.now,
        expectedCash: expected,
        countedCash: input.countedCash,
        difference,
        denominations: input.denominations ?? null,
        closingNote: input.note ?? null,
        closedBy: ctx.userId,
      })
      .where(eq(shifts.id, row.s.id)) as unknown as Stmt,
  );
  if (difference !== 0) {
    tx.journal({
      date: ctx.today,
      memo: `Cash ${difference > 0 ? "over" : "short"} on shift ${row.s.number}`,
      sourceType: "shift",
      sourceId: row.s.id,
      sourceNumber: row.s.number,
      locationId: row.s.locationId,
      lines: [
        { accountId: sys.cash, debit: difference },
        { accountId: sys.cash_over_short, credit: difference },
      ],
    });
  }
  tx.audit("shift.close", `Closed shift ${row.s.number} (difference ${difference})`, "shift", row.s.id, {
    expected,
    counted: input.countedCash,
  });
  await tx.commit();
  return c.json(await getShiftReport(ctx, row.s.id));
});

export default app;
