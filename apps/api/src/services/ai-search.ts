/**
 * AI product search for the POS. Runs only after the normal search finds nothing. The model turns a loose description
 * into likely catalogue words; the server does the lookup, so the model never sees or returns products.
 */
import { z } from "zod";
import type { SellableItem } from "@shopbooks/shared";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { chatJson, productSearchEnabled } from "./ai-gateway";
import { searchSellableByTerms } from "./products-read";

const reply = z.object({ terms: z.array(z.string()).catch([]) });

/** Size words shoppers say, mapped to the letters shown on products. Done here so it doesn't depend on the model. */
const SIZE_ALIASES: Record<string, string[]> = {
  small: ["s"],
  medium: ["m"],
  large: ["l"],
  "x-large": ["xl"],
  xlarge: ["xl"],
  "extra-large": ["xl"],
};

export async function aiProductSearch(ctx: Ctx, env: Env, query: string, locationId?: string): Promise<SellableItem[]> {
  if (!productSearchEnabled(env)) throw badRequest("AI product search is not configured");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const sizes = words.flatMap((w) => SIZE_ALIASES[w] ?? []);
  const parsed = reply.parse(
    await chatJson(
      env,
      env.AI_SEARCH_MODEL!,
      [
        {
          role: "system",
          content: [
            "You turn a shop customer's loose product description into words that might appear in a product catalogue.",
            'Reply with one JSON object only: {"terms": ["..."]}. Give up to 8 short lowercase words.',
            "Include likely product types, colours, materials, and sizes written as they might appear (e.g. medium -> m, medium; extra large -> xl).",
            "Do not invent brand names. Do not add words that were not implied by the description.",
          ].join("\n"),
        },
        { role: "user", content: query },
      ],
      "The AI service could not work out search words for this. Try a shorter description.",
    ),
  );
  // Keep the shopper's own words too, so a literal match still counts.
  return searchSellableByTerms(ctx, { terms: [...words, ...sizes, ...parsed.terms], locationId, limit: 20 });
}
