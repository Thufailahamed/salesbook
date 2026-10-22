/**
 * In-app help: the model picks the help topics that match a "how do I…" question, and writes a short answer from
 * those topics only. Topics the user cannot use are never shown to the model, and the links come from the topics,
 * not from the model's reply.
 */
import type { HelpAnswer, Permission } from "@shopbooks/shared";
import { z } from "zod";
import type { Env } from "../env";
import type { Ctx } from "../lib/context";
import { badRequest } from "../lib/errors";
import { chatJson, chatText, helpEnabled } from "./ai-gateway";

interface HelpTopic {
  id: string;
  title: string;
  /** Hide the topic from users who lack this permission. Omit for topics everyone may read. */
  permission?: Permission;
  href: string;
  text: string;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "make-sale",
    title: "Make a sale in the POS",
    permission: "pos.sell",
    href: "/pos",
    text: "Open Point of sale. Search by name or scan a barcode, tap a product (choose the size or colour if it has variants), and it goes into the cart. Adjust quantities, add discounts if needed, then pay: cash, card or another method. Split tender is allowed. Change is shown when the cash given is more than the total.",
  },
  {
    id: "credit-sale",
    title: "Sell on credit",
    permission: "pos.sell",
    href: "/pos",
    text: "Choose a customer in the POS first. On the payment step, take part of the payment and allow the rest to go on credit. The unpaid part is added to the customer's balance. Walk-in customers cannot buy on credit. The customer's page shows the balance and the Receive payment button.",
  },
  {
    id: "hold-sale",
    title: "Hold and resume a sale",
    permission: "pos.sell",
    href: "/pos",
    text: "In the POS, use Hold to park the current cart. Resume it from the held list later. Held carts stay on this device for this user and location.",
  },
  {
    id: "returns",
    title: "Return or exchange items",
    permission: "sales.return",
    href: "/sales/returns",
    text: "Open Sales → Returns, or open the invoice and start a return. Pick the items and quantities. Refund to cash or another method, to the customer's store credit, or exchange for other items. The return is posted to the books automatically.",
  },
  {
    id: "void-invoice",
    title: "Void an invoice",
    permission: "sales.void",
    href: "/sales",
    text: "Open the invoice under Sales → Invoices and choose Void. A reason is required. Voiding reverses the sale, its payments and the stock it moved. Use returns for items the customer already took home and has not been refunded for.",
  },
  {
    id: "add-product",
    title: "Add a product",
    permission: "products.manage",
    href: "/products",
    text: "Open Products and choose New product. Enter the name, category, brand, tax rate and selling price. For sizes or colours, turn on variants and fill in the option matrix. Set opening stock per location. Tap Draft with AI beside the description to get a suggestion you can edit.",
  },
  {
    id: "barcode-labels",
    title: "Print barcode labels",
    permission: "products.view",
    href: "/products/labels",
    text: "Open Products → Barcode labels. Choose the products and the number of labels for each, then print. Labels are laid out for A4 sheets.",
  },
  {
    id: "stock-adjust",
    title: "Adjust stock (count, add or remove)",
    permission: "inventory.manage",
    href: "/inventory/adjustments",
    text: "Open Inventory → Adjustments. Pick the location and reason. Use Count to enter what you physically counted, or Add and Remove to change quantities by a set amount. The stock value and the books update together.",
  },
  {
    id: "transfer-stock",
    title: "Move stock between locations",
    permission: "inventory.manage",
    href: "/inventory/transfers",
    text: "Open Inventory → Transfers and create a transfer from one location to another with the products and quantities. Stock leaves the source location when the transfer is sent and arrives at the destination when it is received.",
  },
  {
    id: "check-stock",
    title: "Check stock and what to reorder",
    permission: "inventory.view",
    href: "/inventory",
    text: "Open Inventory. The stock list shows quantities and values by location. The Reorder advice card, using the last 30 days of sales, lists items with less than 14 days of stock and suggests quantities. Nothing is ordered automatically.",
  },
  {
    id: "purchase",
    title: "Buy stock from a supplier",
    permission: "purchases.manage",
    href: "/purchases",
    text: "Open Purchases and create a purchase order for a supplier with the products, quantities and costs. When the goods arrive, Receive the order: stock goes up and the bill is recorded. Pay the supplier from the purchase or from the supplier's page.",
  },
  {
    id: "pay-supplier",
    title: "Pay a supplier",
    permission: "suppliers.manage",
    href: "/suppliers",
    text: "Open the supplier and choose Pay supplier. The payment is allocated to the open bills, oldest first, and recorded in the books. Pay in advance records a credit the supplier holds for you.",
  },
  {
    id: "receive-payment",
    title: "Receive a customer payment",
    permission: "customers.payments",
    href: "/customers",
    text: "Open the customer and choose Receive payment. Enter the amount and method. It is allocated to the open invoices. Receive advance payment records money held as store credit for the customer.",
  },
  {
    id: "reminder",
    title: "Draft a payment reminder",
    permission: "customers.view",
    href: "/customers",
    text: "On a customer or supplier page that still owes money, choose Draft reminder (customers) or Draft message (suppliers). The message is drafted from the open invoices or bills. Edit it, then Copy and send it from your own email or phone. Nothing is sent by ShopBooks.",
  },
  {
    id: "expense",
    title: "Record an expense",
    permission: "expenses.manage",
    href: "/expenses",
    text: "Open Money → Expenses and choose New expense. Pick the category, amount, date, payee and the payment method it was paid from. Scan Receipt can fill the form from a photo of the receipt; check the fields before saving.",
  },
  {
    id: "bank-reconcile",
    title: "Reconcile the bank",
    permission: "accounting.manage",
    href: "/accounting/reconcile",
    text: "Open Accounting → Bank reconciliation and pick the bank account. Enter the statement balance and date, then clear the lines that appear on the statement. Import CSV uploads the statement export and matches its lines to the books. Suggest categories proposes expense categories for lines that are not matched.",
  },
  {
    id: "close-books",
    title: "Close the books for a period",
    permission: "accounting.manage",
    href: "/accounting/close",
    text: "Open Accounting → Period close. Run the review first: it lists duplicate expenses, unmatched bank lines, customer balances over 90 days and other checks. When the review is clean, set the closed-through date. Entries on or before that date cannot be changed.",
  },
  {
    id: "journals",
    title: "Post a manual journal",
    permission: "accounting.manage",
    href: "/accounting/journals",
    text: "Open Accounting → Journals and create a journal entry. Debits and credits must balance. A posted journal can be reversed, which posts the opposite entry and keeps the history.",
  },
  {
    id: "reports",
    title: "Find a report",
    permission: "reports.view",
    href: "/reports",
    text: "Open Reports. It lists sales, profit and loss, balance sheet, cash flow, trial balance, tax, expenses, product, inventory, expiry and dead-stock reports. Choose a period in each report. Ask your books on the Reports page answers simple questions with the numbers used.",
  },
  {
    id: "gift-cards",
    title: "Sell and use gift cards",
    permission: "giftcards.manage",
    href: "/gift-cards",
    text: "Open Money → Gift cards to issue a card with a value. In the POS, pay with a gift card tender to use its balance; a card can be used across several sales until it is empty.",
  },
  {
    id: "shifts",
    title: "Open and close a register shift",
    permission: "registers.use",
    href: "/registers",
    text: "Open Money → Cash registers and open a shift with the cash counted in the drawer. Sales in the POS are recorded against the open shift. Close the shift with the counted cash to get the shift report, which shows the expected and counted cash.",
  },
  {
    id: "numbering",
    title: "Change invoice numbering",
    href: "/settings",
    text: "Open Settings → Numbering to change the prefix and next number for invoices, receipts, purchases and other documents. Numbers already used are not reused.",
  },
  {
    id: "taxes",
    title: "Set up tax rates and payment methods",
    href: "/settings",
    text: "Open Settings. Taxes sets the tax rates products can use, with the name shown on invoices. Payment methods lists the methods the POS and payments use, and each can be linked to a bank or cash account.",
  },
];

