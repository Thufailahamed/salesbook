/**
 * Suggests an expense category for each unmatched bank statement line. One model call covers the whole list.
 * The model only proposes; the user records the expense, and the existing auto-match then pairs it with the line.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { currencyDecimals, toMajor, type BankSuggestions } from "@shopbooks/shared";
import { accounts, bankStatementLines } from "../db/schema";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { badRequest, notFound } from "../lib/errors";
import { bankSuggestEnabled, chatJson, type ChatMessage } from "./ai-gateway";
import { assertReconcilable } from "./ledger-accounts";

/** Keeps one call small: the 8B model is reliable on short lists. */
const MAX_LINES = 40;

const reply = z.object({
  suggestions: z
    .array(
      z.object({
        line: z.union([z.number(), z.string()]).nullish(),
        category: z.string().nullish(),
      }),
    )
    .catch([]),
});

const asNumber = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
};
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function suggestBankCategories(ctx: Ctx, env: Env, accountId: string): Promise<BankSuggestions> {
  if (!bankSuggestEnabled(env)) throw badRequest("AI bank suggestions are not configured");
  const [acc] = await ctx.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.businessId, ctx.businessId), eq(accounts.id, accountId)));
  if (!acc) throw notFound("Account");
  assertReconcilable(acc);

  const lines = await ctx.db
    .select({ id: bankStatementLines.id, date: bankStatementLines.date, description: bankStatementLines.description, amount: bankStatementLines.amount })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.businessId, ctx.businessId),
        eq(bankStatementLines.accountId, accountId),
        isNull(bankStatementLines.matchedLineId),
      ),
    )
    .orderBy(asc(bankStatementLines.date))
    .limit(MAX_LINES);
  const categories = await ctx.db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.businessId, ctx.businessId), eq(accounts.type, "expense"), eq(accounts.isActive, true)));
  if (lines.length === 0 || categories.length === 0) return { suggestions: [] };

  const decimals = currencyDecimals(ctx.business.currency);
  const system = [
    "You sort a shop's bank statement lines into expense categories.",
    'Reply with one JSON object only: {"suggestions": [{"line": <line number>, "category": "<exact category name from the list, or null>"}]}',
    "Only suggest a category for money going OUT (negative amounts). For money coming IN, or when no category clearly fits, use null.",
    `Currency: ${ctx.business.currency}. Amounts are in major units.`,
    "Expense categories:",
    ...categories.map((a) => `- ${a.name}`),
  ].join("\n");
  const listing = lines
    .map((l, i) => `${i + 1} | ${l.date} | ${l.description} | ${toMajor(Number(l.amount), decimals)}`)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: `Statement lines:\n${listing}\n\nReply with only the JSON object.` },
  ];
  const parsed = reply.parse(
    await chatJson(env, env.AI_BANK_MODEL!, messages, "The AI service could not sort these lines. Try again in a moment."),
  );

  const suggestions: BankSuggestions["suggestions"] = [];
  const seen = new Set<number>();
  for (const s of parsed.suggestions) {
    const lineNo = asNumber(s.line);
    if (lineNo === null || seen.has(lineNo) || !s.category) continue;
    const line = lines[lineNo - 1];
    const category = categories.find((c) => sameName(c.name, s.category!));
    // Money in is never an expense, whatever the model says.
    if (!line || !category || Number(line.amount) >= 0) continue;
    seen.add(lineNo);
    suggestions.push({ lineId: line.id, categoryId: category.id, categoryName: category.name });
  }
  return { suggestions };
}
