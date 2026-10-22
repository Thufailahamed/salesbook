import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/*
 * D1 (SQLite) schema.
 * - Every tenant-owned row carries business_id.
 * - Money: INTEGER minor units. Quantities: REAL (3 dp). Timestamps: epoch ms. Dates: TEXT YYYY-MM-DD (business tz).
 * - Referential integrity is enforced in application code (D1 batches are ordered, FKs would complicate them).
 */

const id = () => text("id").primaryKey();
const businessId = () => text("business_id").notNull();
const createdAt = () => integer("created_at").notNull();
const money = (name: string) => integer(name).notNull().default(0);
const bool = (name: string, def = false) => integer(name, { mode: "boolean" }).notNull().default(def);

// ---------------------------------------------------------------- tenancy & auth

export const businesses = sqliteTable("businesses", {
  id: id(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  city: text("city"),
  country: text("country"),
  taxNumber: text("tax_number"),
  currency: text("currency").notNull().default("USD"),
  locale: text("locale").notNull().default("en-US"),
  timezone: text("timezone").notNull().default("UTC"),
  logoUrl: text("logo_url"),
  taxInclusive: bool("tax_inclusive", true),
  allowNegativeStock: bool("allow_negative_stock", false),
  requireShift: bool("require_shift", false),
  /** JSON array of AI feature keys this business has switched off. */
  aiDisabled: text("ai_disabled").notNull().default("[]"),
  roundingIncrement: integer("rounding_increment").notNull().default(0),
  lowStockThreshold: real("low_stock_threshold").notNull().default(5),
  defaultTaxRateId: text("default_tax_rate_id"),
  invoiceFooter: text("invoice_footer"),
  receiptFooter: text("receipt_footer"),
  invoiceTerms: text("invoice_terms"),
  receiptWidth: text("receipt_width").notNull().default("80mm"),
  loyaltyEnabled: bool("loyalty_enabled", false),
  loyaltyEarnPer: integer("loyalty_earn_per").notNull().default(10000),
  loyaltyPointValue: integer("loyalty_point_value").notNull().default(100),
  loyaltyMinRedeem: integer("loyalty_min_redeem").notNull().default(0),
  returnWindowDays: integer("return_window_days").notNull().default(30),
  creditDueDays: integer("credit_due_days").notNull().default(30),
  /** Entries dated on or before this day are locked (null = books open). */
  booksClosedThrough: text("books_closed_through"),
  /** active | suspended (set by the platform admin) */
  status: text("status").notNull().default("active"),
  /** Subscribed plan; null for shops created before plans existed (never expire). */
  planId: text("plan_id"),
  /** Epoch ms the paid period ends; null = no expiry. */
  subscriptionEndsAt: integer("subscription_ends_at"),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    defaultLocationId: text("default_location_id"),
    isActive: bool("is_active", true),
    lastLoginAt: integer("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_business_idx").on(t.businessId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 hash of the session token */
    id: id(),
    userId: text("user_id").notNull(),
    businessId: businessId(),
    expiresAt: integer("expires_at").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const locations = sqliteTable(
  "locations",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    code: text("code"),
    address: text("address"),
    phone: text("phone"),
    isDefault: bool("is_default"),
    isActive: bool("is_active", true),
    createdAt: createdAt(),
  },
  (t) => [index("locations_business_idx").on(t.businessId)],
);

export const taxRates = sqliteTable(
  "tax_rates",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    rate: real("rate").notNull(),
    isDefault: bool("is_default"),
    isActive: bool("is_active", true),
    createdAt: createdAt(),
  },
  (t) => [index("tax_rates_business_idx").on(t.businessId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    businessId: businessId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    subtype: text("subtype").notNull(),
    systemKey: text("system_key"),
    isSystem: bool("is_system"),
    isActive: bool("is_active", true),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("accounts_code_uq").on(t.businessId, t.code),
    index("accounts_system_idx").on(t.businessId, t.systemKey),
  ],
);

export const paymentMethods = sqliteTable(
  "payment_methods",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    accountId: text("account_id").notNull(),
    isActive: bool("is_active", true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("payment_methods_business_idx").on(t.businessId)],
);

export const sequences = sqliteTable(
  "sequences",
  {
    businessId: businessId(),
    key: text("key").notNull(),
    prefix: text("prefix").notNull(),
    nextValue: integer("next_value").notNull().default(1),
    padding: integer("padding").notNull().default(5),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.key] })],
);

