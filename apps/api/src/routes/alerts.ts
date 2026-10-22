import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../lib/auth";
import { dailyAlerts } from "../services/alerts";

const app = new Hono<AppEnv>();

app.get("/", requireAuth, async (c) => c.json(await dailyAlerts(c.get("ctx"))));

export default app;
