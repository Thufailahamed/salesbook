import { SEQUENCE_DEFAULTS, type SequenceKey } from "@shopbooks/shared";
import type { Ctx } from "../lib/context";

export function formatNumber(prefix: string, value: number, padding: number) {
  const s = String(value);
  return prefix + (s.length >= padding ? s : "0".repeat(padding - s.length) + s);
}

/**
 * Atomically reserves document numbers for several sequences in one round trip.
 * Numbers burnt by a failed transaction leave a gap (acceptable; documents are validated before reserving).
 */
export async function reserveNumbers<K extends SequenceKey>(
  ctx: Ctx,
  counts: Partial<Record<K, number>>,
): Promise<Record<K, string[]>> {
  const keys = (Object.keys(counts) as K[]).filter((k) => (counts[k] ?? 0) > 0);
  const out = {} as Record<K, string[]>;
  for (const k of Object.keys(counts) as K[]) out[k] = [];
  if (keys.length === 0) return out;

  const d1 = ctx.env.DB;
  const stmts: D1PreparedStatement[] = [];
  for (const k of keys) {
    stmts.push(
      d1
        .prepare("INSERT OR IGNORE INTO sequences (business_id, key, prefix, next_value, padding) VALUES (?1, ?2, ?3, 1, 5)")
        .bind(ctx.businessId, k, SEQUENCE_DEFAULTS[k].prefix),
    );
    stmts.push(
      d1
        .prepare(
          "UPDATE sequences SET next_value = next_value + ?1 WHERE business_id = ?2 AND key = ?3 RETURNING next_value, prefix, padding",
        )
        .bind(counts[k], ctx.businessId, k),
    );
  }
  const results = await d1.batch<{ next_value: number; prefix: string; padding: number }>(stmts);
  keys.forEach((k, i) => {
    const row = results[i * 2 + 1]?.results?.[0];
    if (!row) throw new Error(`Could not reserve number for ${k}`);
    const n = counts[k] ?? 0;
    const start = row.next_value - n;
    out[k] = Array.from({ length: n }, (_, j) => formatNumber(row.prefix, start + j, row.padding));
  });
  return out;
}

export async function reserveOne(ctx: Ctx, key: SequenceKey): Promise<string> {
  const r = await reserveNumbers(ctx, { [key]: 1 } as Partial<Record<SequenceKey, number>>);
  return r[key][0]!;
}
