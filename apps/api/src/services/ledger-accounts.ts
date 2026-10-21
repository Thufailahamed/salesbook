import { and, eq } from "drizzle-orm";
import { accounts } from "../db/schema";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Stmt } from "../lib/batch";
import type { AccountRow } from "./reports-utils";
import type { Tx } from "./tx";

/** Accounts depreciation posts to. Created on first use so businesses set up before this feature still get them. */
export const DEPRECIATION_ACCOUNTS = {
  accumulated: { code: "1510", name: "Accumulated Depreciation", type: "asset", subtype: "fixed_asset" },
  expense: { code: "6130", name: "Depreciation Expense", type: "expense", subtype: "expense" },
} as const;

/** Returns the account id for a spec, queueing its creation on the transaction when it doesn't exist yet. */
export async function ensureAccount(ctx: Ctx, tx: Tx, spec: (typeof DEPRECIATION_ACCOUNTS)[keyof typeof DEPRECIATION_ACCOUNTS]) {
  const [row] = await ctx.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.businessId, ctx.businessId), eq(accounts.code, spec.code)));
  if (row) {
    if (!row.isActive) throw badRequest(`${row.code} ${row.name} is inactive`);
    if (row.type !== spec.type) throw badRequest(`Account ${spec.code} is not a ${spec.type} account`);
    return row.id;
  }
  const id = newId();
  tx.add(
    ctx.db.insert(accounts).values({
      id,
      businessId: ctx.businessId,
      code: spec.code,
      name: spec.name,
      type: spec.type,
      subtype: spec.subtype,
      systemKey: null,
      isSystem: false,
      isActive: true,
      description: null,
      createdAt: ctx.now,
    }) as unknown as Stmt,
  );
  return id;
}


export function assertReconcilable(acc: AccountRow) {
  if (acc.type !== "asset" || (acc.subtype !== "cash" && acc.subtype !== "bank")) {
    throw badRequest("Only cash and bank accounts can be reconciled");
  }
}

