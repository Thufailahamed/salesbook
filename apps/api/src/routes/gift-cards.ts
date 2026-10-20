import { Hono } from "hono";
import { z } from "zod";
import { GIFT_CARD_STATUSES, giftCardSchema, giftCardUpdateSchema, listQuerySchema } from "@shopbooks/shared";
import type { AppEnv } from "../env";
import { requirePerm } from "../lib/auth";
import { vJson, vQuery } from "../lib/validate";
import {
  getGiftCardDto,
  issueGiftCard,
  listGiftCards,
  lookupGiftCard,
  updateGiftCard,
} from "../services/gift-cards";

const app = new Hono<AppEnv>();
const view = requirePerm("giftcards.view");
const manage = requirePerm("giftcards.manage");

const giftCardListQuery = listQuerySchema.extend({
  status: z.enum(GIFT_CARD_STATUSES).optional(),
  customerId: z.string().optional(),
});

app.get("/", view, vQuery(giftCardListQuery), async (c) => {
  return c.json(await listGiftCards(c.get("ctx"), c.req.valid("query")));
});

app.get("/lookup", view, vQuery(z.object({ code: z.string().trim().min(1) })), async (c) => {
  return c.json(await lookupGiftCard(c.get("ctx"), c.req.valid("query").code));
});

app.post("/", manage, vJson(giftCardSchema), async (c) => {
  return c.json(await issueGiftCard(c.get("ctx"), c.req.valid("json")), 201);
});

app.get("/:id", view, async (c) => c.json(await getGiftCardDto(c.get("ctx"), c.req.param("id"))));

app.patch("/:id", manage, vJson(giftCardUpdateSchema), async (c) => {
  return c.json(await updateGiftCard(c.get("ctx"), c.req.param("id"), c.req.valid("json")));
});

export default app;
