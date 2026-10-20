import type { Ctx } from "./lib/context";

export interface Env {
  DB: D1Database;
  FILES?: R2Bucket;
  ASSETS?: Fetcher;
  /** Comma-separated origins allowed for credentialed CORS (dev). */
  CORS_ORIGINS?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { ctx: Ctx };
};
