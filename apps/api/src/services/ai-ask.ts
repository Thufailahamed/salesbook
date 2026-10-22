/**
 * "Ask your books": the model picks one read-only report tool and its arguments, the server runs the existing
 * report service, and the model writes the answer from those numbers. The model never runs SQL or computes totals.
 */
import { currencyDecimals, toMajor } from "@shopbooks/shared";
import type { AiAnswer } from "@shopbooks/shared";
import { z } from "zod";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { chatJson, chatText, askEnabled, type ChatMessage } from "./ai-gateway";
import { expenseReport, payablesAging, profitLoss, receivablesAging } from "./reports-finance";
import { productSales, salesTotals } from "./reports-sales";
import { expiryReport } from "./reports-stock";
import { reportRange } from "./reports-utils";

const MAX_DATA_CHARS = 6000;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const period = z.object({ from: isoDate.optional(), to: isoDate.optional() });

interface Tool {
  name: string;
  description: string;
  /** Shown to the model, e.g. "from?, to? (YYYY-MM-DD)". Keeps the model's arguments in a known shape. */
  argsHelp: string;
  args: z.ZodType;
  run(ctx: Ctx, args: never): Promise<Record<string, unknown>>;
}

function tool<T extends z.ZodType>(t: {
  name: string;
  description: string;
  argsHelp: string;
  args: T;
  run: (ctx: Ctx, args: z.output<T>) => Promise<Record<string, unknown>>;
}): Tool {
  return t as unknown as Tool;
}

const money = (ctx: Ctx, minor: number) => toMajor(minor, currencyDecimals(ctx.business.currency));

const TOOLS: Tool[] = [
  tool({
    name: "sales_summary",
    description: "Sales for a period: invoices, net sales, gross profit, tax, discounts and returns.",
    argsHelp: "from?, to? (YYYY-MM-DD). Default: this month to date.",
    args: period,
    run: async (ctx, a) => {
      const r = reportRange(ctx, a);
      const t = await salesTotals(ctx, { from: r.from, to: r.to });
      return {
        period: r,
        invoices: t.invoices,
        netSales: money(ctx, t.netSales),
        grossProfit: money(ctx, t.grossProfit),
        tax: money(ctx, t.tax),
        discounts: money(ctx, t.discount),
        returns: money(ctx, t.returnsTotal),
        returnCount: t.returnsCount,
      };
    },
  }),
  tool({
    name: "top_products",
    description: "Best-selling products for a period, by net sales.",
    argsHelp: "from?, to? (YYYY-MM-DD), limit? (1-20, default 5). Default: this month to date.",
    args: period.extend({ limit: z.number().int().min(1).max(20).optional() }),
    run: async (ctx, a) => {
      const r = reportRange(ctx, a);
      const rows = await productSales(ctx, { from: r.from, to: r.to, limit: a.limit ?? 5 });
      return {
        period: r,
        products: [...rows]
          .sort((x, y) => y.netSales - x.netSales)
          .slice(0, a.limit ?? 5)
          .map((p) => ({ name: p.name, quantity: p.quantity, netSales: money(ctx, p.netSales), profit: money(ctx, p.profit) })),
      };
    },
  }),
  tool({
    name: "profit_and_loss",
    description: "Profit and loss for a period: revenue, cost of sales, gross profit, expenses and net profit.",
    argsHelp: "from?, to? (YYYY-MM-DD). Default: this month to date.",
    args: period,
    run: async (ctx, a) => {
      const r = reportRange(ctx, a);
      const p = await profitLoss(ctx, { from: r.from, to: r.to });
      return {
        period: r,
        netRevenue: money(ctx, p.netRevenue),
        costOfSales: money(ctx, p.totalCostOfSales),
        grossProfit: money(ctx, p.grossProfit),
        expenses: money(ctx, p.totalExpenses),
        netProfit: money(ctx, p.netProfit),
      };
    },
  }),
  tool({
    name: "expenses",
    description: "Expenses for a period in total and by category.",
    argsHelp: "from?, to? (YYYY-MM-DD). Default: this month to date.",
    args: period,
    run: async (ctx, a) => {
      const r = reportRange(ctx, a);
      const e = await expenseReport(ctx, { from: r.from, to: r.to }, "month");
      return {
        period: r,
        total: money(ctx, e.total),
        byCategory: [...e.byAccount]
          .sort((x, y) => y.amount - x.amount)
          .slice(0, 8)
          .map((c) => ({ category: c.name, amount: money(ctx, c.amount), count: c.count })),
      };
    },
  }),
  tool({
    name: "receivables",
    description: "Money customers owe the shop as of a date, in total and the largest balances.",
    argsHelp: "asOf? (YYYY-MM-DD). Default: today.",
    args: z.object({ asOf: isoDate.optional() }),
    run: async (ctx, a) => {
      const asOf = a.asOf ?? ctx.today;
      const r = await receivablesAging(ctx, asOf);
      return {
        asOf,
        total: money(ctx, r.totals.total),
        overdue30: money(ctx, r.totals.d1_30 + r.totals.d31_60 + r.totals.d61_90 + r.totals.d90plus),
        largest: [...r.rows]
          .sort((x, y) => y.total - x.total)
          .slice(0, 5)
          .map((row) => ({ customer: row.name, owed: money(ctx, row.total) })),
      };
    },
  }),
  tool({
    name: "payables",
    description: "Money the shop owes suppliers as of a date, in total and the largest balances.",
    argsHelp: "asOf? (YYYY-MM-DD). Default: today.",
    args: z.object({ asOf: isoDate.optional() }),
    run: async (ctx, a) => {
      const asOf = a.asOf ?? ctx.today;
      const r = await payablesAging(ctx, asOf);
      return {
        asOf,
        total: money(ctx, r.totals.total),
        overdue30: money(ctx, r.totals.d1_30 + r.totals.d31_60 + r.totals.d61_90 + r.totals.d90plus),
        largest: [...r.rows]
          .sort((x, y) => y.total - x.total)
          .slice(0, 5)
          .map((row) => ({ supplier: row.name, owed: money(ctx, row.total) })),
      };
    },
  }),
  tool({
    name: "expiring_stock",
    description: "Stock that has expired or will expire soon, as counts and values.",
    argsHelp: "days? (1-365, default 30) — how far ahead to look.",
    args: z.object({ days: z.number().int().min(1).max(365).optional() }),
    run: async (ctx, a) => {
      const days = a.days ?? 30;
      const e = await expiryReport(ctx, { days });
      return {
        withinDays: days,
        expiredCount: e.expiredCount,
        expiredValue: money(ctx, e.expiredValue),
        expiringCount: e.expiringCount,
        expiringValue: money(ctx, e.expiringValue),
      };
    },
  }),
];

