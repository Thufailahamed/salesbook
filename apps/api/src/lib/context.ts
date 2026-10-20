import { and, eq, isNotNull } from "drizzle-orm";
import { can, dateInTimeZone, type Permission, type Role, type SystemAccountKey } from "@shopbooks/shared";
import type { DB } from "../db/client";
import { accounts, businesses } from "../db/schema";
import type { Env } from "../env";
import { badRequest, forbidden } from "./errors";

export type BusinessRow = typeof businesses.$inferSelect;
export type SystemAccounts = Record<SystemAccountKey, string>;

/** Per-request context handed to services. */
export interface Ctx {
  db: DB;
  env: Env;
  businessId: string;
  userId: string;
  userName: string;
  role: Role;
  business: BusinessRow;
  /** Today's date in the business timezone */
  today: string;
  now: number;
  ip: string | null;
  can(p: Permission): boolean;
  require(p: Permission): void;
  /** Lazily loaded map systemKey -> account id */
  accounts(): Promise<SystemAccounts>;
}

export function createCtx(args: {
  db: DB;
  env: Env;
  business: BusinessRow;
  userId: string;
  userName: string;
  role: Role;
  ip: string | null;
}): Ctx {
  let accountCache: Promise<SystemAccounts> | null = null;
  const ctx: Ctx = {
    ...args,
    businessId: args.business.id,
    today: dateInTimeZone(args.business.timezone),
    now: Date.now(),
    can: (p) => can(args.role, p),
    require: (p) => {
      if (!can(args.role, p)) throw forbidden();
    },
    accounts: (): Promise<SystemAccounts> => {
      if (!accountCache) {
        accountCache = args.db
          .select({ id: accounts.id, key: accounts.systemKey })
          .from(accounts)
          .where(and(eq(accounts.businessId, args.business.id), isNotNull(accounts.systemKey)))
          .then((rows) => {
            const map = {} as SystemAccounts;
            for (const r of rows) if (r.key) map[r.key as SystemAccountKey] = r.id;
            return map;
          });
      }
      return accountCache!;
    },
  };
  return ctx;
}

/** Validate a client-provided document date (only managers may back/forward-date). */
export function docDate(ctx: Ctx, date: string | undefined | null): string {
  if (!date || date === ctx.today) return ctx.today;
  if (!ctx.can("pos.backdate") && !ctx.can("accounting.manage")) {
    throw badRequest("You can only record transactions for today");
  }
  return date;
}
