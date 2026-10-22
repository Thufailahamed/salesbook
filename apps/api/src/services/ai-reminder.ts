/**
 * Payment reminders: the server works out what is owed and how late it is from the open documents; the model only
 * words the message. Nothing is sent. The user copies the text and sends it from their own phone or email.
 */
import { currencyDecimals, daysBetween, toMajor, type ReminderDraft } from "@shopbooks/shared";
import { z } from "zod";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { ApiError, badRequest } from "../lib/errors";
import { chatJson, reminderDraftEnabled } from "./ai-gateway";
import { getCustomer, getSupplier, openBills, openInvoices } from "./payments";

const MAX_DOCS_IN_PROMPT = 10;

const reply = z.object({
  subject: z.string().nullish().catch(null),
  message: z.string().nullish().catch(null),
});

export async function draftReminder(
  ctx: Ctx,
  env: Env,
  kind: "customer" | "supplier",
  partyId: string,
): Promise<ReminderDraft> {
  if (!reminderDraftEnabled(env)) throw badRequest("AI reminder drafts are not configured");
  const isCustomer = kind === "customer";
  const party = isCustomer ? await getCustomer(ctx, partyId) : await getSupplier(ctx, partyId);
  const docs = isCustomer ? await openInvoices(ctx, partyId) : await openBills(ctx, partyId);
  if (docs.length === 0) {
    throw badRequest(isCustomer ? "Nothing is owed by this customer" : "Nothing is owed to this supplier");
  }

  const decimals = currencyDecimals(ctx.business.currency);
  const money = (minor: number) => `${ctx.business.currency} ${toMajor(minor, decimals).toFixed(decimals)}`;
  const rows = docs.map((d) => ({
    number: d.number,
    date: d.date,
    due: d.amountDue,
    daysOverdue: Math.max(0, daysBetween(d.dueDate ?? d.date, ctx.today)),
  }));
  const totalDue = rows.reduce((sum, r) => sum + r.due, 0);
  const overdueCount = rows.filter((r) => r.daysOverdue > 0).length;
  const oldestDaysOverdue = Math.max(0, ...rows.map((r) => r.daysOverdue));

  const facts = [
    `Party: ${party.name}`,
    `Total outstanding: ${money(totalDue)}`,
    `Open documents: ${rows.length}, of which ${overdueCount} overdue`,
    `Oldest overdue: ${oldestDaysOverdue} days`,
    ...rows
      .slice(0, MAX_DOCS_IN_PROMPT)
      .map(
        (r) =>
          `- ${r.number}, dated ${r.date}, ${money(r.due)}, ${r.daysOverdue > 0 ? `${r.daysOverdue} days overdue` : "not yet due"}`,
      ),
  ];
  if (rows.length > MAX_DOCS_IN_PROMPT) facts.push(`- and ${rows.length - MAX_DOCS_IN_PROMPT} more documents`);

  const parsed = reply.parse(
    await chatJson(
      env,
      env.AI_REMINDER_MODEL!,
      [
        {
          role: "system",
          content: [
            isCustomer
              ? "You write a short, polite payment reminder from a shop to one of its customers."
              : "You write a short, polite message from a shop to one of its suppliers about the bills it still has to pay.",
            `Shop name: ${ctx.business.name}.`,
            'Reply with one JSON object only: {"subject": "...", "message": "..."}.',
            "Use ONLY the facts given. Quote the total and the document numbers exactly as given.",
            isCustomer
              ? "Ask them to pay the outstanding amount, or to get in touch if there is a problem with an invoice."
              : "Ask when the outstanding bills can be paid, or to confirm the amount if they disagree.",
            "Do not add late fees, discounts, deadlines, threats, or any date or amount that is not in the facts.",
            "message: 2 to 5 short sentences of plain text. No placeholders such as [name].",
          ].join("\n"),
        },
        { role: "user", content: facts.join("\n") },
      ],
      "The AI service could not draft this message. Write it by hand.",
    ),
  );
  if (!parsed.message?.trim()) throw new ApiError(502, "ai_error", "The AI service could not draft this message. Write it by hand.");

  return {
    partyName: party.name,
    totalDue,
    openCount: rows.length,
    overdueCount,
    oldestDaysOverdue,
    subject: parsed.subject?.trim().slice(0, 200) || `Outstanding balance — ${ctx.business.name}`,
    message: parsed.message.trim().slice(0, 2000),
  };
}
