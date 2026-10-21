import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import {
  changePasswordSchema,
  loginSchema,
  signupSchema,
  updateProfileSchema,
  type AuthResponse,
  type Role,
} from "@shopbooks/shared";
import { createDb } from "../db/client";
import { businesses, locations, sessions, users } from "../db/schema";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { SESSION_COOKIE, clientIp, createSession, destroySession, requireAuth } from "../lib/auth";
import { createCtx } from "../lib/context";
import { hashPassword, sha256, verifyPassword } from "../lib/crypto";
import { ApiError, badRequest, conflict, unauthorized } from "../lib/errors";
import { vJson } from "../lib/validate";
import { buildMe } from "../services/me";
import { businessSubscription, publicPlans } from "../services/billing";
import { createBusiness } from "../services/setup";

const app = new Hono<AppEnv>();

async function authResponse(c: Parameters<typeof createSession>[0], userId: string): Promise<AuthResponse> {
  const db = createDb(c.env.DB);
  const [row] = await db
    .select({ user: users, business: businesses })
    .from(users)
    .innerJoin(businesses, eq(businesses.id, users.businessId))
    .where(eq(users.id, userId));
  if (!row) throw unauthorized();
  if (row.business.status === "suspended") throw new ApiError(403, "shop_suspended", "This shop has been suspended. Contact support.");
  const token = await createSession(c, row.user.id, row.business.id);
  const ctx = createCtx({
    db,
    env: c.env,
    business: row.business,
    userId: row.user.id,
    userName: row.user.name,
    role: row.user.role as Role,
    ip: clientIp(c),
  });
  return { ...(await buildMe(ctx)), token };
}

app.post("/signup", vJson(signupSchema), async (c) => {
  const input = c.req.valid("json");
  const db = createDb(c.env.DB);
  if ((await publicPlans(db)).paymentRequired) {
    throw new ApiError(402, "payment_required", "Choose a plan and pay to create your shop.");
  }
  const email = input.email.toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw conflict("An account with this email already exists. Sign in instead.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw badRequest("Unknown timezone");
  }
  const { userId } = await createBusiness(db, { ...input, email }, await hashPassword(input.password));
  return c.json(await authResponse(c, userId), 201);
});

app.post("/login", vJson(loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized("Incorrect email or password");
  }
  if (!user.isActive) throw unauthorized("Your account has been deactivated. Contact your administrator.");
  await db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, user.id));
  return c.json(await authResponse(c, user.id));
});

app.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true as const });
});

app.get("/me", requireAuth, async (c) => c.json(await buildMe(c.get("ctx"))));

app.put("/profile", requireAuth, vJson(updateProfileSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  if (input.defaultLocationId) {
    const [loc] = await ctx.db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, input.defaultLocationId), eq(locations.businessId, ctx.businessId)));
    if (!loc) throw badRequest("Unknown location");
  }
  await ctx.db
    .update(users)
    .set({ name: input.name, defaultLocationId: input.defaultLocationId ?? null })
    .where(eq(users.id, ctx.userId));
  const me = await buildMe(ctx);
  return c.json(me.user);
});

app.post("/change-password", requireAuth, vJson(changePasswordSchema), async (c) => {
  const ctx = c.get("ctx");
  const { currentPassword, newPassword } = c.req.valid("json");
  const [user] = await ctx.db.select().from(users).where(eq(users.id, ctx.userId));
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw badRequest("Current password is incorrect");
  }
  await ctx.db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, ctx.userId));
  // Sign out every other device.
  const token = c.req.header("authorization")?.slice(7) ?? getCookie(c, SESSION_COOKIE);
  const keep = token ? await sha256(token) : "";
  await ctx.db.delete(sessions).where(and(eq(sessions.userId, ctx.userId), ne(sessions.id, keep)));
  return c.json({ ok: true as const });
});

export default app;
