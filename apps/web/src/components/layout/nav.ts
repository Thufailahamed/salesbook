import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  ArrowRightLeft,
  Barcode,
  BookOpen,
  Boxes,
  ChartColumn,
  FileText,
  Gift,
  History,
  LayoutDashboard,
  NotebookPen,
  Package,
  PackageMinus,
  Receipt,
  ScrollText,
  Settings,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  Truck,
  Undo2,
  UserCog,
  Users,
  Vault,
  Wallet,
} from "lucide-react";
import type { Permission } from "@shopbooks/shared";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Extra keywords for the command palette */
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view", keywords: ["home", "kpi"] },
      { label: "Point of sale", href: "/pos", icon: ShoppingCart, permission: "pos.sell", keywords: ["pos", "sell", "checkout", "register", "till"] },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Invoices", href: "/sales", icon: Receipt, permission: "sales.view", keywords: ["sales", "bills", "receipts"] },
      { label: "Returns", href: "/sales/returns", icon: Undo2, permission: "sales.view", keywords: ["refund", "credit note", "exchange"] },
      { label: "Quotations", href: "/sales/quotations", icon: FileText, permission: "quotations.manage", keywords: ["estimate", "quote"] },
    ],
  },
  {
    label: "Catalog",
    items: [
      { label: "Products", href: "/products", icon: Package, permission: "products.view", keywords: ["items", "sku", "variants"] },
      { label: "Categories & brands", href: "/products/categories", icon: Tags, permission: "products.manage", keywords: ["units", "brands"] },
      { label: "Barcode labels", href: "/products/labels", icon: Barcode, permission: "products.view", keywords: ["print", "tags", "stickers"] },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Stock", href: "/inventory", icon: Boxes, permission: "inventory.view", keywords: ["levels", "on hand", "valuation"] },
      { label: "Adjustments", href: "/inventory/adjustments", icon: SlidersHorizontal, permission: "inventory.manage", keywords: ["count", "damage", "shrinkage"] },
      { label: "Transfers", href: "/inventory/transfers", icon: ArrowLeftRight, permission: "inventory.manage", keywords: ["move", "branch"] },
      { label: "Movements", href: "/inventory/movements", icon: History, permission: "inventory.view", keywords: ["history", "ledger"] },
    ],
  },
  {
    label: "Contacts",
    items: [
      { label: "Customers", href: "/customers", icon: Users, permission: "customers.view", keywords: ["clients", "khata", "credit"] },
      { label: "Suppliers", href: "/suppliers", icon: Truck, permission: "suppliers.view", keywords: ["vendors"] },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Purchases", href: "/purchases", icon: ShoppingBag, permission: "purchases.view", keywords: ["po", "bills", "receive stock"] },
      { label: "Purchase returns", href: "/purchases/returns", icon: PackageMinus, permission: "purchases.view", keywords: ["debit note"] },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Payments", href: "/payments", icon: ArrowRightLeft, permission: "payments.view", keywords: ["receipts", "transactions"] },
      { label: "Expenses", href: "/expenses", icon: Wallet, permission: "expenses.view", keywords: ["costs", "bills"] },
      { label: "Cash registers", href: "/registers", icon: Vault, permission: "registers.use", keywords: ["shift", "drawer", "z report"] },
      { label: "Gift cards", href: "/gift-cards", icon: Gift, permission: "giftcards.view", keywords: ["voucher"] },
    ],
  },
  {
    label: "Accounting",
    items: [
      { label: "Chart of accounts", href: "/accounting", icon: BookOpen, permission: "accounting.view", keywords: ["ledger", "coa"] },
      { label: "Journals", href: "/accounting/journals", icon: NotebookPen, permission: "accounting.view", keywords: ["journal entries", "gl"] },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: ChartColumn, permission: "reports.view", keywords: ["analytics", "p&l", "balance sheet", "tax"] }],
  },
  {
    label: "Admin",
    items: [
      { label: "Settings", href: "/settings", icon: Settings, permission: "settings.manage", keywords: ["business", "taxes", "receipt"] },
      { label: "Users & roles", href: "/settings/users", icon: UserCog, permission: "users.manage", keywords: ["staff", "team", "permissions"] },
      { label: "Audit log", href: "/settings/audit", icon: ScrollText, permission: "audit.view", keywords: ["activity", "history"] },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

/** Returns the nav item that best matches the pathname (longest segment-aware prefix). */
export function activeNavHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of ALL_NAV_ITEMS) {
    const h = item.href;
    const match = h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`);
    if (match && (!best || h.length > best.length)) best = h;
  }
  return best;
}
