import { and, eq, gte, lt, lte, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { addDays, addMonths, isDebitNormal, startOfMonth, type AccountType } from "@shopbooks/shared";
import { accounts, journalLines } from "../db/schema";
import type { Ctx } from "../lib/context";

export type GroupBy = "day" | "week" | "month";

/** Default report range: first day of the month of `to` (default today) → `to`. */
export function reportRange(ctx: Ctx, q: { from?: string; to?: string }) {
  const to = q.to ?? ctx.today;
  const from = q.from ?? startOfMonth(to);
  return from <= to ? { from, to } : { from: to, to: from };
}

export const num = (v: unknown) => Number(v ?? 0) || 0;

export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 10000) / 100;
}

// ---------------------------------------------------------------- periods

export function mondayOf(date: string) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export function periodOf(date: string, groupBy: GroupBy) {
  if (groupBy === "month") return date.slice(0, 7);
  if (groupBy === "week") return mondayOf(date);
  return date;
}

/** SQL expression bucketing a YYYY-MM-DD column into a period key. */
export function periodSql(col: AnySQLiteColumn | SQL, groupBy: GroupBy): SQL<string> {
  if (groupBy === "month") return sql<string>`substr(${col}, 1, 7)`;
  if (groupBy === "week") return sql<string>`date(${col}, 'weekday 0', '-6 days')`;
  return sql<string>`${col}`;
}

export function enumeratePeriods(from: string, to: string, groupBy: GroupBy, max = 1000): string[] {
  const out: string[] = [];
  if (groupBy === "month") {
    let d = `${from.slice(0, 7)}-01`;
    while (d.slice(0, 7) <= to.slice(0, 7) && out.length < max) {
      out.push(d.slice(0, 7));
      d = addMonths(d, 1);
    }
    return out;
  }
  if (groupBy === "week") {
    let d = mondayOf(from);
    while (d <= to && out.length < max) {
      out.push(d);
      d = addDays(d, 7);
    }
    return out;
  }
  let d = from;
  while (d <= to && out.length < max) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

// ---------------------------------------------------------------- timezone helpers

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fullFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function zonedParts(epoch: number, tz: string) {
  const out: Record<string, number> = {};
  try {
    for (const p of fullFormatter(tz).formatToParts(new Date(epoch))) {
      if (p.type !== "literal") out[p.type] = Number(p.value);
    }
  } catch {
    const d = new Date(epoch);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() };
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

/** Offset (ms) of the timezone from UTC at the given instant. */
export function tzOffsetMs(epoch: number, tz: string) {
  const p = zonedParts(epoch, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (epoch - (((epoch % 1000) + 1000) % 1000));
}

/** Epoch ms of local midnight for a YYYY-MM-DD date in the timezone. */
export function zonedDayStart(date: string, tz: string) {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const off = tzOffsetMs(guess, tz);
  let t = guess - off;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}

export function hourInTz(epoch: number, tz: string) {
  return zonedParts(epoch, tz).hour;
}

// ---------------------------------------------------------------- ledger sums

export type AccountRow = typeof accounts.$inferSelect;

export async function loadAccounts(ctx: Ctx): Promise<AccountRow[]> {
  return ctx.db.select().from(accounts).where(eq(accounts.businessId, ctx.businessId)).orderBy(accounts.code);
}

/** Σ debit / Σ credit per account with optional date bounds (inclusive from/to, exclusive before). */
export async function accountSums(
  ctx: Ctx,
  opts: { from?: string; to?: string; before?: string; locationId?: string } = {},
): Promise<Map<string, { debit: number; credit: number }>> {
  const conds: SQL[] = [eq(journalLines.businessId, ctx.businessId)];
  if (opts.from) conds.push(gte(journalLines.date, opts.from));
  if (opts.to) conds.push(lte(journalLines.date, opts.to));
  if (opts.before) conds.push(lt(journalLines.date, opts.before));
  if (opts.locationId) conds.push(eq(journalLines.locationId, opts.locationId));
  const rows = await ctx.db
    .select({
      accountId: journalLines.accountId,
      debit: sql<number>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .where(and(...conds))
    .groupBy(journalLines.accountId);
  return new Map(rows.map((r) => [r.accountId, { debit: num(r.debit), credit: num(r.credit) }]));
}

/** Balance on the account's normal side. */
export function normalBalance(acc: Pick<AccountRow, "type" | "subtype">, s: { debit: number; credit: number } | undefined) {
  if (!s) return 0;
  return isDebitNormal(acc.type as AccountType, acc.subtype) ? s.debit - s.credit : s.credit - s.debit;
}
