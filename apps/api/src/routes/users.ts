import { assertWithinPlan } from "../services/billing";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { userCreateSchema, userUpdateSchema } from "@shopbooks/shared";
import { sessions, users } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { hashPassword } from "../lib/crypto";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { vJson } from "../lib/validate";
import { mapUser } from "../services/me";

const app = new Hono<AppEnv>();

/** Lightweight list for pickers (salesperson etc.) — available to every signed-in user. */
app.get("/directory", async (c) => {
  const ctx = c.get("ctx");
  const rows = await ctx.db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.businessId, ctx.businessId), eq(users.isActive, true)))
    .orderBy(asc(users.name));
  return c.json(rows);
});

app.use("*", requirePerm("users.manage"));

app.get("/", async (c) => {
  const ctx = c.get("ctx");
  const rows = await ctx.db.select().from(users).where(eq(users.businessId, ctx.businessId)).orderBy(asc(users.createdAt));
  return c.json(rows.map(mapUser));
});

app.post("/", vJson(userCreateSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  if (input.role === "owner" && ctx.role !== "owner") throw forbidden("Only an owner can add another owner");
  await assertWithinPlan(ctx, "users");
  const email = input.email.toLowerCase();
  const [exists] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) throw conflict("A user with this email already exists");
  const [row] = await ctx.db
    .insert(users)
    .values({
      id: newId(),
      businessId: ctx.businessId,
      name: input.name,
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      defaultLocationId: input.defaultLocationId ?? null,
      createdAt: Date.now(),
    })
    .returning();
  return c.json(mapUser(row!), 201);
});

app.put("/:id", vJson(userUpdateSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const [user] = await ctx.db.select().from(users).where(and(eq(users.id, id), eq(users.businessId, ctx.businessId)));
  if (!user) throw notFound("User");
  if ((user.role === "owner" || input.role === "owner") && ctx.role !== "owner") {
    throw forbidden("Only an owner can change an owner's account");
  }
  if (id === ctx.userId && (input.isActive === false || (input.role && input.role !== user.role))) {
    throw badRequest("You can't deactivate yourself or change your own role");
  }
  if (user.role === "owner" && input.role && input.role !== "owner") {
    const [{ n } = { n: 0 }] = await ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.businessId, ctx.businessId), eq(users.role, "owner"), eq(users.isActive, true)));
    if (n <= 1) throw badRequest("A business needs at least one owner");
  }
  const [row] = await ctx.db
    .update(users)
    .set({
      name: input.name ?? undefined,
      role: input.role ?? undefined,
      defaultLocationId: input.defaultLocationId === undefined ? undefined : input.defaultLocationId,
      isActive: input.isActive ?? undefined,
      passwordHash: input.password ? await hashPassword(input.password) : undefined,
    })
    .where(eq(users.id, id))
    .returning();
  if (input.isActive === false || input.password) await ctx.db.delete(sessions).where(eq(sessions.userId, id));
  return c.json(mapUser(row!));
});

app.delete("/:id", async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  if (id === ctx.userId) throw badRequest("You can't deactivate yourself");
  const [user] = await ctx.db.select().from(users).where(and(eq(users.id, id), eq(users.businessId, ctx.businessId)));
  if (!user) throw notFound("User");
  if (user.role === "owner" && ctx.role !== "owner") throw forbidden();
  await ctx.db.update(users).set({ isActive: false }).where(eq(users.id, id));
  await ctx.db.delete(sessions).where(eq(sessions.userId, id));
  return c.json({ ok: true as const });
});

export default app;
