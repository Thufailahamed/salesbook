import { Hono } from "hono";
import { z } from "zod";
import { messageComposeSchema, messageSendSchema, messageSettingsSchema, remindOverdueSchema } from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { clean } from "../lib/http";
import { vJson, vQuery } from "../lib/validate";
import {
  getMessageSettings,
  getMessageStatus,
  listMessages,
  overdueCustomers,
  previewMessage,
  remindOverdueBySms,
  saveMessageSettings,
  sendMessage,
} from "../services/messaging";

const app = new Hono<AppEnv>();
const origin = (url: string) => new URL(url).origin;

app.get("/settings", requirePerm("settings.manage"), async (c) => c.json(await getMessageSettings(c.get("ctx"))));
app.put("/settings", requirePerm("settings.manage"), vJson(messageSettingsSchema), async (c) =>
  c.json(await saveMessageSettings(c.get("ctx"), clean(c.req.valid("json")))),
);

/** Which channels the UI can offer (SMS only when the shop has set it up). */
app.get("/status", requirePerm("messaging.send"), async (c) => c.json(await getMessageStatus(c.get("ctx"))));

app.get("/overdue", requirePerm("messaging.send"), async (c) => c.json(await overdueCustomers(c.get("ctx"))));

app.post("/preview", requirePerm("messaging.send"), vJson(messageComposeSchema), async (c) =>
  c.json(await previewMessage(c.get("ctx"), c.req.valid("json"), origin(c.req.url))),
);
app.post("/send", requirePerm("messaging.send"), vJson(messageSendSchema), async (c) =>
  c.json(await sendMessage(c.get("ctx"), c.req.valid("json"), origin(c.req.url)), 201),
);
app.post("/remind-overdue", requirePerm("messaging.bulk"), vJson(remindOverdueSchema), async (c) =>
  c.json(await remindOverdueBySms(c.get("ctx"), c.req.valid("json"), origin(c.req.url))),
);

app.get(
  "/log",
  requirePerm("messaging.send"),
  vQuery(z.object({ customerId: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) })),
  async (c) => c.json(await listMessages(c.get("ctx"), c.req.valid("query"))),
);

export default app;
