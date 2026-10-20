import { eq, inArray } from "drizzle-orm";
import type { JournalSourceType, PartyType } from "@shopbooks/shared";
import { auditLogs, journalEntries, journalLines } from "../db/schema";
import { insertMany, runBatch, type Stmt } from "../lib/batch";
import type { Ctx } from "../lib/context";
import { newId } from "../lib/ids";
import { reserveNumbers } from "./sequences";

export interface PostLine {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string | null;
  partyType?: PartyType | null;
  partyId?: string | null;
}

export interface PostEntry {
  date: string;
  memo: string;
  sourceType: JournalSourceType;
  sourceId?: string | null;
  sourceNumber?: string | null;
  locationId?: string | null;
  reversalOfId?: string | null;
  lines: PostLine[];
}

type NormLine = PostLine & { debit: number; credit: number };

/** Normalises lines: nets debit/credit, drops zero lines, forces integer amounts. */
function normaliseLines(lines: PostLine[]): NormLine[] {
  const out: NormLine[] = [];
  for (const l of lines) {
    if (!l.accountId) throw new Error(`Journal line without account (${l.memo ?? ""})`);
    const net = Math.round(l.debit ?? 0) - Math.round(l.credit ?? 0);
    if (net === 0) continue;
    out.push({ ...l, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }
  return out;
}

/**
 * Collects statements + journal entries for one atomic business operation.
 * Journal numbers are reserved at commit time, then everything runs in a single D1 batch (one transaction).
 */
export class Tx {
  readonly stmts: Stmt[] = [];
  private journals: { id: string; entry: PostEntry; lines: NormLine[] }[] = [];
  private reverseUpdates: { originalId: string; reversalId: string }[] = [];

  constructor(private ctx: Ctx) {}

  add(...stmts: (Stmt | Stmt[] | unknown)[]) {
    for (const s of stmts) {
      if (Array.isArray(s)) this.stmts.push(...(s as Stmt[]));
      else this.stmts.push(s as Stmt);
    }
    return this;
  }

  /** Queue a balanced journal entry. Returns its id (or null when it nets to nothing). */
  journal(entry: PostEntry): string | null {
    const lines = normaliseLines(entry.lines);
    if (lines.length === 0) return null;
    const dr = lines.reduce((s, l) => s + l.debit, 0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);
    if (dr !== cr) throw new Error(`Unbalanced journal "${entry.memo}": debit ${dr} != credit ${cr}`);
    const id = newId();
    this.journals.push({ id, entry, lines });
    if (entry.reversalOfId) this.reverseUpdates.push({ originalId: entry.reversalOfId, reversalId: id });
    return id;
  }

  audit(action: string, summary: string, entityType?: string | null, entityId?: string | null, data?: unknown) {
    this.stmts.push(
      this.ctx.db.insert(auditLogs).values({
        id: newId(),
        businessId: this.ctx.businessId,
        userId: this.ctx.userId,
        action,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        summary,
        data: data ?? null,
        ip: this.ctx.ip,
        createdAt: this.ctx.now,
      }) as unknown as Stmt,
    );
    return this;
  }

  async commit() {
    const { ctx } = this;
    if (this.journals.length > 0) {
      const { journal: numbers } = await reserveNumbers(ctx, { journal: this.journals.length });
      this.journals.forEach((j, i) => {
        const total = j.lines.reduce((s, l) => s + l.debit, 0);
        this.stmts.push(
          ctx.db.insert(journalEntries).values({
            id: j.id,
            businessId: ctx.businessId,
            number: numbers[i]!,
            date: j.entry.date,
            memo: j.entry.memo,
            sourceType: j.entry.sourceType,
            sourceId: j.entry.sourceId ?? null,
            sourceNumber: j.entry.sourceNumber ?? null,
            locationId: j.entry.locationId ?? null,
            totalDebit: total,
            reversalOfId: j.entry.reversalOfId ?? null,
            createdBy: ctx.userId,
            createdAt: ctx.now,
          }) as unknown as Stmt,
        );
        this.stmts.push(
          ...insertMany(
            ctx.db,
            journalLines,
            j.lines.map((l) => ({
              id: newId(),
              entryId: j.id,
              businessId: ctx.businessId,
              accountId: l.accountId,
              date: j.entry.date,
              debit: l.debit,
              credit: l.credit,
              memo: l.memo ?? null,
              partyType: l.partyType ?? null,
              partyId: l.partyId ?? null,
              locationId: j.entry.locationId ?? null,
            })),
          ),
        );
      });
      for (const r of this.reverseUpdates) {
        this.stmts.push(
          ctx.db
            .update(journalEntries)
            .set({ reversedById: r.reversalId })
            .where(eq(journalEntries.id, r.originalId)) as unknown as Stmt,
        );
      }
    }
    return runBatch(ctx.db, this.stmts);
  }
}

/** Queue exact reversals of existing journal entries (used by voids). */
export async function queueReversals(
  ctx: Ctx,
  tx: Tx,
  entryIds: string[],
  opts: { date: string; memo: string; sourceType: JournalSourceType; sourceId?: string | null; sourceNumber?: string | null },
) {
  if (entryIds.length === 0) return;
  const entries = await ctx.db.select().from(journalEntries).where(inArray(journalEntries.id, entryIds));
  const lines = await ctx.db.select().from(journalLines).where(inArray(journalLines.entryId, entryIds));
  for (const e of entries) {
    if (e.reversedById) continue;
    tx.journal({
      date: opts.date,
      memo: `${opts.memo} (reverses ${e.number})`,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId ?? e.sourceId,
      sourceNumber: opts.sourceNumber ?? e.sourceNumber,
      locationId: e.locationId,
      reversalOfId: e.id,
      lines: lines
        .filter((l) => l.entryId === e.id)
        .map((l) => ({
          accountId: l.accountId,
          debit: l.credit,
          credit: l.debit,
          memo: l.memo,
          partyType: (l.partyType as PartyType | null) ?? null,
          partyId: l.partyId,
        })),
    });
  }
}
