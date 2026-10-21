import { Hono } from "hono";
import { createCheckoutSchema, gatewaySettingsSchema } from "@shopbooks/shared";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson } from "../lib/validate";
import { createInvoiceCheckout, gatewayEnabled, getGatewaySettings, handleWebhook, saveGatewaySettings } from "../services/gateway";

/** Authenticated: settings + checkout creation. */
export const gateway = new Hono<AppEnv>();
const origin = (url: string) => new URL(url).origin;

gateway.get("/settings", requirePerm("settings.manage"), async (c) =>
  c.json(await getGatewaySettings(c.get("ctx"), origin(c.req.url))),
);
gateway.put("/settings", requirePerm("settings.manage"), vJson(gatewaySettingsSchema), async (c) =>
  c.json(await saveGatewaySettings(c.get("ctx"), c.req.valid("json"), origin(c.req.url))),
);
/** Lightweight flag for the UI to show "Pay online". */
gateway.get("/status", async (c) => c.json({ enabled: await gatewayEnabled(c.get("ctx")) }));
gateway.post("/checkouts", vJson(createCheckoutSchema), async (c) =>
  c.json(await createInvoiceCheckout(c.get("ctx"), c.req.valid("json"), origin(c.req.url))),
);

/** Public: payments.lk webhook (authenticated by signature). */
export const gatewayWebhook = new Hono<AppEnv>();
gatewayWebhook.post("/webhook/:businessId", async (c) => {
  const raw = await c.req.text();
  const result = await handleWebhook(
    createDb(c.env.DB),
    c.env,
    c.req.param("businessId"),
    raw,
    c.req.header("payments-signature"),
  );
  return c.json({ ok: true, result });
});
