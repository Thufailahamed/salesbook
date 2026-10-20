import { and, desc, eq, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { heldSaleSchema, type HeldSale } from "@shopbooks/shared";
import { customers, heldSales, users } from "../db/schema";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import type { Ctx } from "../lib/context";
import { notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { vJson, vQuery } from "../lib/validate";
import { getCustomer } from "../services/payments";
import { getLocation } from "../services/sales";

const app = new Hono<AppEnv>();
app.use("*", requirePerm("pos.sell"));

function heldSelect(ctx: Ctx) {
  return ctx.db
    .select({ h: heldSales, customerName: customers.name, userName: users.name })
    .from(heldSales)
    .leftJoin(customers, eq(customers.id, heldSales.customerId))
    .leftJoin(users, eq(users.id, heldSales.userId));
}

type HeldRow = Awaited<ReturnType<ReturnType<typeof heldSelect>["where"]>>[number];

function mapHeld(r: HeldRow): HeldSale {
  return {
    id: r.h.id,
    label: r.h.label,
    locationId: r.h.locationId,
    customerId: r.h.customerId,
    customerName: r.customerName ?? null,
    total: r.h.total,
    itemCount: r.h.itemCount,
    cart: r.h.cart,
    userName: r.userName ?? null,
    createdAt: r.h.createdAt,
  };
}

app.get("/", vQuery(z.object({ locationId: z.string().optional() })), async (c) => {
  const ctx = c.get("ctx");
  const { locationId } = c.req.valid("query");
  const conds: SQL[] = [eq(heldSales.businessId, ctx.businessId)];
  if (locationId) conds.push(eq(heldSales.locationId, locationId));
  const rows = await heldSelect(ctx)
    .where(and(...conds))
    .orderBy(desc(heldSales.createdAt))
    .limit(200);
  return c.json(rows.map(mapHeld));
});

app.post("/", vJson(heldSaleSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  await getLocation(ctx, input.locationId);
  if (input.customerId) await getCustomer(ctx, input.customerId);
  const id = newId();
  await ctx.db.insert(heldSales).values({
    id,
    businessId: ctx.businessId,
    locationId: input.locationId,
    userId: ctx.userId,
    label: input.label?.trim() || null,
    customerId: input.customerId ?? null,
    cart: input.cart ?? null,
    total: input.total,
    itemCount: input.itemCount,
    createdAt: Date.now(),
  });
  const [row] = await heldSelect(ctx).where(eq(heldSales.id, id));
  return c.json(mapHeld(row!), 201);
});

app.delete("/:id", async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  const [existing] = await ctx.db
    .select({ id: heldSales.id })
    .from(heldSales)
    .where(and(eq(heldSales.id, id), eq(heldSales.businessId, ctx.businessId)));
  if (!existing) throw notFound("Held sale");
  await ctx.db.delete(heldSales).where(eq(heldSales.id, id));
  return c.json({ ok: true as const });
});

export default app;
