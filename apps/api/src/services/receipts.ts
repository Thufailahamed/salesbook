import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { currencyDecimals, toMinor, type ReceiptScan } from "@shopbooks/shared";
import { accounts } from "../db/schema";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { chatJson, receiptScanEnabled, type ChatMessage } from "./ai-gateway";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Loose on purpose: models return numbers as strings and sometimes the wrong type. Each field falls back to null
 * on its own, so one bad field never fails the whole scan. Values are checked again below.
 */
const str = z.string().nullish().catch(null);
const num = z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/[,\s]/g, "")) : v), z.number().nullish()).catch(null);
const modelReply = z.object({
  date_as_printed: str,
  payee: str,
  total: num,
  tax: num,
  reference: str,
  note: str,
  category: str,
  confidence: z.enum(["high", "medium", "low"]).catch("low"),
});

/**
 * Words on a receipt that point at a default expense category. Used only when the model names no category, and the
 * form shows the result for the user to check. Names are the default chart's, so a renamed account is left alone.
 */
const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/\b(fuel|petrol|diesel|octane|filling station)\b/i, "Transport & Delivery"],
  [/\b(courier|waybill|delivery|shipping|postage|freight|taxi|bus fare)\b/i, "Transport & Delivery"],
  [/\b(repairs?|maintenance|spares|brake|garage)\b/i, "Repairs & Maintenance"],
  [/\b(electricity|water bill|utility|utilities|ceb|leco)\b/i, "Utilities"],
  [/\b(telephone|mobile|internet|broadband|dialog|mobitel|airtel|slt)\b/i, "Telephone & Internet"],
  [/\b(stationery|stationary|printer|toner|ink|office)\b/i, "Office Supplies"],
  [/\b(bank charges?|card fees?|bank fees?|merchant fees?)\b/i, "Bank & Card Fees"],
  [/\b(rent|lease)\b/i, "Rent"],
  [/\b(packaging|packing|carton|bags?)\b/i, "Packaging"],
  [/\b(insurance)\b/i, "Insurance"],
  [/\b(supermarket|grocer|groceries|milk|bread|eggs)\b/i, "Miscellaneous Expenses"],
];

/** The category the business's list uses for a name: exact (ignoring case), then a close partial match. */
function matchCategory<T extends { name: string }>(list: T[], wanted: string | null | undefined): T | undefined {
  const w = wanted?.trim().toLowerCase();
  if (!w) return undefined;
  return list.find((a) => a.name.toLowerCase() === w) ?? list.find((a) => a.name.toLowerCase().includes(w) || w.includes(a.name.toLowerCase()));
}

function keywordCategory<T extends { name: string }>(list: T[], text: string): T | undefined {
  const hit = CATEGORY_KEYWORDS.find(([re]) => re.test(text));
  return hit ? matchCategory(list, hit[1]) : undefined;
}

const text = (v: string | null | undefined, max: number) => {
  const s = v?.trim().slice(0, max);
  return s ? s : null;
};

/** Accepts YYYY-MM-DD, or day-first DD/MM/YYYY (also - and .), as printed on most receipts. */
export function parsePrintedDate(raw: string | null | undefined): string | null {
  // Keep only the date part: receipts often print a time after it ("12/10/2026 14:22").
  const s = raw?.trim().match(/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/)?.[0];
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dayFirst) [d, m, y] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])];
  else return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Reads a receipt image into expense form values. The model only suggests; the caller decides what to save. */
export async function scanReceipt(ctx: Ctx, env: Env, file: File): Promise<ReceiptScan> {
  if (!receiptScanEnabled(env)) throw badRequest("AI receipt scanning is not configured");
  if (!ALLOWED.has(file.type)) throw badRequest("Receipts must be a JPEG, PNG or WEBP image");
  if (file.size > MAX_BYTES) throw badRequest("Receipt images must be 5 MB or smaller");

  const categories = await ctx.db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    // Cost of goods sold is booked from sales and stock, not from receipts, so it is not offered.
    .where(
      and(
        eq(accounts.businessId, ctx.businessId),
        eq(accounts.type, "expense"),
        eq(accounts.subtype, "expense"),
        eq(accounts.isActive, true),
      ),
    );
  const decimals = currencyDecimals(ctx.business.currency);
  const model = env.AI_RECEIPT_MODEL!;

  // Categories are sent as short numbers: small models copy a number reliably but garble long ids.
  const system = [
    "You read receipts and supplier bills for a small shop's bookkeeping.",
    "Reply with one JSON object and nothing else, with these keys:",
    '- "date_as_printed": the purchase date exactly as written on the receipt, without any time, or null',
    '- "payee": the shop or supplier name, or null',
    '- "total": the amount paid including tax, as a plain number, or null',
    '- "tax": the tax or VAT amount printed on the receipt in currency (not the rate), as a plain number; null if no tax amount is printed',
    '- "reference": the receipt or invoice number, or null',
    '- "note": a short summary of what was bought, or null',
    '- "category": the exact name of the closest category from the list. Think about what was bought (fuel, courier, repairs, stationery, utilities), not the shop name. Use null only if none could reasonably fit',
    '- "confidence": "high", "medium" or "low"',
    "Use null when you are not sure. Never guess a number.",
    `Currency: ${ctx.business.currency}.`,
    "Groceries and food go to Miscellaneous Expenses. Fuel, courier and delivery go to Transport & Delivery. Paper and printing supplies go to Office Supplies.",
    "Expense categories:",
    ...categories.map((a) => `- ${a.name}`),
  ].join("\n");

  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        { type: "text", text: "Read this receipt. Reply with only the JSON object described in the system message, no other words." },
        { type: "image_url", image_url: { url: `data:${file.type};base64,${base64}` } },
      ],
    },
  ];

  const reply = modelReply.parse(await chatJson(env, model, messages, "The AI service returned an unreadable result. Enter the details by hand."));
  const amount = reply.total && reply.total > 0 ? toMinor(reply.total, decimals) : null;
  const taxAmount = amount !== null && reply.tax !== null && reply.tax !== undefined && reply.tax >= 0 ? toMinor(reply.tax, decimals) : null;
  const category =
    matchCategory(categories, reply.category) ?? keywordCategory(categories, `${reply.payee ?? ""} ${reply.note ?? ""}`);

  return {
    date: parsePrintedDate(reply.date_as_printed),
    payee: text(reply.payee, 200),
    amount,
    taxAmount: taxAmount !== null && amount !== null && taxAmount <= amount ? taxAmount : null,
    reference: text(reply.reference, 120),
    note: text(reply.note, 1000),
    accountId: category?.id ?? null,
    confidence: reply.confidence,
    model,
  };
}
