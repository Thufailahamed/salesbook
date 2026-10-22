import type { Ctx } from "./lib/context";

export interface Env {
  DB: D1Database;
  FILES?: R2Bucket;
  ASSETS?: Fetcher;
  /** Comma-separated origins allowed for credentialed CORS (dev). */
  CORS_ORIGINS?: string;
  /** Bootstrap platform admin: created on first successful login with these credentials (set as secrets). */
  /** Override the payments.lk API base (tests / sandbox proxies). Defaults to https://api.payments.lk/v1 */
  PAYMENTS_LK_API?: string;
  /** Override the Notify.lk send endpoint (tests). Defaults to https://app.notify.lk/api/v1/send */
  NOTIFY_LK_API?: string;
  PLATFORM_ADMIN_EMAIL?: string;
  PLATFORM_ADMIN_PASSWORD?: string;
  /** Workers AI binding; its calls are routed through AI_GATEWAY_ID. */
  AI?: Ai;
  AI_GATEWAY_ID?: string;
  /** Workers AI model id, e.g. "@cf/..." . Unset = AI features stay off. */
  AI_RECEIPT_MODEL?: string;
  /** Workers AI model that answers "ask your books" questions. Unset = feature off. */
  AI_ASK_MODEL?: string;
  /** Workers AI model that suggests categories for bank statement lines. Unset = feature off. */
  AI_BANK_MODEL?: string;
  /** Workers AI model that writes the pre-close review summary. Unset = checks only, no summary. */
  AI_REVIEW_MODEL?: string;
  /** Workers AI model that turns a failed POS search into catalogue words. Unset = feature off. */
  AI_SEARCH_MODEL?: string;
  /** Workers AI model that drafts product descriptions and tags. Unset = feature off. */
  AI_PRODUCT_MODEL?: string;
  /** Workers AI model that summarises reorder advice. Unset = rules only, no summary. */
  AI_STOCK_MODEL?: string;
  /** Workers AI model that words payment reminders and supplier messages. Unset = feature off. */
  AI_REMINDER_MODEL?: string;
  /** Workers AI model that answers "how do I…" questions from the built-in help. Unset = feature off. */
  AI_HELP_MODEL?: string;
  /** Workers AI model that writes the cash-flow forecast summary. Unset = numbers only. */
  AI_CASHFLOW_MODEL?: string;
  /** Workers AI model that writes the note on the sales and refund review. Unset = flags only. */
  AI_SALESREVIEW_MODEL?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { ctx: Ctx };
};