// ---------------------------------------------------------------- catalog

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    color: text("color"),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [index("categories_business_idx").on(t.businessId)],
);

export const brands = sqliteTable(
  "brands",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("brands_business_idx").on(t.businessId)],
);

export const units = sqliteTable(
  "units",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    allowDecimal: bool("allow_decimal"),
    createdAt: createdAt(),
  },
  (t) => [index("units_business_idx").on(t.businessId)],
);

export const products = sqliteTable(
  "products",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type").notNull().default("standard"),
    categoryId: text("category_id"),
    brandId: text("brand_id"),
    unitId: text("unit_id"),
    taxRateId: text("tax_rate_id"),
    trackInventory: bool("track_inventory", true),
    hasVariants: bool("has_variants"),
    options: text("options", { mode: "json" }).$type<{ name: string; values: string[] }[]>().notNull().default([]),
    imageUrl: text("image_url"),
    tags: text("tags"),
    isActive: bool("is_active", true),
    createdAt: createdAt(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("products_business_idx").on(t.businessId, t.isActive),
    index("products_category_idx").on(t.businessId, t.categoryId),
  ],
);

export const variants = sqliteTable(
  "variants",
  {
    id: id(),
    businessId: businessId(),
    productId: text("product_id").notNull(),
    name: text("name").notNull().default(""),
    options: text("options", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
    sku: text("sku"),
    barcode: text("barcode"),
    price: money("price"),
    wholesalePrice: integer("wholesale_price"),
    costPrice: money("cost_price"),
    mrp: integer("mrp"),
    reorderLevel: real("reorder_level"),
    isActive: bool("is_active", true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("variants_product_idx").on(t.productId),
    index("variants_sku_idx").on(t.businessId, t.sku),
    index("variants_barcode_idx").on(t.businessId, t.barcode),
  ],
);

export const stockLevels = sqliteTable(
  "stock_levels",
  {
    businessId: businessId(),
    variantId: text("variant_id").notNull(),
    locationId: text("location_id").notNull(),
    quantity: real("quantity").notNull().default(0),
    /** Inventory value at cost held at this location (minor units). Equals the Inventory ledger when summed. */
    value: money("value"),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.locationId] }),
    index("stock_levels_business_idx").on(t.businessId, t.locationId),
  ],
);

/**
 * Expiry lots: how much of a variant's stock at a location carries each expiry date. The lots of a location
 * always add up to its stock_levels quantity. Sales and transfers take the earliest expiry first (FEFO).
 */
export const stockLots = sqliteTable(
  "stock_lots",
  {
    businessId: businessId(),
    variantId: text("variant_id").notNull(),
    locationId: text("location_id").notNull(),
    /** YYYY-MM-DD, or "" when no expiry date was recorded (sorts last). */
    expiryDate: text("expiry_date").notNull().default(""),
    quantity: real("quantity").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.locationId, t.expiryDate] }),
    index("stock_lots_business_idx").on(t.businessId, t.locationId),
  ],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: id(),
    businessId: businessId(),
    variantId: text("variant_id").notNull(),
    productId: text("product_id").notNull(),
    locationId: text("location_id").notNull(),
    type: text("type").notNull(),
    quantity: real("quantity").notNull(),
    unitCost: money("unit_cost"),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    referenceNumber: text("reference_number"),
    note: text("note"),
    date: text("date").notNull(),
    userId: text("user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movements_variant_idx").on(t.variantId, t.createdAt),
    index("stock_movements_business_idx").on(t.businessId, t.date),
    index("stock_movements_ref_idx").on(t.referenceType, t.referenceId),
  ],
);

export const stockAdjustments = sqliteTable(
  "stock_adjustments",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    locationId: text("location_id").notNull(),
    date: text("date").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    totalValue: money("total_value"),
    lineCount: integer("line_count").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("stock_adjustments_business_idx").on(t.businessId, t.date)],
);

