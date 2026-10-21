import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import {
  loginSchema,
  planSchema,
  platformAdminCreateSchema,
  platformOrderListQuerySchema,
  platformSettingsSchema,
  platformShopListQuerySchema,
  platformShopUpdateSchema,
  platformUserUpdateSchema,
} from "@shopbooks/shared";
import { createDb } from "../db/client";
import { platformAdmins, platformSessions } from "../db/schema";
import { badRequest, conflict, notFound } from "../lib/errors";
import { hashPassword } from "../lib/crypto";
import { newId } from "../lib/ids";
import {
  ADMIN_COOKIE,
  createAdminSession,
  destroyAdminSession,
  loginAdmin,
  requireAdmin,
  type AdminEnv,
} from "../lib/platform-auth";
import { vJson, vQuery } from "../lib/validate";
import { getPlatformSettings, savePlatformSettings } from "../services/billing";
import {
  createPlan,
  deletePlan,
  listOrders,
  listPlans,
  listShops,
  mapAdmin,
  platformStats,
  shopDetail,
  updatePlan,
  updateShop,
  updateShopUser,
} from "../services/platform";

void ADMIN_COOKIE;
const app = new Hono<AdminEnv>();
const origin = (url: string) => new URL(url).origin;

// ---- auth (public)
app.post("/auth/login", vJson(loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const admin = await loginAdmin(createDb(c.env.DB), c.env, email, password);
  const token = await createAdminSession(c, admin.id);
  return c.json({ admin: mapAdmin(admin), token });
});
app.post("/auth/logout", async (c) => {
  await destroyAdminSession(c);
  return c.json({ ok: true as const });
});

// ---- everything below needs a platform admin
app.use("*", requireAdmin);
app.get("/auth/me", (c) => c.json({ admin: mapAdmin(c.get("admin")) }));

app.get("/stats", async (c) => c.json(await platformStats(createDb(c.env.DB))));

app.get("/shops", vQuery(platformShopListQuerySchema), async (c) => c.json(await listShops(createDb(c.env.DB), c.req.valid("query"))));
app.get("/shops/:id", async (c) => c.json(await shopDetail(createDb(c.env.DB), c.req.param("id"))));
app.patch("/shops/:id", vJson(platformShopUpdateSchema), async (c) =>
  c.json(await updateShop(createDb(c.env.DB), c.req.param("id"), c.req.valid("json"))),
);
app.patch("/users/:id", vJson(platformUserUpdateSchema), async (c) =>
  c.json(await updateShopUser(createDb(c.env.DB), c.req.param("id"), c.req.valid("json"))),
);

app.get("/orders", vQuery(platformOrderListQuerySchema), async (c) => c.json(await listOrders(createDb(c.env.DB), c.req.valid("query"))));

app.get("/plans", async (c) => c.json(await listPlans(createDb(c.env.DB))));
app.post("/plans", vJson(planSchema), async (c) => c.json(await createPlan(createDb(c.env.DB), c.req.valid("json")), 201));
app.put("/plans/:id", vJson(planSchema), async (c) => c.json(await updatePlan(createDb(c.env.DB), c.req.param("id"), c.req.valid("json"))));
app.delete("/plans/:id", async (c) => c.json(await deletePlan(createDb(c.env.DB), c.req.param("id"))));

app.get("/settings", async (c) => c.json(await getPlatformSettings(createDb(c.env.DB), origin(c.req.url))));
app.put("/settings", vJson(platformSettingsSchema), async (c) =>
  c.json(await savePlatformSettings(createDb(c.env.DB), c.req.valid("json"), origin(c.req.url))),
);

app.get("/admins", async (c) => {
  const rows = await createDb(c.env.DB).select().from(platformAdmins);
  return c.json(rows.map(mapAdmin));
});
app.post("/admins", vJson(platformAdminCreateSchema), async (c) => {
  const db = createDb(c.env.DB);
  const input = c.req.valid("json");
  const email = input.email.toLowerCase();
  const [exists] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(eq(platformAdmins.email, email));
  if (exists) throw conflict("An admin with this email already exists");
  const row = { id: newId(), name: input.name, email, passwordHash: await hashPassword(input.password), isActive: true, lastLoginAt: null, createdAt: Date.now() };
  await db.insert(platformAdmins).values(row);
  return c.json(mapAdmin(row), 201);
});
app.patch("/admins/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { isActive?: boolean };
  if (id === c.get("admin").id) throw badRequest("You can't deactivate your own account");
  const [a] = await db.select().from(platformAdmins).where(eq(platformAdmins.id, id));
  if (!a) throw notFound("Admin");
  if (typeof body.isActive !== "boolean") throw badRequest("isActive is required");
  if (!body.isActive) {
    const others = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(and(eq(platformAdmins.isActive, true), ne(platformAdmins.id, id)));
    if (others.length === 0) throw badRequest("At least one active admin is required");
    await db.delete(platformSessions).where(eq(platformSessions.adminId, id));
  }
  await db.update(platformAdmins).set({ isActive: body.isActive }).where(eq(platformAdmins.id, id));
  return c.json(mapAdmin({ ...a, isActive: body.isActive }));
});

export default app;
