import { Hono } from "hono";
import { planPurchaseSchema } from "@shopbooks/shared";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { vJson } from "../lib/validate";
import { createPurchase, handlePlatformWebhook, publicOrderStatus, publicPlans } from "../services/billing";

/** Unauthenticated: pricing, buying a plan, order status and the payments.lk webhook. */
const app = new Hono<AppEnv>();

app.get("/plans", async (c) => c.json(await publicPlans(createDb(c.env.DB))));
app.post("/purchase", vJson(planPurchaseSchema), async (c) =>
  c.json(await createPurchase(createDb(c.env.DB), c.env, c.req.valid("json"), new URL(c.req.url).origin), 201),
);
app.get("/orders/:id", async (c) => c.json(await publicOrderStatus(createDb(c.env.DB), c.req.param("id"))));
app.post("/webhook", async (c) => {
  const raw = await c.req.text();
  const result = await handlePlatformWebhook(createDb(c.env.DB), c.env, raw, c.req.header("payments-signature"));
  return c.json({ ok: true, result });
});

export default app;