const reply = z.object({ topics: z.array(z.string()).nullish().catch(null) });

export async function helpAnswer(ctx: Ctx, env: Env, question: string): Promise<HelpAnswer> {
  if (!helpEnabled(env)) throw badRequest("The help assistant is not configured");
  const topics = HELP_TOPICS.filter((t) => !t.permission || ctx.can(t.permission));
  const notFound: HelpAnswer = {
    answer: "I could not find that in the ShopBooks help. Try different words, or browse the menu on the left.",
    links: [],
  };

  const picked = reply.parse(
    await chatJson(
      env,
      env.AI_HELP_MODEL!,
      [
        {
          role: "system",
          content: [
            "You pick help topics for a shop app. Reply with one JSON object only: {\"topics\": [\"id\", ...]}.",
            "Pick at most 2 ids from the list that answer the question. Use [] if none of them does.",
            ...topics.map((t) => `${t.id}: ${t.title}`),
          ].join("\n"),
        },
        { role: "user", content: question },
      ],
      "The help assistant could not read this question. Browse the menu on the left.",
    ),
  );
  const chosen = topics.filter((t) => picked.topics?.includes(t.id)).slice(0, 2);
  if (chosen.length === 0) return notFound;

  const answer = await chatText(env, env.AI_HELP_MODEL!, [
    {
      role: "system",
      content: [
        "You answer questions about the ShopBooks app for a shop owner.",
        "Use ONLY the help text given. Answer in 2 to 4 short plain sentences, naming the menu items as they appear in the text.",
        "If the help text does not answer the question, say so in one sentence. Do not add steps that are not in the text.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `Question: ${question}\n\n${chosen.map((t) => `${t.title}:\n${t.text}`).join("\n\n")}`,
    },
  ]);

  return {
    answer: answer.trim().slice(0, 1000) || notFound.answer,
    links: chosen
      .filter((t, i) => chosen.findIndex((o) => o.href === t.href) === i)
      .map((t) => ({ label: t.title, href: t.href })),
  };
}
