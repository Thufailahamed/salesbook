"use client";

import Link from "next/link";
import { ArrowUpRight, Boxes, CalendarClock, ChartColumn, FileSpreadsheet, HandCoins, Landmark, Package, PackageX, Percent, Scale, TrendingUp, type LucideIcon, Wallet, WalletCards, Waves } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AskBooks } from "@/components/ask-books";
import { useSession } from "@/hooks/use-session";

type Report = { href: string; label: string; description: string; icon: LucideIcon };

const FEATURED: Report[] = [
  { href: "/reports/sales", label: "Sales summary", description: "Revenue, profit and payment mix.", icon: ChartColumn },
  { href: "/reports/profit-loss", label: "Profit & loss", description: "What the business earned this period.", icon: TrendingUp },
  { href: "/reports/balance-sheet", label: "Balance sheet", description: "Assets, liabilities and equity.", icon: Scale },
];

const GROUPS: { title: string; items: Report[] }[] = [
  {
    title: "Sales",
    items: [
      { href: "/reports/sales", label: "Sales summary", description: "Revenue, profit, payment mix, staff and hours.", icon: ChartColumn },
      { href: "/reports/products", label: "Product performance", description: "Best sellers by quantity, sales and margin.", icon: Package },
    ],
  },
  {
    title: "Financial statements",
    items: [
      { href: "/reports/profit-loss", label: "Profit & loss", description: "Income, cost of sales and expenses for a period.", icon: TrendingUp },
      { href: "/reports/balance-sheet", label: "Balance sheet", description: "Assets, liabilities and equity at a date.", icon: Scale },
      { href: "/reports/cash-flow", label: "Cash flow", description: "Money in and out of cash and bank accounts.", icon: Waves },
      { href: "/reports/trial-balance", label: "Trial balance", description: "Every account's debit and credit balance.", icon: FileSpreadsheet },
      { href: "/reports/tax", label: "Tax report", description: "Output tax vs input tax and what's payable.", icon: Percent },
    ],
  },
  {
    title: "Receivables & payables",
    items: [
      { href: "/reports/receivables", label: "Receivables aging", description: "Who owes you, and for how long.", icon: HandCoins },
      { href: "/reports/payables", label: "Payables aging", description: "What you owe suppliers, and when.", icon: WalletCards },
    ],
  },
  {
    title: "Inventory & costs",
    items: [
      { href: "/reports/inventory", label: "Inventory valuation", description: "Stock quantity and value by item and category.", icon: Boxes },
      { href: "/reports/expiry", label: "Expiry & shelf life", description: "Stock that has expired or is about to.", icon: CalendarClock },
      { href: "/reports/dead-stock", label: "Dead & slow stock", description: "Items that have not sold recently.", icon: PackageX },
      { href: "/reports/expenses", label: "Expense report", description: "Spending by category over time.", icon: Wallet },
    ],
  },
];

export default function ReportsPage() {
  const { can } = useSession();
  return (
    <>
      <PageHeader title="Reports" description="Analytics and financial statements, straight from the ledger." />

      <div className="grid gap-10">
        <AskBooks />
        {/* Featured strip: the three reports most people open first. */}
        <section className="metal relative overflow-hidden rounded-3xl p-6 text-white sm:p-8">
          <p className="eyebrow text-white/50">Start here</p>
          <h2 className="font-display mt-2 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">The three that matter most</h2>
          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {FEATURED.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="group flex items-start gap-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 transition-colors hover:bg-white/[0.11]"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10">
                  <r.icon className="size-[18px] text-highlight" strokeWidth={1.7} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-display text-[15px] font-semibold">
                    {r.label}
                    <ArrowUpRight className="size-4 text-white/30 transition-colors group-hover:text-highlight" />
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-white/55">{r.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {GROUPS.map((g, gi) => (
          <section key={g.title}>
            <div className="mb-4 flex items-center gap-3">
              <span className="font-mono text-[12px] text-muted-foreground">{String(gi + 1).padStart(2, "0")}</span>
              <h2 className="label-caps">{g.title}</h2>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="group relative flex flex-col gap-6 overflow-hidden rounded-3xl bg-card p-6 shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-raised dark:shadow-[inset_0_0_0_1px_var(--border)]"
                >
                  <div className="flex items-start justify-between">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-primary">
                      <i.icon className="size-[19px]" strokeWidth={1.7} />
                    </span>
                    <ArrowUpRight className="size-[18px] text-border-strong transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                  </div>
                  <div>
                    <p className="font-display text-[17px] font-semibold tracking-[-0.01em]">{i.label}</p>
                    <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{i.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {can("accounting.view") && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Landmark className="size-4" /> Need a single account? Open the{" "}
            <Link href="/accounting" className="text-primary hover:underline">
              chart of accounts
            </Link>{" "}
            for its ledger.
          </p>
        )}
      </div>
    </>
  );
}
