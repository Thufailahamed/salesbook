/**
 * Workers AI models called through Cloudflare AI Gateway via the `AI` binding. No provider keys: the binding
 * authenticates to Workers AI itself, and `gateway.id` routes the call through the gateway for logs, caching and limits.
 */
import type { AiModels } from "@cloudflare/workers-types";
import type { AiFeature } from "@shopbooks/shared";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { ApiError, forbidden } from "../lib/errors";

const MAX_OUTPUT_TOKENS = 1024;

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ChatMessage {
  role: "system" | "user";
  content: string | ContentPart[];
}

/** The binding and gateway are set up. Each feature also needs its own model configured. */
export function aiGatewayReady(env: Env): boolean {
  return !!(env.AI && env.AI_GATEWAY_ID);
}

export function receiptScanEnabled(env: Env): boolean {
  return aiGatewayReady(env) && !!env.AI_RECEIPT_MODEL;
}

export function askEnabled(env: Env): boolean {
  return aiGatewayReady(env) && !!env.AI_ASK_MODEL;
}

export function bankSuggestEnabled(env: Env): boolean {
  return aiGatewayReady(env) && !!env.AI_BANK_MODEL;
}

export function productSearchEnabled(env: Env): boolean {
  return aiGatewayReady(env) && !!env.AI_SEARCH_MODEL;
}

export function productDraftEnabled(env: Env): boolean {
  return aiGatewayReady(env) && !!env.AI_PRODUCT_MODEL;
}

export function reminderDraftEnabled(env: Env): boolean {
  return aiGatewayReady(env) && !!env.AI_REMINDER_MODEL;
}

export function helpEnabled(env: Env): boolean {
  return aiGatewayReady(env) && !!env.AI_HELP_MODEL;
}

export function cashForecastEnabled(env: Env): boolean {
  return aiGatewayReady(env) && !!env.AI_CASHFLOW_MODEL;
}

export function salesReviewEnabled(env: Env): boolean {
  return aiGatewayReady(env) && !!env.AI_SALESREVIEW_MODEL;
}

/** Server side: does this server have a model for the feature. */
export const AI_AVAILABLE: Record<AiFeature, (env: Env) => boolean> = {
  receiptScan: receiptScanEnabled,
  ask: askEnabled,
  bankSuggest: bankSuggestEnabled,
  productSearch: productSearchEnabled,
  productDraft: productDraftEnabled,
  reminderDraft: reminderDraftEnabled,
  help: helpEnabled,
  cashForecast: cashForecastEnabled,
  salesReview: salesReviewEnabled,
};

/** Business side: the features this business has switched off in Settings. */
export function aiSwitchedOff(ctx: Ctx): AiFeature[] {
  try {
    const list: unknown = JSON.parse(ctx.business.aiDisabled || "[]");
    return Array.isArray(list) ? (list as AiFeature[]) : [];
  } catch {
    return [];
  }
}

/** Available on the server and not switched off by this business. */
export function aiOn(ctx: Ctx, env: Env, feature: AiFeature): boolean {
  return AI_AVAILABLE[feature](env) && !aiSwitchedOff(ctx).includes(feature);
}

/** Refuses a request for a feature this business has switched off. */
export function requireAiOn(ctx: Ctx, feature: AiFeature): void {
  if (aiSwitchedOff(ctx).includes(feature)) throw forbidden("This AI feature is switched off for your business");
}

/** Runs a Workers AI chat model through the gateway and returns the raw reply. */
export async function runModel(env: Env, model: string, messages: ChatMessage[]): Promise<unknown> {
  if (!aiGatewayReady(env)) throw new ApiError(503, "ai_not_configured", "AI features are not configured yet");
  try {
    // The model name is a runtime string from config, so it is not one of the typed Workers AI model keys.
    // The default output limit is 256 tokens, too short for a full 40-line bank reply, so set it explicitly.
    const result = (await env.AI!.run(model as keyof AiModels, { messages, temperature: 0, max_tokens: MAX_OUTPUT_TOKENS } as never, {
      gateway: { id: env.AI_GATEWAY_ID! },
    })) as { response?: unknown; usage?: { prompt_tokens?: number; completion_tokens?: number; neurons?: number } };
    console.info("ai_usage", JSON.stringify({ model, ...result.usage }));
    return result.response;
  } catch (err) {
    console.error("Workers AI error", model, err);
    throw new ApiError(502, "ai_error", "The AI service could not answer right now. Try again in a moment.");
  }
}

/** Runs a chat model and returns the parsed JSON object it replies with. */
export async function chatJson(env: Env, model: string, messages: ChatMessage[], unreadableMessage: string): Promise<unknown> {
  const response = await runModel(env, model, messages);
  // Some models return the parsed object; others return text with the object inside it (sometimes fenced or wrapped).
  if (response && typeof response === "object") return response;
  const text = typeof response === "string" ? response : "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    if (start === -1 || end < start) throw new SyntaxError("no object");
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ApiError(502, "ai_error", unreadableMessage);
  }
}

/** Runs a chat model and returns its plain-text reply. */
export async function chatText(env: Env, model: string, messages: ChatMessage[]): Promise<string> {
  const response = await runModel(env, model, messages);
  if (typeof response === "string") return response.trim();
  return response ? JSON.stringify(response) : "";
}