export const stockAdjustmentLines = sqliteTable(
  "stock_adjustment_lines",
  {
    id: id(),
    adjustmentId: text("adjustment_id").notNull(),
    businessId: businessId(),
    variantId: text("variant_id").notNull(),
    quantityBefore: real("quantity_before").notNull().default(0),
    quantity: real("quantity").notNull(),
    unitCost: money("unit_cost"),
    value: money("value"),
  },
  (t) => [index("stock_adjustment_lines_adj_idx").on(t.adjustmentId)],
);

export const stockTransfers = sqliteTable(
  "stock_transfers",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    fromLocationId: text("from_location_id").notNull(),
    toLocationId: text("to_location_id").notNull(),
    date: text("date").notNull(),
    note: text("note"),
    itemCount: integer("item_count").notNull().default(0),
    totalQuantity: real("total_quantity").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("stock_transfers_business_idx").on(t.businessId, t.date)],
);

export const stockTransferLines = sqliteTable(
  "stock_transfer_lines",
  {
    id: id(),
    transferId: text("transfer_id").notNull(),
    businessId: businessId(),
    variantId: text("variant_id").notNull(),
    quantity: real("quantity").notNull(),
  },
  (t) => [index("stock_transfer_lines_transfer_idx").on(t.transferId)],
);

// ---------------------------------------------------------------- parties

export const customers = sqliteTable(
  "customers",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    taxNumber: text("tax_number"),
    type: text("type").notNull().default("individual"),
    priceTier: text("price_tier").notNull().default("retail"),
    allowCredit: bool("allow_credit", true),
    creditLimit: money("credit_limit"),
    dueBalance: money("due_balance"),
    creditBalance: money("credit_balance"),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    birthday: text("birthday"),
    notes: text("notes"),
    isActive: bool("is_active", true),
    totalSpent: money("total_spent"),
    invoiceCount: integer("invoice_count").notNull().default(0),
    lastPurchaseAt: integer("last_purchase_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("customers_business_idx").on(t.businessId, t.name),
    index("customers_phone_idx").on(t.businessId, t.phone),
  ],
);

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    taxNumber: text("tax_number"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(0),
    dueBalance: money("due_balance"),
    creditBalance: money("credit_balance"),
    notes: text("notes"),
    isActive: bool("is_active", true),
    totalPurchased: money("total_purchased"),
    lastPurchaseAt: integer("last_purchase_at"),
    createdAt: createdAt(),
  },
  (t) => [index("suppliers_business_idx").on(t.businessId, t.name)],
);

// ---------------------------------------------------------------- sales

export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    kind: text("kind").notNull().default("sale"),
    date: text("date").notNull(),
    dueDate: text("due_date"),
    status: text("status").notNull().default("completed"),
    paymentStatus: text("payment_status").notNull().default("paid"),
    locationId: text("location_id").notNull(),
    customerId: text("customer_id"),
    customerName: text("customer_name"),
    salespersonId: text("salesperson_id"),
    shiftId: text("shift_id"),
    priceTier: text("price_tier").notNull().default("retail"),
    taxInclusive: bool("tax_inclusive", true),
    subtotal: money("subtotal"),
    itemDiscount: money("item_discount"),
    docDiscountType: text("doc_discount_type"),
    docDiscountValue: real("doc_discount_value"),
    docDiscount: money("doc_discount"),
    discountTotal: money("discount_total"),
    netTotal: money("net_total"),
    taxTotal: money("tax_total"),
    shipping: money("shipping"),
    roundOff: money("round_off"),
    total: money("total"),
    amountPaid: money("amount_paid"),
    amountDue: money("amount_due"),
    amountReturned: money("amount_returned"),
    costTotal: money("cost_total"),
    pointsEarned: integer("points_earned").notNull().default(0),
    pointsRedeemed: integer("points_redeemed").notNull().default(0),
    itemCount: real("item_count").notNull().default(0),
    note: text("note"),
    quotationId: text("quotation_id"),
    exchangeReturnId: text("exchange_return_id"),
    voidReason: text("void_reason"),
    voidedAt: integer("voided_at"),
    voidedBy: text("voided_by"),
    /** Idempotency key from the POS (offline sales are retried until acknowledged) */
    clientRef: text("client_ref"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_client_ref_uq").on(t.businessId, t.clientRef),
    uniqueIndex("invoices_number_uq").on(t.businessId, t.number),
    index("invoices_date_idx").on(t.businessId, t.date),
    index("invoices_customer_idx").on(t.businessId, t.customerId, t.date),
    index("invoices_due_idx").on(t.businessId, t.amountDue),
    index("invoices_shift_idx").on(t.shiftId),
  ],
);

