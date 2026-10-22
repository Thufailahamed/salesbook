/* Domain enums, permissions and default chart of accounts. */

export const APP_NAME = "ShopBooks";

// ---------------------------------------------------------------- roles & permissions

export const ROLES = ["owner", "admin", "manager", "cashier", "accountant"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Administrator",
  manager: "Store Manager",
  cashier: "Cashier",
  accountant: "Accountant",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full access to everything, including billing and ownership.",
  admin: "Full access to the business, settings and users.",
  manager: "Runs the store: sales, stock, purchases, customers and reports.",
  cashier: "Sells at the POS, handles returns, customers and their own shift.",
  accountant: "Books, purchases, expenses, payments and financial reports.",
};

const ALL: Role[] = ["owner", "admin", "manager", "cashier", "accountant"];
const MGMT: Role[] = ["owner", "admin", "manager"];
const ADMIN: Role[] = ["owner", "admin"];
const FIN: Role[] = ["owner", "admin", "accountant"];

export const PERMISSIONS = {
  "dashboard.view": ["owner", "admin", "manager", "accountant"],
  "pos.sell": ["owner", "admin", "manager", "cashier"],
  "pos.priceOverride": MGMT,
  "pos.backdate": MGMT,
  "sales.view": ALL,
  "sales.void": MGMT,
  "sales.return": ["owner", "admin", "manager", "cashier"],
  "quotations.manage": ["owner", "admin", "manager", "cashier"],
  "products.view": ALL,
  "products.manage": MGMT,
  "inventory.view": ALL,
  "inventory.manage": MGMT,
  "customers.view": ALL,
  "customers.manage": ["owner", "admin", "manager", "cashier"],
  "customers.payments": ALL,
  "suppliers.view": ["owner", "admin", "manager", "accountant"],
  "suppliers.manage": ["owner", "admin", "manager", "accountant"],
  "purchases.view": ["owner", "admin", "manager", "accountant"],
  "purchases.manage": ["owner", "admin", "manager", "accountant"],
  "expenses.view": ["owner", "admin", "manager", "accountant"],
  "expenses.manage": ["owner", "admin", "manager", "accountant"],
  "payments.view": ["owner", "admin", "manager", "accountant"],
  "registers.use": ["owner", "admin", "manager", "cashier"],
  "registers.viewAll": ["owner", "admin", "manager", "accountant"],
  "giftcards.view": ALL,
  "giftcards.manage": MGMT,
  "accounting.view": FIN,
  "accounting.manage": FIN,
  "reports.view": ["owner", "admin", "manager", "accountant"],
  "settings.manage": ADMIN,
  "users.manage": ADMIN,
  "audit.view": ADMIN,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}

// ---------------------------------------------------------------- catalog & inventory

