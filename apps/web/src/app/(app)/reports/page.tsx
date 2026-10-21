"use client";

import Link from "next/link";
import { Boxes, CalendarClock, ChartColumn, FileSpreadsheet, HandCoins, Landmark, Package, PackageX, Percent, Scale, TrendingUp, type LucideIcon, Wallet, WalletCards, Waves } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useSession } from "@/hooks/use-session";

const GROUPS: { title: string; items: { href: string; label: string; description: string; icon: LucideIcon }[] }[] = [
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
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="label-caps mb-3">{g.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="group flex gap-4 rounded-2xl bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised dark:shadow-[inset_0_0_0_1px_var(--border)]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                    <i.icon className="size-[18px]" strokeWidth={1.7} />
                  </span>
                  <span>
                    <span className="block font-display text-[16px] font-semibold tracking-[-0.02em]">{i.label}</span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">{i.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
        {can("accounting.view") && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Landmark className="size-4" /> Need a single account? Open the{" "}
            <Link href="/accounting" className="text-primary hover:underline">chart of accounts</Link> for its ledger.
          </p>
        )}
      </div>
    </>
  );
}
