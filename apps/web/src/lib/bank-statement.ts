import { parseCSV } from "./csv";

export interface StatementRow {
  date: string;
  description: string;
  /** Minor units, signed: money in is positive, money out is negative */
  amount: number;
}

/** Accepts ISO dates and day/month/year (with / . or - separators). */
export function normaliseDate(raw: string): string | null {
  const v = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return null;
}

function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const v = raw.replace(/[,\s]/g, "");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads a bank statement export. Needs a date and a description column, plus either one signed `amount` column or
 * separate `debit` (money out) and `credit` (money in) columns. Rows that can't be read are counted and skipped.
 */
export function parseStatementCSV(text: string, toMinor: (major: number) => number) {
  const [header, ...body] = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return { rows: [] as StatementRow[], skipped: 0, error: "The file is empty" };
  const cols = header.map((h) => h.trim().toLowerCase());
  const find = (re: RegExp) => cols.findIndex((c) => re.test(c));
  const dateIdx = find(/date/);
  const descIdx = find(/desc|detail|narrat|particular|memo|reference/);
  const amountIdx = find(/^amount/);
  const debitIdx = find(/debit|withdraw|money out/);
  const creditIdx = find(/credit|deposit|money in/);
  if (dateIdx < 0 || descIdx < 0 || (amountIdx < 0 && (debitIdx < 0 || creditIdx < 0))) {
    return { rows: [] as StatementRow[], skipped: 0, error: "Expected columns: date, description and amount (or debit and credit)" };
  }
  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const r of body) {
    const date = normaliseDate(r[dateIdx] ?? "");
    let major: number | null;
    if (amountIdx >= 0) major = parseAmount(r[amountIdx]);
    else {
      const debit = parseAmount(r[debitIdx]) ?? 0;
      const credit = parseAmount(r[creditIdx]) ?? 0;
      major = debit === 0 && credit === 0 ? null : credit - debit;
    }
    const amount = major === null ? 0 : toMinor(major);
    if (!date || amount === 0) {
      skipped += 1;
      continue;
    }
    rows.push({ date, description: (r[descIdx] ?? "").trim() || "Statement line", amount });
  }
  return { rows, skipped, error: null };
}
