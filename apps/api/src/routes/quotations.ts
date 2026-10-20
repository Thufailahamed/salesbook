import { Hono } from "hono";
import { z } from "zod";
import { QUOTATION_STATUSES, listQuerySchema, quotationSchema, quotationStatusSchema } from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson, vQuery } from "../lib/validate";
import {
  createQuotation,
  deleteQuotation,
  getQuotationDto,
  listQuotations,
  setQuotationStatus,
  updateQuotation,
} from "../services/quotations";

const app = new Hono<AppEnv>();
const view = requirePerm("sales.view");
const manage = requirePerm("quotations.manage");

const quotationListQuery = listQuerySchema.extend({
  status: z.enum(QUOTATION_STATUSES).optional(),
  customerId: z.string().optional(),
  locationId: z.string().optional(),
});

app.get("/", view, vQuery(quotationListQuery), async (c) => {
  return c.json(await listQuotations(c.get("ctx"), c.req.valid("query")));
});

app.post("/", manage, vJson(quotationSchema), async (c) => {
  return c.json(await createQuotation(c.get("ctx"), c.req.valid("json")), 201);
});

app.get("/:id", view, async (c) => c.json(await getQuotationDto(c.get("ctx"), c.req.param("id"))));

app.put("/:id", manage, vJson(quotationSchema), async (c) => {
  return c.json(await updateQuotation(c.get("ctx"), c.req.param("id"), c.req.valid("json")));
});

app.patch("/:id/status", manage, vJson(quotationStatusSchema), async (c) => {
  return c.json(await setQuotationStatus(c.get("ctx"), c.req.param("id"), c.req.valid("json").status));
});

app.delete("/:id", manage, async (c) => {
  await deleteQuotation(c.get("ctx"), c.req.param("id"));
  return c.json({ ok: true as const });
});

export default app;