export const PRODUCT_TYPES = ["standard", "service"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRICE_TIERS = ["retail", "wholesale"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const STOCK_MOVEMENT_TYPES = [
  "opening",
  "purchase",
  "purchase_return",
  "sale",
  "sale_return",
  "adjustment",
  "transfer_in",
  "transfer_out",
  "void",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  opening: "Opening stock",
  purchase: "Purchase",
  purchase_return: "Purchase return",
  sale: "Sale",
  sale_return: "Sale return",
  adjustment: "Adjustment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  void: "Void reversal",
};

export const ADJUSTMENT_REASONS = [
  "opening",
  "count",
  "damage",
  "theft",
  "expired",
  "internal_use",
  "gift",
  "found",
  "correction",
  "other",
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  opening: "Opening stock",
  count: "Stock count",
  damage: "Damaged",
  theft: "Theft / loss",
  expired: "Expired",
  internal_use: "Internal use",
  gift: "Gift / sample",
  found: "Found stock",
  correction: "Correction",
  other: "Other",
};

// ---------------------------------------------------------------- payments

export const PAYMENT_METHOD_TYPES = ["cash", "card", "bank", "mobile", "cheque", "other"] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PAYMENT_METHOD_TYPE_LABELS: Record<PaymentMethodType, string> = {
  cash: "Cash",
  card: "Card",
  bank: "Bank transfer",
  mobile: "Mobile wallet / QR",
  cheque: "Cheque",
  other: "Other",
};

/**
 * How a payment was settled.
 * - method:       real money through a configured payment method (cash, card, bank...)
 * - store_credit: customer's store-credit balance
 * - gift_card:    gift card balance
 * - loyalty:      loyalty points redeemed
 * - credit_note:  a sales-return credit applied to an invoice (exchanges)
 * - supplier_credit: supplier credit applied to a bill
 */
export const TENDERS = ["method", "store_credit", "gift_card", "loyalty", "credit_note", "supplier_credit"] as const;
export type Tender = (typeof TENDERS)[number];

export const TENDER_LABELS: Record<Tender, string> = {
  method: "Payment",
  store_credit: "Store credit",
  gift_card: "Gift card",
  loyalty: "Loyalty points",
  credit_note: "Exchange credit",
  supplier_credit: "Supplier credit",
};

export const PAYMENT_STATUSES = ["paid", "partial", "unpaid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_DIRECTIONS = ["in", "out"] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];

export const PARTY_TYPES = ["customer", "supplier", "none"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

/** What a payment row was created for. */
export const PAYMENT_SOURCES = [
  "sale",
  "invoice_payment",
  "customer_payment",
  "sale_refund",
  "store_credit_refund",
  "purchase",
  "supplier_payment",
  "supplier_refund",
  "gift_card_sale",
] as const;
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

export const ALLOCATION_DOC_TYPES = ["invoice", "sale_return", "purchase", "purchase_return"] as const;
export type AllocationDocType = (typeof ALLOCATION_DOC_TYPES)[number];

// ---------------------------------------------------------------- documents

export const INVOICE_STATUSES = ["completed", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_KINDS = ["sale", "opening_balance"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const QUOTATION_STATUSES = ["draft", "sent", "accepted", "declined", "converted", "expired"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const PURCHASE_STATUSES = ["ordered", "received", "cancelled"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_KINDS = ["purchase", "opening_balance"] as const;
export type PurchaseKind = (typeof PURCHASE_KINDS)[number];

export const REFUND_MODES = ["method", "store_credit"] as const;
export type RefundMode = (typeof REFUND_MODES)[number];

export const PURCHASE_RETURN_SETTLEMENTS = ["credit", "refund"] as const;
export type PurchaseReturnSettlement = (typeof PURCHASE_RETURN_SETTLEMENTS)[number];

export const GIFT_CARD_STATUSES = ["active", "redeemed", "void", "expired"] as const;
export type GiftCardStatus = (typeof GIFT_CARD_STATUSES)[number];

export const SHIFT_STATUSES = ["open", "closed"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const CASH_MOVEMENT_TYPES = ["pay_in", "pay_out"] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export const CUSTOMER_TYPES = ["individual", "business"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

/** Document number sequences, editable in settings. */
export const SEQUENCE_DEFAULTS = {
  invoice: { prefix: "INV-", label: "Sales invoice" },
  sale_return: { prefix: "CN-", label: "Credit note / return" },
  quotation: { prefix: "QT-", label: "Quotation" },
  purchase: { prefix: "PO-", label: "Purchase" },
  purchase_return: { prefix: "DN-", label: "Debit note / purchase return" },
  receipt: { prefix: "RCT-", label: "Payment received" },
  payment: { prefix: "PAY-", label: "Payment made" },
  expense: { prefix: "EXP-", label: "Expense" },
  adjustment: { prefix: "ADJ-", label: "Stock adjustment" },
  transfer: { prefix: "TRF-", label: "Stock transfer" },
  journal: { prefix: "JE-", label: "Journal entry" },
  shift: { prefix: "SH-", label: "Register shift" },
  gift_card: { prefix: "GC", label: "Gift card" },
} as const;
export type SequenceKey = keyof typeof SEQUENCE_DEFAULTS;

// ---------------------------------------------------------------- accounting

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

export const ACCOUNT_SUBTYPES = {
  asset: ["cash", "bank", "receivable", "inventory", "other_current_asset", "fixed_asset"],
  liability: ["payable", "tax", "other_current_liability", "long_term_liability"],
  equity: ["equity"],
  income: ["sales", "contra_revenue", "other_income"],
  expense: ["cogs", "expense"],
} as const satisfies Record<AccountType, readonly string[]>;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[AccountType][number];

export const ACCOUNT_SUBTYPE_LABELS: Record<AccountSubtype, string> = {
  cash: "Cash",
  bank: "Bank & clearing",
  receivable: "Receivables",
  inventory: "Inventory",
  other_current_asset: "Other current asset",
  fixed_asset: "Fixed asset",
  payable: "Payables",
  tax: "Tax",
  other_current_liability: "Other current liability",
  long_term_liability: "Long-term liability",
  equity: "Equity",
  sales: "Sales",
  contra_revenue: "Returns & discounts",
  other_income: "Other income",
  cogs: "Cost of sales",
  expense: "Operating expense",
};

/** Debit-normal: assets, expenses and contra-revenue. */
export function isDebitNormal(type: AccountType, subtype?: string | null): boolean {
  return type === "asset" || type === "expense" || subtype === "contra_revenue";
}

export const SYSTEM_ACCOUNTS = {
  cash: { code: "1000", name: "Cash on Hand", type: "asset", subtype: "cash" },
  bank: { code: "1010", name: "Bank Account", type: "asset", subtype: "bank" },
  card_clearing: { code: "1020", name: "Card Payments Clearing", type: "asset", subtype: "bank" },
  mobile_clearing: { code: "1030", name: "Mobile Wallet", type: "asset", subtype: "bank" },
  receivable: { code: "1100", name: "Accounts Receivable", type: "asset", subtype: "receivable" },
  inventory: { code: "1200", name: "Inventory", type: "asset", subtype: "inventory" },
  input_tax: { code: "1300", name: "Input Tax Recoverable", type: "asset", subtype: "other_current_asset" },
  supplier_advances: { code: "1350", name: "Supplier Advances & Credits", type: "asset", subtype: "other_current_asset" },
  payable: { code: "2000", name: "Accounts Payable", type: "liability", subtype: "payable" },
  output_tax: { code: "2100", name: "Sales Tax Payable", type: "liability", subtype: "tax" },
  store_credit: { code: "2200", name: "Customer Store Credit", type: "liability", subtype: "other_current_liability" },
  gift_card: { code: "2300", name: "Gift Card Liability", type: "liability", subtype: "other_current_liability" },
  capital: { code: "3000", name: "Owner's Capital", type: "equity", subtype: "equity" },
  drawings: { code: "3100", name: "Owner's Drawings", type: "equity", subtype: "equity" },
  retained_earnings: { code: "3200", name: "Retained Earnings", type: "equity", subtype: "equity" },
  opening_equity: { code: "3900", name: "Opening Balance Equity", type: "equity", subtype: "equity" },
  sales: { code: "4000", name: "Sales Revenue", type: "income", subtype: "sales" },
  sales_returns: { code: "4010", name: "Sales Returns", type: "income", subtype: "contra_revenue" },
  discounts: { code: "4020", name: "Loyalty Redemptions & Discounts", type: "income", subtype: "contra_revenue" },
  other_income: { code: "4100", name: "Other Income", type: "income", subtype: "other_income" },
  rounding: { code: "4900", name: "Rounding Adjustments", type: "income", subtype: "other_income" },
  cogs: { code: "5000", name: "Cost of Goods Sold", type: "expense", subtype: "cogs" },
  inventory_adjustments: { code: "5100", name: "Inventory Adjustments & Shrinkage", type: "expense", subtype: "cogs" },
  marketing: { code: "6030", name: "Marketing & Promotions", type: "expense", subtype: "expense" },
  cash_over_short: { code: "6900", name: "Cash Over / Short", type: "expense", subtype: "expense" },
} as const satisfies Record<string, { code: string; name: string; type: AccountType; subtype: AccountSubtype }>;

export type SystemAccountKey = keyof typeof SYSTEM_ACCOUNTS;

/** Non-system accounts seeded for every new business. */
export const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType; subtype: AccountSubtype }[] = [
  { code: "1400", name: "Prepaid Expenses", type: "asset", subtype: "other_current_asset" },
  { code: "1500", name: "Furniture & Equipment", type: "asset", subtype: "fixed_asset" },
  { code: "2400", name: "Loans Payable", type: "liability", subtype: "long_term_liability" },
  { code: "2500", name: "Accrued Expenses", type: "liability", subtype: "other_current_liability" },
  { code: "6000", name: "Rent", type: "expense", subtype: "expense" },
  { code: "6010", name: "Salaries & Wages", type: "expense", subtype: "expense" },
  { code: "6020", name: "Utilities", type: "expense", subtype: "expense" },
  { code: "6040", name: "Transport & Delivery", type: "expense", subtype: "expense" },
  { code: "6050", name: "Repairs & Maintenance", type: "expense", subtype: "expense" },
  { code: "6060", name: "Bank & Card Fees", type: "expense", subtype: "expense" },
  { code: "6070", name: "Office Supplies", type: "expense", subtype: "expense" },
  { code: "6080", name: "Packaging", type: "expense", subtype: "expense" },
  { code: "6090", name: "Telephone & Internet", type: "expense", subtype: "expense" },
  { code: "6100", name: "Insurance", type: "expense", subtype: "expense" },
  { code: "6110", name: "Professional Fees", type: "expense", subtype: "expense" },
  { code: "6120", name: "Staff Welfare", type: "expense", subtype: "expense" },
  { code: "6200", name: "Miscellaneous Expenses", type: "expense", subtype: "expense" },
];

/** Default payment methods created for every new business and the system account each settles into. */
export const DEFAULT_PAYMENT_METHODS: { name: string; type: PaymentMethodType; account: SystemAccountKey }[] = [
  { name: "Cash", type: "cash", account: "cash" },
  { name: "Card", type: "card", account: "card_clearing" },
  { name: "Bank Transfer", type: "bank", account: "bank" },
  { name: "Mobile / QR", type: "mobile", account: "mobile_clearing" },
  { name: "Cheque", type: "cheque", account: "bank" },
];

export const PAYMENT_TYPE_DEFAULT_ACCOUNT: Record<PaymentMethodType, SystemAccountKey> = {
  cash: "cash",
  card: "card_clearing",
  bank: "bank",
  mobile: "mobile_clearing",
  cheque: "bank",
  other: "bank",
};

export const JOURNAL_SOURCE_TYPES = [
  "invoice",
  "invoice_void",
  "sale_return",
  "payment",
  "payment_void",
  "purchase",
  "purchase_return",
  "expense",
  "expense_void",
  "adjustment",
  "shift",
  "cash_movement",
  "gift_card",
  "opening_balance",
  "manual",
  "transfer",
  "reversal",
] as const;
export type JournalSourceType = (typeof JOURNAL_SOURCE_TYPES)[number];

// ---------------------------------------------------------------- misc

export const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "INR", name: "Indian Rupee" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "NPR", name: "Nepalese Rupee" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "THB", name: "Thai Baht" },
  { code: "VND", name: "Vietnamese Dong" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "ZAR", name: "South African Rand" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
] as const;

export const WALK_IN_CUSTOMER_NAME = "Walk-in customer";

/** Free signup on a paid plan starts a trial of this many days; the shop then pays from Settings → Subscription. */
export const TRIAL_DAYS = 14;

/** AI features a business can switch off in Settings. The server must also have each feature's model configured. */
export const AI_FEATURES = [
  "receiptScan",
  "ask",
  "bankSuggest",
  "productSearch",
  "productDraft",
  "reminderDraft",
  "help",
  "cashForecast",
  "salesReview",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
