/**
 * Drafts a description, tags and category for a product from its name. The draft is only a suggestion: the product
 * form fills empty fields, and the user reviews and saves. The category is matched to the business's own list.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ProductDraft } from "@shopbooks/shared";
import { categories } from "../db/schema";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { chatJson, productDraftEnabled } from "./ai-gateway";

const reply = z.object({
  description: z.string().nullish().catch(null),
  tags: z.union([z.string(), z.array(z.string())]).nullish().catch(null),
  category: z.string().nullish().catch(null),
});

export async function draftProduct(ctx: Ctx, env: Env, name: string): Promise<ProductDraft> {
  if (!productDraftEnabled(env)) throw badRequest("AI product drafts are not configured");
  const cats = await ctx.db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.businessId, ctx.businessId));

  const parsed = reply.parse(
    await chatJson(
      env,
      env.AI_PRODUCT_MODEL!,
      [
        {
          role: "system",
          content: [
            "You write catalogue details for a small shop from a product name.",
            'Reply with one JSON object only: {"description": "...", "tags": "...", "category": "..."}.',
            "description: one short plain sentence a shopper would read, saying what the product is. Use only what the name says.",
            "Never claim durability, rust or water resistance, insulation, quality, comfort, or anything else the name does not state.",
            "tags: up to 6 lowercase words from the name itself, plus its product type (e.g. tee, t-shirt). No other words.",
            `category: the exact name of the best match from this list, or null if none fits: ${cats.map((c) => c.name).join(" | ") || "(no categories yet)"}.`,
          ].join("\n"),
        },
        { role: "user", content: name },
      ],
      "The AI service could not draft this product. Fill in the details by hand.",
    ),
  );

  const tags = Array.isArray(parsed.tags) ? parsed.tags.join(", ") : parsed.tags ?? "";
  const cleanTags = tags
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8)
    .join(", ");
  const wanted = parsed.category?.trim().toLowerCase();
  const category = wanted ? cats.find((c) => c.name.toLowerCase() === wanted) : undefined;

  return {
    description: parsed.description?.trim().slice(0, 4000) || null,
    tags: cleanTags || null,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
  };
}
