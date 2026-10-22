import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { AI_FEATURES, type AiFeature, type AiFeatureSetting, type AiSettings, type AiStatus } from "@shopbooks/shared";
import { aiAskSchema, aiHelpSchema, aiSettingsSchema, bankSuggestSchema, productDraftSchema, reminderDraftSchema, reorderAdviceSchema } from "@shopbooks/shared";
import { businesses } from "../db/schema";
import type { AppEnv } from "../env";
import { requireAuth, requirePerm } from "../lib/auth";
import { badRequest } from "../lib/errors";
import { vJson, vQuery } from "../lib/validate";
import { z } from "zod";
import { AI_AVAILABLE, aiOn, aiSwitchedOff, requireAiOn } from "../services/ai-gateway";
import { helpAnswer } from "../services/ai-help";
import { draftProduct } from "../services/ai-product";
import { draftReminder } from "../services/ai-reminder";
import { reorderAdvice } from "../services/ai-reorder";
import { aiProductSearch } from "../services/ai-search";
import { suggestBankCategories } from "../services/ai-bank";
import { askBooks } from "../services/ai-ask";
import { scanReceipt } from "../services/receipts";
import { Tx } from "../services/tx";

const app = new Hono<AppEnv>();

const FEATURE_INFO: Record<AiFeature, { label: string; description: string }> = {
  receiptScan: { label: "Receipt scanning", description: "Fill expense forms from a photo of a receipt." },
  ask: { label: "Ask your books", description: "Plain-language questions answered from your reports." },
  bankSuggest: { label: "Bank category suggestions", description: "Suggest expense categories for bank statement lines." },
  productSearch: { label: "Smart product search", description: "Find the closest products when a POS search has no match." },
  productDraft: { label: "Product drafts", description: "Draft descriptions, tags and categories for new products." },
  reminderDraft: { label: "Payment reminders", description: "Draft reminders and supplier messages from open balances." },
  help: { label: "Help assistant", description: "Answer how-to questions from the built-in help." },
  cashForecast: { label: "Cash-flow summary", description: "A short note on the four-week cash forecast." },
  salesReview: { label: "Sales review note", description: "A short note on the sales, refunds and discounts to look at." },
};

function featureSettings(ctx: AppEnv["Variables"]["ctx"], env: AppEnv["Bindings"]): AiSettings {
  const off = aiSwitchedOff(ctx);
  const features: AiFeatureSetting[] = AI_FEATURES.map((key) => ({
    key,
    ...FEATURE_INFO[key],
    available: AI_AVAILABLE[key](env),
    enabled: !off.includes(key),
  }));
  return { features };
}

app.get("/status", requireAuth, (c) => {
  const ctx = c.get("ctx");
  const on = (f: AiFeature) => aiOn(ctx, c.env, f);
  const status: AiStatus = {
    receiptScan: on("receiptScan"),
    ask: on("ask"),
    bankSuggest: on("bankSuggest"),
    productSearch: on("productSearch"),
    productDraft: on("productDraft"),
    reminderDraft: on("reminderDraft"),
    help: on("help"),
    cashForecast: on("cashForecast"),
    salesReview: on("salesReview"),
  };
  return c.json(status);
});

app.get("/settings", requireAuth, (c) => c.json(featureSettings(c.get("ctx"), c.env)));

app.put("/settings", requirePerm("settings.manage"), vJson(aiSettingsSchema), async (c) => {
  const ctx = c.get("ctx");
  const { features } = c.req.valid("json");
  const off = AI_FEATURES.filter((k) => features[k] === false);
  const tx = new Tx(ctx);
  tx.add(ctx.db.update(businesses).set({ aiDisabled: JSON.stringify(off) }).where(eq(businesses.id, ctx.businessId)));
  tx.audit("settings.ai", `Changed AI features: ${off.length ? `off for ${off.join(", ")}` : "all on"}`, "business", ctx.businessId);
  await tx.commit();
  return c.json({ features: AI_FEATURES.map((key) => ({ key, ...FEATURE_INFO[key], available: AI_AVAILABLE[key](c.env), enabled: !off.includes(key) })) } satisfies AiSettings);
});

app.post("/receipt", requirePerm("expenses.manage"), async (c) => {
  const ctx = c.get("ctx");
  requireAiOn(ctx, "receiptScan");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("Attach a receipt image");
  return c.json(await scanReceipt(ctx, c.env, file));
});

app.post("/ask", requirePerm("reports.view"), vJson(aiAskSchema), async (c) => {
  const ctx = c.get("ctx");
  requireAiOn(ctx, "ask");
  return c.json(await askBooks(ctx, c.env, c.req.valid("json").question));
});

app.post("/bank-suggestions", requirePerm("accounting.view"), vJson(bankSuggestSchema), async (c) => {
  const ctx = c.get("ctx");
  requireAiOn(ctx, "bankSuggest");
  return c.json(await suggestBankCategories(ctx, c.env, c.req.valid("json").accountId));
});

app.get(
  "/product-search",
  requirePerm("pos.sell"),
  vQuery(z.object({ q: z.string().trim().min(2).max(200), locationId: z.string().optional() })),
  async (c) => {
    const ctx = c.get("ctx");
    requireAiOn(ctx, "productSearch");
    const { q, locationId } = c.req.valid("query");
    return c.json(await aiProductSearch(ctx, c.env, q, locationId));
  },
);

app.post("/product-draft", requirePerm("products.manage"), vJson(productDraftSchema), async (c) => {
  const ctx = c.get("ctx");
  requireAiOn(ctx, "productDraft");
  return c.json(await draftProduct(ctx, c.env, c.req.valid("json").name));
});

app.post("/reorder-advice", requirePerm("reports.view"), vJson(reorderAdviceSchema), async (c) => {
  return c.json(await reorderAdvice(c.get("ctx"), c.env, c.req.valid("json").locationId));
});

app.post("/help", requireAuth, vJson(aiHelpSchema), async (c) => {
  const ctx = c.get("ctx");
  requireAiOn(ctx, "help");
  return c.json(await helpAnswer(ctx, c.env, c.req.valid("json").question));
});

app.post("/reminder-draft", vJson(reminderDraftSchema), async (c) => {
  const ctx = c.get("ctx");
  requireAiOn(ctx, "reminderDraft");
  const { partyType, partyId } = c.req.valid("json");
  ctx.require(partyType === "customer" ? "customers.view" : "suppliers.view");
  return c.json(await draftReminder(ctx, c.env, partyType, partyId));
});

export default app;
