import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { DB } from "../db/client";

export type Stmt = BatchItem<"sqlite">;

/** Run statements atomically (D1 batch = single transaction). */
export async function runBatch(db: DB, stmts: Stmt[]) {
  if (stmts.length === 0) return [];
  return db.batch(stmts as [Stmt, ...Stmt[]]);
}

/** D1 allows at most 100 bound parameters per statement: chunk multi-row inserts accordingly. */
export function insertMany<T extends SQLiteTable>(db: DB, table: T, rows: T["$inferInsert"][]): Stmt[] {
  if (rows.length === 0) return [];
  // Drizzle binds column defaults as parameters too, so the params per row can exceed the
  // provided columns — measure the real count with toSQL() on a probe row.
  const probe = (db.insert(table).values([rows[0]] as never) as unknown as { toSQL: () => { params: unknown[] } }).toSQL();
  const perRow = Math.max(1, probe.params.length);
  const per = Math.max(1, Math.floor(99 / perRow));
  const out: Stmt[] = [];
  for (let i = 0; i < rows.length; i += per) {
    out.push(db.insert(table).values(rows.slice(i, i + per) as never) as unknown as Stmt);
  }
  return out;
}
