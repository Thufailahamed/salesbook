import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Account, AccountSubtype, AccountType, JournalEntry, JournalLine, PartyType } from "@shopbooks/shared";
import { accounts, customers, journalEntries, journalLines, suppliers, users } from "../db/schema";
import type { Ctx } from "../lib/context";
import { notFound } from "../lib/errors";
import { normalBalance, type AccountRow } from "./reports-utils";

export function mapAccount(a: AccountRow, sums?: { debit: number; credit: number }): Account {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type as AccountType,
    subtype: a.subtype as AccountSubtype,
    systemKey: a.systemKey,
    isSystem: a.isSystem,
    isActive: a.isActive,
    description: a.description,
    balance: normalBalance(a, sums),
  };
}

const creator = alias(users, "creator");

export function journalSelect(ctx: Ctx) {
  return ctx.db
    .select({ e: journalEntries, createdByName: creator.name })
    .from(journalEntries)
    .leftJoin(creator, eq(creator.id, journalEntries.createdBy));
}

export function mapJournalEntry(r: { e: typeof journalEntries.$inferSelect; createdByName: string | null }): JournalEntry {
  const e = r.e;
  return {
    id: e.id,
    number: e.number,
    date: e.date,
    memo: e.memo,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    sourceNumber: e.sourceNumber,
    totalDebit: e.totalDebit,
    createdByName: r.createdByName ?? null,
    createdAt: e.createdAt,
    reversalOfId: e.reversalOfId,
    reversedById: e.reversedById,
  };
}

export async function journalLinesFor(ctx: Ctx, entryIds: string[]): Promise<Map<string, JournalLine[]>> {
  const map = new Map<string, JournalLine[]>();
  for (let i = 0; i < entryIds.length; i += 90) {
    const rows = await ctx.db
      .select({
        l: journalLines,
        accountCode: accounts.code,
        accountName: accounts.name,
        customerName: customers.name,
        supplierName: suppliers.name,
      })
      .from(journalLines)
      .leftJoin(accounts, eq(accounts.id, journalLines.accountId))
      .leftJoin(customers, and(eq(journalLines.partyType, "customer"), eq(customers.id, journalLines.partyId)))
      .leftJoin(suppliers, and(eq(journalLines.partyType, "supplier"), eq(suppliers.id, journalLines.partyId)))
      .where(inArray(journalLines.entryId, entryIds.slice(i, i + 90)))
      .orderBy(asc(journalLines.entryId), asc(journalLines.credit), asc(journalLines.id));
    for (const r of rows) {
      const list = map.get(r.l.entryId) ?? [];
      list.push({
        id: r.l.id,
        accountId: r.l.accountId,
        accountCode: r.accountCode ?? "",
        accountName: r.accountName ?? "",
        debit: r.l.debit,
        credit: r.l.credit,
        memo: r.l.memo,
        partyType: (r.l.partyType as PartyType | null) ?? null,
        partyId: r.l.partyId,
        partyName: r.customerName ?? r.supplierName ?? null,
      });
      map.set(r.l.entryId, list);
    }
  }
  // Debits first, then credits.
  for (const list of map.values()) list.sort((a, b) => (b.debit > 0 ? 1 : 0) - (a.debit > 0 ? 1 : 0));
  return map;
}

export async function getJournalDto(ctx: Ctx, id: string): Promise<JournalEntry> {
  const [row] = await journalSelect(ctx).where(and(eq(journalEntries.id, id), eq(journalEntries.businessId, ctx.businessId)));
  if (!row) throw notFound("Journal entry");
  const lines = await journalLinesFor(ctx, [id]);
  return { ...mapJournalEntry(row), lines: lines.get(id) ?? [] };
}
