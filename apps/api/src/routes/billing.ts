import { Hono } from "hono";
import { renewSchema } from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson } from "../lib/validate";
import { createRenewal, shopBilling } from "../services/billing";

/** A shop's own subscription (reachable even when the subscription has expired). */
const app = new Hono<AppEnv>();

app.get("/", async (c) => c.json(await shopBilling(c.get("ctx"))));
app.post("/renew", requirePerm("settings.manage"), vJson(renewSchema), async (c) =>
  c.json(await createRenewal(c.get("ctx"), c.req.valid("json"), new URL(c.req.url).origin), 201),
);

export default app;
