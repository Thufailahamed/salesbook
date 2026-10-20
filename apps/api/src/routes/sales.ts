import { Hono } from "hono";
import { z } from "zod";
import { checkoutSchema, invoiceListQuerySchema, invoicePaymentSchema, voidSchema } from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { badRequest } from "../lib/errors";
import { vJson, vQuery } from "../lib/validate";
import { addInvoicePayment, checkout, voidInvoice } from "../services/sales";
import { findInvoiceByNumber, getInvoiceDto, getReturnable, listInvoices } from "../services/sales-read";

const app = new Hono<AppEnv>();

app.get("/", requirePerm("sales.view"), vQuery(invoiceListQuerySchema), async (c) => {
  return c.json(await listInvoices(c.get("ctx"), c.req.valid("query")));
});

app.get("/lookup", requirePerm("sales.view"), vQuery(z.object({ number: z.string().min(1) })), async (c) => {
  return c.json(await findInvoiceByNumber(c.get("ctx"), c.req.valid("query").number));
});

app.post("/checkout", vJson(checkoutSchema), async (c) => {
  const result = await checkout(c.get("ctx"), c.req.valid("json"));
  return c.json(result, 201);
});

app.get("/:id", requirePerm("sales.view"), async (c) => c.json(await getInvoiceDto(c.get("ctx"), c.req.param("id"))));

app.get("/:id/returnable", requirePerm("sales.view"), async (c) =>
  c.json(await getReturnable(c.get("ctx"), c.req.param("id"))),
);

app.post("/:id/payments", vJson(invoicePaymentSchema), async (c) => {
  return c.json(await addInvoicePayment(c.get("ctx"), c.req.param("id"), c.req.valid("json")));
});

app.post("/:id/void", vJson(voidSchema), async (c) => {
  const { reason } = c.req.valid("json");
  if (!reason.trim()) throw badRequest("Give a reason for voiding");
  return c.json(await voidInvoice(c.get("ctx"), c.req.param("id"), reason));
});

export default app;
