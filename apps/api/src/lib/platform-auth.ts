import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { createDb, type DB } from "../db/client";
import { platformAdmins, platformSessions } from "../db/schema";
import type { AppEnv } from "../env";
import { newToken, sha256, hashPassword, verifyPassword } from "./crypto";
import { unauthorized } from "./errors";
import { newId } from "./ids";

export const ADMIN_COOKIE = "sb_admin_session";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminRow = typeof platformAdmins.$inferSelect;
export type AdminEnv = AppEnv & { Variables: AppEnv["Variables"] & { admin: AdminRow } };

const isSecure = (c: Context) => new URL(c.req.url).protocol === "https:";

function readToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return getCookie(c, ADMIN_COOKIE) ?? null;
}

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Verifies credentials; on first use the env-configured bootstrap admin is created. */
export async function loginAdmin(db: DB, env: AppEnv["Bindings"], email: string, password: string): Promise<AdminRow> {
  const e = email.toLowerCase();
  let [admin] = await db.select().from(platformAdmins).where(eq(platformAdmins.email, e));
  if (
    !admin &&
    env.PLATFORM_ADMIN_EMAIL &&
    env.PLATFORM_ADMIN_PASSWORD &&
    e === env.PLATFORM_ADMIN_EMAIL.toLowerCase() &&
    same(password, env.PLATFORM_ADMIN_PASSWORD)
  ) {
    const row = {
      id: newId(),
      name: "Platform admin",
      email: e,
      passwordHash: await hashPassword(password),
      isActive: true,
      lastLoginAt: null,
      createdAt: Date.now(),
    };
    await db.insert(platformAdmins).values(row);
    admin = row;
  }
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) throw unauthorized("Incorrect email or password");
  if (!admin.isActive) throw unauthorized("This admin account is deactivated");
  await db.update(platformAdmins).set({ lastLoginAt: Date.now() }).where(eq(platformAdmins.id, admin.id));
  return admin;
}

export async function createAdminSession(c: Context<any>, adminId: string) {
  const token = newToken();
  const now = Date.now();
  await createDb(c.env.DB).insert(platformSessions).values({ id: await sha256(token), adminId, expiresAt: now + TTL_MS, createdAt: now });
  setCookie(c, ADMIN_COOKIE, token, { httpOnly: true, secure: isSecure(c), sameSite: "Lax", path: "/", maxAge: TTL_MS / 1000 });
  return token;
}

export async function destroyAdminSession(c: Context<any>) {
  const token = readToken(c);
  if (token) await createDb(c.env.DB).delete(platformSessions).where(eq(platformSessions.id, await sha256(token)));
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
}

export const requireAdmin = createMiddleware<AdminEnv>(async (c, next) => {
  const token = readToken(c);
  if (!token) throw unauthorized();
  const db = createDb(c.env.DB);
  const [row] = await db
    .select({ session: platformSessions, admin: platformAdmins })
    .from(platformSessions)
    .innerJoin(platformAdmins, eq(platformAdmins.id, platformSessions.adminId))
    .where(eq(platformSessions.id, await sha256(token)));
  if (!row || row.session.expiresAt < Date.now() || !row.admin.isActive) throw unauthorized("Your session has expired, please sign in again");
  c.set("admin", row.admin);
  await next();
});