export const invoiceLines = sqliteTable(
  "invoice_lines",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull(),
    businessId: businessId(),
    variantId: text("variant_id"),
    productId: text("product_id"),
    categoryId: text("category_id"),
    name: text("name").notNull(),
    sku: text("sku"),
    quantity: real("quantity").notNull(),
    unitPrice: money("unit_price"),
    discountType: text("discount_type"),
    discountValue: real("discount_value"),
    lineDiscount: money("line_discount"),
    docDiscount: money("doc_discount"),
    taxRate: real("tax_rate").notNull().default(0),
    net: money("net"),
    tax: money("tax"),
    total: money("total"),
    unitCost: money("unit_cost"),
    /** Cost of goods sold for this line (exact ledger amount, minor units). */
    costAmount: money("cost_amount"),
    /** Cost already returned to stock or written off, so later returns take the exact remainder. */
    costReturned: money("cost_returned"),
    quantityReturned: real("quantity_returned").notNull().default(0),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    date: text("date").notNull(),
  },
  (t) => [
    index("invoice_lines_invoice_idx").on(t.invoiceId),
    index("invoice_lines_variant_idx").on(t.businessId, t.variantId),
    index("invoice_lines_date_idx").on(t.businessId, t.date),
  ],
);

export const saleReturns = sqliteTable(
  "sale_returns",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    date: text("date").notNull(),
    invoiceId: text("invoice_id").notNull(),
    customerId: text("customer_id"),
    locationId: text("location_id").notNull(),
    shiftId: text("shift_id"),
    reason: text("reason"),
    netTotal: money("net_total"),
    taxTotal: money("tax_total"),
    total: money("total"),
    costTotal: money("cost_total"),
    appliedToInvoice: money("applied_to_invoice"),
    refunded: money("refunded"),
    toStoreCredit: money("to_store_credit"),
    appliedToExchange: money("applied_to_exchange"),
    exchangeInvoiceId: text("exchange_invoice_id"),
    pointsReversed: integer("points_reversed").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sale_returns_number_uq").on(t.businessId, t.number),
    index("sale_returns_date_idx").on(t.businessId, t.date),
    index("sale_returns_invoice_idx").on(t.invoiceId),
  ],
);

export const saleReturnLines = sqliteTable(
  "sale_return_lines",
  {
    id: id(),
    returnId: text("return_id").notNull(),
    businessId: businessId(),
    invoiceLineId: text("invoice_line_id").notNull(),
    variantId: text("variant_id"),
    productId: text("product_id"),
    categoryId: text("category_id"),
    name: text("name").notNull(),
    sku: text("sku"),
    quantity: real("quantity").notNull(),
    unitPrice: money("unit_price"),
    net: money("net"),
    tax: money("tax"),
    total: money("total"),
    unitCost: money("unit_cost"),
    /** Cost of the returned goods (exact ledger amount, minor units). */
    costAmount: money("cost_amount"),
    restock: bool("restock", true),
    date: text("date").notNull(),
  },
  (t) => [
    index("sale_return_lines_return_idx").on(t.returnId),
    index("sale_return_lines_date_idx").on(t.businessId, t.date),
  ],
);

export const quotations = sqliteTable(
  "quotations",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    date: text("date").notNull(),
    validUntil: text("valid_until"),
    status: text("status").notNull().default("draft"),
    customerId: text("customer_id"),
    customerName: text("customer_name"),
    locationId: text("location_id").notNull(),
    taxInclusive: bool("tax_inclusive", true),
    subtotal: money("subtotal"),
    docDiscountType: text("doc_discount_type"),
    docDiscountValue: real("doc_discount_value"),
    discountTotal: money("discount_total"),
    netTotal: money("net_total"),
    taxTotal: money("tax_total"),
    shipping: money("shipping"),
    total: money("total"),
    itemCount: real("item_count").notNull().default(0),
    notes: text("notes"),
    terms: text("terms"),
    convertedInvoiceId: text("converted_invoice_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("quotations_number_uq").on(t.businessId, t.number),
    index("quotations_date_idx").on(t.businessId, t.date),
  ],
);

