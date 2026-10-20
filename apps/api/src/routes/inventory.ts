import { Hono } from "hono";
import { z } from "zod";
import {
  listQuerySchema,
  movementQuerySchema,
  stockAdjustmentSchema,
  stockQuerySchema,
  stockTransferSchema,
} from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson, vQuery } from "../lib/validate";
import { createAdjustment, createTransfer } from "../services/inventory";
import {
  getAdjustmentDto,
  getTransferDto,
  listAdjustments,
  listMovements,
  listStock,
  listTransfers,
} from "../services/inventory-read";

const app = new Hono<AppEnv>();
const view = requirePerm("inventory.view");
const manage = requirePerm("inventory.manage");

app.get("/stock", view, vQuery(stockQuerySchema), async (c) => {
  return c.json(await listStock(c.get("ctx"), c.req.valid("query")));
});

app.get("/movements", view, vQuery(movementQuerySchema), async (c) => {
  return c.json(await listMovements(c.get("ctx"), c.req.valid("query")));
});

// ---------------------------------------------------------------- adjustments

const adjustmentListQuery = listQuerySchema.extend({
  locationId: z.string().optional(),
  reason: z.string().optional(),
});

app.get("/adjustments", view, vQuery(adjustmentListQuery), async (c) => {
  return c.json(await listAdjustments(c.get("ctx"), c.req.valid("query")));
});

app.get("/adjustments/:id", view, async (c) => c.json(await getAdjustmentDto(c.get("ctx"), c.req.param("id"))));

app.post("/adjustments", manage, vJson(stockAdjustmentSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = await createAdjustment(ctx, c.req.valid("json"));
  return c.json(await getAdjustmentDto(ctx, id), 201);
});

// ---------------------------------------------------------------- transfers

const transferListQuery = listQuerySchema.extend({ locationId: z.string().optional() });

app.get("/transfers", view, vQuery(transferListQuery), async (c) => {
  return c.json(await listTransfers(c.get("ctx"), c.req.valid("query")));
});

app.get("/transfers/:id", view, async (c) => c.json(await getTransferDto(c.get("ctx"), c.req.param("id"))));

app.post("/transfers", manage, vJson(stockTransferSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = await createTransfer(ctx, c.req.valid("json"));
  return c.json(await getTransferDto(ctx, id), 201);
});

export default app;
