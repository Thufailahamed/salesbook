import { Hono } from "hono";
import { z } from "zod";
import { productListQuerySchema, productSchema, sellableSearchQuerySchema } from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson, vQuery } from "../lib/validate";
import { getProductDto, listProducts, lookupSellable, searchSellable } from "../services/products-read";
import { createProduct, deleteProduct, updateProduct } from "../services/products-write";

const app = new Hono<AppEnv>();
const view = requirePerm("products.view");
const manage = requirePerm("products.manage");

app.get("/", view, vQuery(productListQuerySchema), async (c) => {
  return c.json(await listProducts(c.get("ctx"), c.req.valid("query")));
});

app.get("/sellable", requirePerm("products.view", "pos.sell"), vQuery(sellableSearchQuerySchema), async (c) => {
  const q = c.req.valid("query");
  // z.coerce.boolean() treats "false" as true, so read the raw flag.
  const raw = c.req.query("includeServices");
  const includeServices = raw === undefined ? true : !["false", "0", "no"].includes(raw.toLowerCase());
  return c.json(await searchSellable(c.get("ctx"), { ...q, includeServices }));
});

app.get(
  "/lookup",
  requirePerm("products.view", "pos.sell"),
  vQuery(z.object({ code: z.string().trim().min(1), locationId: z.string().optional() })),
  async (c) => {
    const { code, locationId } = c.req.valid("query");
    return c.json(await lookupSellable(c.get("ctx"), code, locationId));
  },
);

app.get("/:id", view, async (c) => c.json(await getProductDto(c.get("ctx"), c.req.param("id"))));

app.post("/", manage, vJson(productSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = await createProduct(ctx, c.req.valid("json"));
  return c.json(await getProductDto(ctx, id), 201);
});

app.put("/:id", manage, vJson(productSchema), async (c) => {
  const ctx = c.get("ctx");
  const id = c.req.param("id");
  await updateProduct(ctx, id, c.req.valid("json"));
  return c.json(await getProductDto(ctx, id));
});

app.delete("/:id", manage, async (c) => {
  const result = await deleteProduct(c.get("ctx"), c.req.param("id"));
  return c.json({ ok: true as const, result });
});

export default app;
