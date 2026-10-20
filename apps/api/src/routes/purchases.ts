import { Hono } from "hono";
import {
  purchaseListQuerySchema,
  purchasePaymentSchema,
  purchaseReceiveSchema,
  purchaseSchema,
} from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson, vQuery } from "../lib/validate";
import {
  addPurchasePayments,
  cancelPurchase,
  createPurchase,
  receivePurchase,
  updatePurchase,
} from "../services/purchases";
import { getPurchaseDto, listPurchases } from "../services/purchases-read";

const app = new Hono<AppEnv>();
app.use("*", requirePerm("purchases.view"));

app.get("/", vQuery(purchaseListQuerySchema), async (c) => c.json(await listPurchases(c.get("ctx"), c.req.valid("query"))));

app.get("/:id", async (c) => c.json(await getPurchaseDto(c.get("ctx"), c.req.param("id"))));

app.post("/", vJson(purchaseSchema), async (c) => c.json(await createPurchase(c.get("ctx"), c.req.valid("json")), 201));

app.put("/:id", vJson(purchaseSchema), async (c) =>
  c.json(await updatePurchase(c.get("ctx"), c.req.param("id"), c.req.valid("json"))),
);

app.post("/:id/receive", vJson(purchaseReceiveSchema), async (c) =>
  c.json(await receivePurchase(c.get("ctx"), c.req.param("id"), c.req.valid("json"))),
);

app.post("/:id/cancel", async (c) => c.json(await cancelPurchase(c.get("ctx"), c.req.param("id"))));

app.post("/:id/payments", vJson(purchasePaymentSchema), async (c) =>
  c.json(await addPurchasePayments(c.get("ctx"), c.req.param("id"), c.req.valid("json"))),
);

export default app;
