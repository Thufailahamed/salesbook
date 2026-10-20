import { Hono } from "hono";
import { listQuerySchema, saleReturnSchema } from "@shopbooks/shared";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson, vQuery } from "../lib/validate";
import { checkout, getInvoiceRow } from "../services/sales";
import { getReturnDto, listReturns } from "../services/sales-read";

const app = new Hono<AppEnv>();

const returnListQuery = listQuerySchema.extend({
  customerId: z.string().optional(),
  locationId: z.string().optional(),
  invoiceId: z.string().optional(),
});

app.get("/", requirePerm("sales.view"), vQuery(returnListQuery), async (c) => {
  return c.json(await listReturns(c.get("ctx"), c.req.valid("query")));
});

app.get("/:id", requirePerm("sales.view"), async (c) => c.json(await getReturnDto(c.get("ctx"), c.req.param("id"))));

/** Return items from an invoice (no new sale). Stock goes back to the invoice's location. */
app.post("/", vJson(saleReturnSchema), async (c) => {
  const ctx = c.get("ctx");
  const input = c.req.valid("json");
  const inv = await getInvoiceRow(ctx, input.invoiceId);
  const result = await checkout(ctx, {
    locationId: inv.locationId,
    customerId: inv.customerId,
    date: input.date,
    lines: [],
    payments: [],
    allowCredit: false,
    returnFrom: { invoiceId: inv.id, lines: input.lines, reason: input.reason },
    refund: input.refund ?? null,
  });
  return c.json(result.saleReturn, 201);
});

export default app;
