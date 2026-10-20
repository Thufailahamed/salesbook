import { Hono } from "hono";
import { z } from "zod";
import { listQuerySchema, purchaseReturnSchema } from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson, vQuery } from "../lib/validate";
import { createPurchaseReturn } from "../services/purchases";
import { getPurchaseReturnDto, listPurchaseReturns } from "../services/purchases-read";

const app = new Hono<AppEnv>();
app.use("*", requirePerm("purchases.view"));

const query = listQuerySchema.extend({ supplierId: z.string().optional(), purchaseId: z.string().optional() });

app.get("/", vQuery(query), async (c) => c.json(await listPurchaseReturns(c.get("ctx"), c.req.valid("query"))));

app.get("/:id", async (c) => c.json(await getPurchaseReturnDto(c.get("ctx"), c.req.param("id"))));

app.post("/", vJson(purchaseReturnSchema), async (c) =>
  c.json(await createPurchaseReturn(c.get("ctx"), c.req.valid("json")), 201),
);

export default app;