export const quotationLines = sqliteTable(
  "quotation_lines",
  {
    id: id(),
    quotationId: text("quotation_id").notNull(),
    businessId: businessId(),
    variantId: text("variant_id"),
    name: text("name").notNull(),
    sku: text("sku"),
    quantity: real("quantity").notNull(),
    unitPrice: money("unit_price"),
    discountType: text("discount_type"),
    discountValue: real("discount_value"),
    lineDiscount: money("line_discount"),
    docDiscount: money("doc_discount"),
    taxRate: real("tax_rate").notNull().default(0),
    net: money("net"),
    tax: money("tax"),
    total: money("total"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("quotation_lines_quotation_idx").on(t.quotationId)],
);

/** Scheduled price offers. Applied automatically at the POS and re-checked at checkout. */
export const promotions = sqliteTable(
  "promotions",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    productId: text("product_id"),
    variantId: text("variant_id"),
    kind: text("kind").notNull(),
    value: real("value").notNull().default(0),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    isActive: bool("is_active", true),
    createdAt: createdAt(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("promotions_business_idx").on(t.businessId, t.isActive)],
);

export const heldSales = sqliteTable(
  "held_sales",
  {
    id: id(),
    businessId: businessId(),
    locationId: text("location_id").notNull(),
    userId: text("user_id"),
    label: text("label"),
    customerId: text("customer_id"),
    cart: text("cart", { mode: "json" }).$type<unknown>(),
    total: money("total"),
    itemCount: real("item_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("held_sales_business_idx").on(t.businessId, t.locationId)],
);

// ---------------------------------------------------------------- purchases

export const purchases = sqliteTable(
  "purchases",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    kind: text("kind").notNull().default("purchase"),
    status: text("status").notNull(),
    supplierId: text("supplier_id").notNull(),
    locationId: text("location_id").notNull(),
    orderDate: text("order_date").notNull(),
    receivedDate: text("received_date"),
    dueDate: text("due_date"),
    supplierRef: text("supplier_ref"),
    taxInclusive: bool("tax_inclusive"),
    subtotal: money("subtotal"),
    itemDiscount: money("item_discount"),
    docDiscountType: text("doc_discount_type"),
    docDiscountValue: real("doc_discount_value"),
    docDiscount: money("doc_discount"),
    discountTotal: money("discount_total"),
    netTotal: money("net_total"),
    taxTotal: money("tax_total"),
    shipping: money("shipping"),
    total: money("total"),
    amountPaid: money("amount_paid"),
    amountDue: money("amount_due"),
    amountReturned: money("amount_returned"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    itemCount: real("item_count").notNull().default(0),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("purchases_number_uq").on(t.businessId, t.number),
    index("purchases_date_idx").on(t.businessId, t.orderDate),
    index("purchases_supplier_idx").on(t.businessId, t.supplierId),
  ],
);

export const purchaseLines = sqliteTable(
  "purchase_lines",
  {
    id: id(),
    purchaseId: text("purchase_id").notNull(),
    businessId: businessId(),
    variantId: text("variant_id").notNull(),
    productId: text("product_id").notNull(),
    name: text("name").notNull(),
    sku: text("sku"),
    quantity: real("quantity").notNull(),
    unitCost: money("unit_cost"),
    discountType: text("discount_type"),
    discountValue: real("discount_value"),
    lineDiscount: money("line_discount"),
    docDiscount: money("doc_discount"),
    taxRate: real("tax_rate").notNull().default(0),
    net: money("net"),
    tax: money("tax"),
    total: money("total"),
    landedUnitCost: money("landed_unit_cost"),
    quantityReturned: real("quantity_returned").notNull().default(0),
    /** Expiry / best-before date of the goods on this line (YYYY-MM-DD), optional. */
    expiryDate: text("expiry_date"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("purchase_lines_purchase_idx").on(t.purchaseId)],
);

export const purchaseReturns = sqliteTable(
  "purchase_returns",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    date: text("date").notNull(),
    purchaseId: text("purchase_id").notNull(),
    supplierId: text("supplier_id").notNull(),
    locationId: text("location_id").notNull(),
    settlement: text("settlement").notNull(),
    netTotal: money("net_total"),
    taxTotal: money("tax_total"),
    total: money("total"),
    appliedToBill: money("applied_to_bill"),
    refunded: money("refunded"),
    toCredit: money("to_credit"),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("purchase_returns_number_uq").on(t.businessId, t.number),
    index("purchase_returns_date_idx").on(t.businessId, t.date),
    index("purchase_returns_purchase_idx").on(t.purchaseId),
  ],
);

export const purchaseReturnLines = sqliteTable(
  "purchase_return_lines",
  {
    id: id(),
    returnId: text("return_id").notNull(),
    businessId: businessId(),
    purchaseLineId: text("purchase_line_id").notNull(),
    variantId: text("variant_id").notNull(),
    name: text("name").notNull(),
    sku: text("sku"),
    quantity: real("quantity").notNull(),
    unitCost: money("unit_cost"),
    net: money("net"),
    tax: money("tax"),
    total: money("total"),
  },
  (t) => [index("purchase_return_lines_return_idx").on(t.returnId)],
);

// ---------------------------------------------------------------- money

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    date: text("date").notNull(),
    direction: text("direction").notNull(),
    source: text("source").notNull(),
    partyType: text("party_type").notNull().default("none"),
    partyId: text("party_id"),
    tender: text("tender").notNull(),
    methodId: text("method_id"),
    accountId: text("account_id"),
    amount: money("amount"),
    tendered: integer("tendered"),
    change: integer("change"),
    reference: text("reference"),
    note: text("note"),
    giftCardId: text("gift_card_id"),
    points: integer("points"),
    status: text("status").notNull().default("completed"),
    shiftId: text("shift_id"),
    locationId: text("location_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_date_idx").on(t.businessId, t.date),
    index("payments_party_idx").on(t.businessId, t.partyType, t.partyId),
    index("payments_shift_idx").on(t.shiftId),
    index("payments_gift_card_idx").on(t.giftCardId),
  ],
);

export const paymentAllocations = sqliteTable(
  "payment_allocations",
  {
    id: id(),
    businessId: businessId(),
    paymentId: text("payment_id").notNull(),
    docType: text("doc_type").notNull(),
    docId: text("doc_id").notNull(),
    amount: money("amount"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payment_allocations_payment_idx").on(t.paymentId),
    index("payment_allocations_doc_idx").on(t.docType, t.docId),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    date: text("date").notNull(),
    accountId: text("account_id").notNull(),
    amount: money("amount"),
    taxAmount: money("tax_amount"),
    methodId: text("method_id"),
    paymentAccountId: text("payment_account_id"),
    supplierId: text("supplier_id"),
    payee: text("payee"),
    reference: text("reference"),
    note: text("note"),
    locationId: text("location_id"),
    shiftId: text("shift_id"),
    status: text("status").notNull().default("posted"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_date_idx").on(t.businessId, t.date)],
);

export const shifts = sqliteTable(
  "shifts",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    locationId: text("location_id").notNull(),
    userId: text("user_id").notNull(),
    status: text("status").notNull().default("open"),
    openedAt: integer("opened_at").notNull(),
    closedAt: integer("closed_at"),
    openingFloat: money("opening_float"),
    expectedCash: integer("expected_cash"),
    countedCash: integer("counted_cash"),
    difference: integer("difference"),
    denominations: text("denominations", { mode: "json" }).$type<Record<string, number>>(),
    note: text("note"),
    closingNote: text("closing_note"),
    closedBy: text("closed_by"),
  },
  (t) => [
    index("shifts_business_idx").on(t.businessId, t.openedAt),
    index("shifts_user_idx").on(t.businessId, t.userId, t.status),
  ],
);

export const cashMovements = sqliteTable(
  "cash_movements",
  {
    id: id(),
    businessId: businessId(),
    shiftId: text("shift_id").notNull(),
    type: text("type").notNull(),
    amount: money("amount"),
    accountId: text("account_id"),
    reason: text("reason").notNull(),
    userId: text("user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("cash_movements_shift_idx").on(t.shiftId)],
);

export const giftCards = sqliteTable(
  "gift_cards",
  {
    id: id(),
    businessId: businessId(),
    code: text("code").notNull(),
    initialValue: money("initial_value"),
    balance: money("balance"),
    status: text("status").notNull().default("active"),
    expiresOn: text("expires_on"),
    customerId: text("customer_id"),
    note: text("note"),
    paid: bool("paid", true),
    createdBy: text("created_by"),
    issuedAt: integer("issued_at").notNull(),
  },
  (t) => [uniqueIndex("gift_cards_code_uq").on(t.businessId, t.code)],
);

// ---------------------------------------------------------------- ledger

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: id(),
    businessId: businessId(),
    number: text("number").notNull(),
    date: text("date").notNull(),
    memo: text("memo").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    sourceNumber: text("source_number"),
    locationId: text("location_id"),
    totalDebit: money("total_debit"),
    reversalOfId: text("reversal_of_id"),
    reversedById: text("reversed_by_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("journal_entries_date_idx").on(t.businessId, t.date),
    index("journal_entries_source_idx").on(t.businessId, t.sourceType, t.sourceId),
  ],
);

export const journalLines = sqliteTable(
  "journal_lines",
  {
    id: id(),
    entryId: text("entry_id").notNull(),
    businessId: businessId(),
    accountId: text("account_id").notNull(),
    date: text("date").notNull(),
    debit: money("debit"),
    credit: money("credit"),
    memo: text("memo"),
    partyType: text("party_type"),
    partyId: text("party_id"),
    locationId: text("location_id"),
    reconciliationId: text("reconciliation_id"),
  },
  (t) => [
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.businessId, t.accountId, t.date),
    index("journal_lines_date_idx").on(t.businessId, t.date),
  ],
);

/** A bank statement reconciliation: the journal lines it cleared are stamped with its id. */
export const reconciliations = sqliteTable(
  "reconciliations",
  {
    id: id(),
    businessId: businessId(),
    accountId: text("account_id").notNull(),
    statementDate: text("statement_date").notNull(),
    statementBalance: money("statement_balance"),
    lineCount: integer("line_count").notNull(),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("reconciliations_account_idx").on(t.businessId, t.accountId, t.statementDate)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    businessId: businessId(),
    userId: text("user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    data: text("data", { mode: "json" }).$type<unknown>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_business_idx").on(t.businessId, t.createdAt)],
);

/** A fixed asset: its cost is posted to a fixed-asset account and depreciated straight-line, one month at a time. */
export const fixedAssets = sqliteTable(
  "fixed_assets",
  {
    id: id(),
    businessId: businessId(),
    name: text("name").notNull(),
    accountId: text("account_id").notNull(),
    paidFromAccountId: text("paid_from_account_id").notNull(),
    acquiredOn: text("acquired_on").notNull(),
    cost: money("cost"),
    salvage: money("salvage"),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    accumulated: money("accumulated"),
    depreciatedThrough: text("depreciated_through"),
    createdAt: createdAt(),
  },
  (t) => [index("fixed_assets_business_idx").on(t.businessId)],
);

/** A line from a bank statement. It is matched to a journal line on the same account once the books agree with it. */
export const bankStatementLines = sqliteTable(
  "bank_statement_lines",
  {
    id: id(),
    businessId: businessId(),
    accountId: text("account_id").notNull(),
    date: text("date").notNull(),
    description: text("description").notNull(),
    amount: money("amount"),
    matchedLineId: text("matched_line_id"),
    createdAt: createdAt(),
  },
  (t) => [index("bank_statement_lines_account_idx").on(t.businessId, t.accountId, t.date)],
);

// ---------------------------------------------------------------- online payments (payments.lk)

export const gatewaySettings = sqliteTable("gateway_settings", {
  businessId: text("business_id").primaryKey(),
  isEnabled: bool("is_enabled", false),
  /** payments.lk secret key (sk_test_… / sk_live_…). Never returned to the client. */
  secretKey: text("secret_key"),
  /** Webhook signing secret used to verify the Payments-Signature header. */
  webhookSecret: text("webhook_secret"),
  /** Payment method (and so ledger account) online receipts settle into. */
  methodId: text("method_id"),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const gatewayCheckouts = sqliteTable(
  "gateway_checkouts",
  {
    id: id(),
    businessId: businessId(),
    docType: text("doc_type").notNull(),
    docId: text("doc_id").notNull(),
    amount: money("amount"),
    /** pending | paid | failed | expired */
    status: text("status").notNull().default("pending"),
    providerCheckoutId: text("provider_checkout_id"),
    providerPaymentId: text("provider_payment_id"),
    url: text("url"),
    failureMessage: text("failure_message"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    paidAt: integer("paid_at"),
  },
  (t) => [index("gateway_checkouts_doc_idx").on(t.businessId, t.docType, t.docId)],
);

// ---------------------------------------------------------------- customer messaging (SMS / WhatsApp)

export const messageSettings = sqliteTable("message_settings", {
  businessId: text("business_id").primaryKey(),
  /** none | notify_lk */
  smsProvider: text("sms_provider").notNull().default("none"),
  notifyUserId: text("notify_user_id"),
  /** Notify.lk API key. Never returned to the client. */
  notifyApiKey: text("notify_api_key"),
  senderId: text("sender_id"),
  /** Dial code prepended to local numbers (94 = Sri Lanka). */
  countryCode: text("country_code").notNull().default("94"),
  includePayLink: bool("include_pay_link", true),
  receiptTemplate: text("receipt_template"),
  reminderTemplate: text("reminder_template"),
  readyTemplate: text("ready_template"),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const messages = sqliteTable(
  "messages",
  {
    id: id(),
    businessId: businessId(),
    /** receipt | reminder | order_ready */
    kind: text("kind").notNull(),
    /** sms | whatsapp */
    channel: text("channel").notNull(),
    customerId: text("customer_id"),
    docType: text("doc_type"),
    docId: text("doc_id"),
    toPhone: text("to_phone").notNull(),
    body: text("body").notNull(),
    /** sent | opened | failed */
    status: text("status").notNull(),
    error: text("error"),
    providerRef: text("provider_ref"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_customer_idx").on(t.businessId, t.customerId, t.createdAt),
    index("messages_business_idx").on(t.businessId, t.createdAt),
  ],
);

// ---------------------------------------------------------------- platform (super admin, plans, subscriptions)

export const plans = sqliteTable("plans", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  /** LKR cents per period */
  priceCents: money("price_cents"),
  periodDays: integer("period_days").notNull().default(30),
  /** 0 = unlimited */
  maxUsers: integer("max_users").notNull().default(0),
  maxLocations: integer("max_locations").notNull().default(0),
  isActive: bool("is_active", true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const platformAdmins = sqliteTable(
  "platform_admins",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: bool("is_active", true),
    lastLoginAt: integer("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("platform_admins_email_uq").on(t.email)],
);

export const platformSessions = sqliteTable("platform_sessions", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: createdAt(),
});

/** Single row (id = "platform"): the platform's own payments.lk account used to sell plans. */
export const platformSettings = sqliteTable("platform_settings", {
  id: text("id").primaryKey(),
  /** When true, /auth/signup is closed and new shops must buy a plan. */
  requirePayment: bool("require_payment", false),
  isEnabled: bool("is_enabled", false),
  secretKey: text("secret_key"),
  webhookSecret: text("webhook_secret"),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const platformOrders = sqliteTable(
  "platform_orders",
  {
    id: id(),
    /** signup | renewal */
    kind: text("kind").notNull(),
    planId: text("plan_id").notNull(),
    planName: text("plan_name").notNull(),
    businessId: text("business_id"),
    email: text("email").notNull(),
    shopName: text("shop_name").notNull(),
    amount: money("amount"),
    periodDays: integer("period_days").notNull().default(30),
    /** signup only: SignupInput without the password */
    signupData: text("signup_data"),
    passwordHash: text("password_hash"),
    /** pending | paid | failed | expired */
    status: text("status").notNull().default("pending"),
    providerCheckoutId: text("provider_checkout_id"),
    providerPaymentId: text("provider_payment_id"),
    url: text("url"),
    failureMessage: text("failure_message"),
    createdAt: createdAt(),
    paidAt: integer("paid_at"),
  },
  (t) => [index("platform_orders_status_idx").on(t.status, t.createdAt)],
);
