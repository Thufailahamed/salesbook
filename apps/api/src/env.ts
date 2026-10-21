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
  PLATFORM_ADMIN_EMAIL?: string;
  PLATFORM_ADMIN_PASSWORD?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { ctx: Ctx };
};
