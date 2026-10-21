import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Permission, Role } from "@shopbooks/shared";
import { createDb } from "../db/client";
import { businesses, sessions, users } from "../db/schema";
import type { AppEnv } from "../env";
import { createCtx } from "./context";
import { newToken, sha256 } from "./crypto";
import { ApiError, forbidden, unauthorized } from "./errors";

export const SESSION_COOKIE = "sb_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isSecure(c: Context) {
  return new URL(c.req.url).protocol === "https:";
}

export function clientIp(c: Context): string | null {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null;
}

export async function createSession(c: Context<AppEnv>, userId: string, businessId: string) {
  const token = newToken();
  const db = createDb(c.env.DB);
  const now = Date.now();
  await db.insert(sessions).values({
    id: await sha256(token),
    userId,
    businessId,
    expiresAt: now + SESSION_TTL_MS,
    userAgent: c.req.header("user-agent")?.slice(0, 250) ?? null,
    ip: clientIp(c),
    createdAt: now,
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

function readToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return getCookie(c, SESSION_COOKIE) ?? null;
}

export async function destroySession(c: Context<AppEnv>) {
  const token = readToken(c);
  if (token) {
    const db = createDb(c.env.DB);
    await db.delete(sessions).where(eq(sessions.id, await sha256(token)));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Authenticates the request and builds the per-request Ctx. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readToken(c);
  if (!token) throw unauthorized();
  const db = createDb(c.env.DB);
  const sid = await sha256(token);
  const [row] = await db
    .select({ session: sessions, user: users, business: businesses })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(businesses, eq(businesses.id, users.businessId))
    .where(eq(sessions.id, sid))
    .limit(1);
  const now = Date.now();
  if (!row || row.session.expiresAt < now) throw unauthorized("Your session has expired, please sign in again");
  if (!row.user.isActive) throw unauthorized("Your account has been deactivated");

  // Subscription gate: suspended shops are locked out; expired ones may only reach auth + billing.
  const path = c.req.path;
  if (row.business.status === "suspended" && !path.endsWith("/auth/logout")) {
    throw new ApiError(403, "shop_suspended", "This shop has been suspended. Contact support.");
  }
  const ends = row.business.subscriptionEndsAt;
  if (ends != null && ends < now && !path.includes("/auth/") && !path.includes("/billing")) {
    throw new ApiError(402, "subscription_expired", "Your subscription has expired. Renew to continue.");
  }

  // Sliding expiry: extend sessions that are past half their life.
  if (row.session.expiresAt - now < SESSION_TTL_MS / 2) {
    c.executionCtx.waitUntil(
      db.update(sessions).set({ expiresAt: now + SESSION_TTL_MS }).where(eq(sessions.id, sid)).then(() => undefined),
    );
  }

  c.set(
    "ctx",
    createCtx({
      db,
      env: c.env,
      business: row.business,
      userId: row.user.id,
      userName: row.user.name,
      role: row.user.role as Role,
      ip: clientIp(c),
    }),
  );
  await next();
});

export const requirePerm = (...perms: Permission[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const ctx = c.get("ctx");
    if (!perms.some((p) => ctx.can(p))) throw forbidden();
    await next();
  });