const planReply = z.object({ tool: z.string().nullish(), args: z.record(z.string(), z.unknown()).nullish() });

const NOTHING_TO_ANSWER =
  "I can't answer that from your books yet. Try asking about sales, top products, profit, expenses, what customers or suppliers owe, or expiring stock.";

export async function askBooks(ctx: Ctx, env: Env, question: string): Promise<AiAnswer> {
  if (!askEnabled(env)) throw badRequest("AI questions are not configured");
  const model = env.AI_ASK_MODEL!;
  const currency = ctx.business.currency;

  const catalogue = TOOLS.map((t) => `- ${t.name}: ${t.description} Args: ${t.argsHelp}`).join("\n");
  const plan = await chatJson(env, model, [
    {
      role: "system",
      content: [
        "You answer questions about one shop's books. You do not calculate anything: you pick ONE report tool and its arguments, and the app runs it.",
        `Today is ${ctx.today}. Currency: ${currency}.`,
        "Tools:",
        catalogue,
        'Reply with one JSON object only: {"tool": "<tool name>", "args": {...}}.',
        'Use "tool": null only if no tool can answer the question. Leave out arguments you do not need.',
      ].join("\n"),
    },
    { role: "user", content: question },
  ] satisfies ChatMessage[], "The AI service could not work out what to look up. Try asking in a different way.");

  const picked = planReply.parse(plan);
  const selected = TOOLS.find((t) => t.name === picked.tool);
  if (!selected) return { answer: NOTHING_TO_ANSWER, tool: null, data: null };

  const parsed = selected.args.safeParse(picked.args ?? {});
  const data = await selected.run(ctx, (parsed.success ? parsed.data : {}) as never);
  const dataText = JSON.stringify(data).slice(0, MAX_DATA_CHARS);

  const answer = await chatText(env, model, [
    {
      role: "system",
      content: [
        "You answer a shop owner's question using ONLY the data provided.",
        `Money values are already in ${currency}. Write amounts as ${currency} with two decimals.`,
        "Reply in 1-3 short plain sentences. Name the period the numbers cover. Do not comment on the period or whether it is a full month.",
        "If the data does not answer the question, say so. Never invent numbers.",
      ].join("\n"),
    },
    { role: "user", content: `Question: ${question}\n\nData from the "${selected.name}" report:\n${dataText}` },
  ]);

  return { answer: answer || NOTHING_TO_ANSWER, tool: selected.name, data };
}
