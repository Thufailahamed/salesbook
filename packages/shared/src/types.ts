import type {
  AccountSubtype,
  AccountType,
  AdjustmentReason,
  AllocationDocType,
  CashMovementType,
  CustomerType,
  GiftCardStatus,
  InvoiceKind,
  InvoiceStatus,
  PartyType,
  PaymentDirection,
  PaymentMethodType,
  PaymentSource,
  PaymentStatus,
  Permission,
  PriceTier,
  ProductType,
  PurchaseKind,
  PurchaseReturnSettlement,
  PurchaseStatus,
  QuotationStatus,
  Role,
  SequenceKey,
  ShiftStatus,
  StockMovementType,
  Tender,
} from "./constants";
import type { DiscountType } from "./calc";

/*
 * API response DTOs (the contract between apps/api and apps/web).
 * Money = integer minor units. Dates = "YYYY-MM-DD" (business timezone). Timestamps = epoch ms.
 */

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface OkResponse {
  ok: true;
}

// ---------------------------------------------------------------- business & auth

export interface Business {
  id: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  taxNumber: string | null;
  currency: string;
  locale: string;
  timezone: string;
  logoUrl: string | null;
  taxInclusive: boolean;
  allowNegativeStock: boolean;
  requireShift: boolean;
  roundingIncrement: number;
  lowStockThreshold: number;
  defaultTaxRateId: string | null;
  invoiceFooter: string | null;
  receiptFooter: string | null;
  invoiceTerms: string | null;
  receiptWidth: "58mm" | "80mm";
  loyaltyEnabled: boolean;
  /** Minor units spent to earn one point (e.g. 10000 = 1 point per 100.00). */
  loyaltyEarnPer: number;
  /** Value of one point in minor units. */
  loyaltyPointValue: number;
  loyaltyMinRedeem: number;
  returnWindowDays: number;
  creditDueDays: number;
  createdAt: number;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  defaultLocationId: string | null;
}

export interface MeResponse {
  user: SessionUser;
  business: Business;
  locations: Location[];
  taxRates: TaxRate[];
  paymentMethods: PaymentMethod[];
  permissions: Permission[];
}

export interface AuthResponse extends MeResponse {
  /** Also set as an httpOnly cookie; returned for non-browser API clients. */
  token: string;
}

export interface Location {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: PaymentMethodType;
  accountId: string;
  accountName: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface Sequence {
  key: SequenceKey;
  prefix: string;
  nextValue: number;
  padding: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  defaultLocationId: string | null;
  isActive: boolean;
  lastLoginAt: number | null;
  createdAt: number;
}

// ---------------------------------------------------------------- catalog

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  description: string | null;
  productCount: number;
}

export interface Brand {
  id: string;
  name: string;
  productCount: number;
}

export interface Unit {
  id: string;
  name: string;
  shortName: string;
  allowDecimal: boolean;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface VariantStock {
  locationId: string;
  locationName: string;
  quantity: number;
}

export interface Variant {
  id: string;
  productId: string;
  /** "M / Red" for variants, "" for the default variant of a simple product */
  name: string;
  options: Record<string, string>;
  sku: string | null;
  barcode: string | null;
  price: number;
  wholesalePrice: number | null;
  /** Weighted-average cost */
  costPrice: number;
  mrp: number | null;
  reorderLevel: number | null;
  isActive: boolean;
  /** Total on hand across all locations */
  stock: number;
  stockByLocation: VariantStock[];
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  type: ProductType;
  categoryId: string | null;
  categoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  unitId: string | null;
  unitName: string | null;
  unitShortName: string | null;
  allowDecimal: boolean;
  taxRateId: string | null;
  taxRate: number;
  trackInventory: boolean;
  hasVariants: boolean;
  options: ProductOption[];
  imageUrl: string | null;
  tags: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  variants: Variant[];
}

export interface ProductListItem {
  id: string;
  name: string;
  type: ProductType;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  brandName: string | null;
  hasVariants: boolean;
  variantCount: number;
  /** SKU of the first variant (or null) */
  sku: string | null;
  priceMin: number;
  priceMax: number;
  costMin: number;
  /** Stock at the requested location (or all locations) */
  totalStock: number;
  trackInventory: boolean;
  lowStock: boolean;
  isActive: boolean;
  updatedAt: number;
}

/** A sellable variant, flattened for the POS / purchase line pickers. */
export interface SellableItem {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  /** "Product name — M / Red" */
  displayName: string;
  options: Record<string, string>;
  sku: string | null;
  barcode: string | null;
  price: number;
  wholesalePrice: number | null;
  costPrice: number;
  mrp: number | null;
  taxRateId: string | null;
  taxRate: number;
  type: ProductType;
  trackInventory: boolean;
  /** Stock at the requested location */
  stock: number;
  imageUrl: string | null;
  unitShortName: string | null;
  allowDecimal: boolean;
  categoryId: string | null;
  categoryName: string | null;
}

// ---------------------------------------------------------------- inventory

export interface StockLevelRow {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  barcode: string | null;
  categoryName: string | null;
  /** Set when filtered by location */
  locationId: string | null;
  quantity: number;
  reorderLevel: number | null;
  costPrice: number;
  price: number;
  /** quantity * costPrice */
  value: number;
  /** quantity * price */
  retailValue: number;
}

export interface StockMovement {
  id: string;
  date: string;
  createdAt: number;
  type: StockMovementType;
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  locationId: string;
  locationName: string;
  quantity: number;
  unitCost: number;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  note: string | null;
  userName: string | null;
}

export interface StockAdjustmentLine {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  quantityBefore: number;
  quantity: number;
  unitCost: number;
  value: number;
}

export interface StockAdjustment {
  id: string;
  number: string;
  date: string;
  locationId: string;
  locationName: string;
  reason: AdjustmentReason;
  note: string | null;
  /** Signed total value of the adjustment */
  totalValue: number;
  lineCount: number;
  createdByName: string | null;
  createdAt: number;
  lines?: StockAdjustmentLine[];
}

export interface StockTransferLine {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  quantity: number;
}

export interface StockTransfer {
  id: string;
  number: string;
  date: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  note: string | null;
  itemCount: number;
  totalQuantity: number;
  createdByName: string | null;
  createdAt: number;
  lines?: StockTransferLine[];
}

// ---------------------------------------------------------------- parties

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  type: CustomerType;
  priceTier: PriceTier;
  allowCredit: boolean;
  /** 0 = unlimited */
  creditLimit: number;
  /** Amount the customer owes us (open invoices) */
  dueBalance: number;
  /** Store credit available to the customer */
  creditBalance: number;
  loyaltyPoints: number;
  birthday: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: number;
  totalSpent: number;
  invoiceCount: number;
  lastPurchaseAt: number | null;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  paymentTermsDays: number;
  /** Amount we owe the supplier (open bills) */
  dueBalance: number;
  /** Credit the supplier owes us (returns / advances) */
  creditBalance: number;
  notes: string | null;
  isActive: boolean;
  createdAt: number;
  totalPurchased: number;
  lastPurchaseAt: number | null;
}

export interface StatementEntry {
  date: string;
  createdAt: number;
  type: string;
  number: string | null;
  description: string;
  /** Increases what the party owes us (customer) / what we owe (supplier) */
  debit: number;
  credit: number;
  /** Running net balance (positive = owed to us for customers, owed by us for suppliers) */
  balance: number;
  refType: string | null;
  refId: string | null;
}

export interface Statement {
  partyType: "customer" | "supplier";
  partyId: string;
  partyName: string;
  from: string;
  to: string;
  openingBalance: number;
  entries: StatementEntry[];
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
}

/** Open documents for allocating a payment. */
export interface OpenDocument {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  total: number;
  amountDue: number;
}

// ---------------------------------------------------------------- payments

export interface PaymentAllocation {
  docType: AllocationDocType;
  docId: string;
  docNumber: string | null;
  amount: number;
}

export interface Payment {
  id: string;
  number: string;
  date: string;
  createdAt: number;
  direction: PaymentDirection;
  source: PaymentSource;
  partyType: PartyType;
  partyId: string | null;
  partyName: string | null;
  tender: Tender;
  methodId: string | null;
  methodName: string | null;
  methodType: PaymentMethodType | null;
  accountId: string | null;
  amount: number;
  /** Cash handed over (receipts) */
  tendered: number | null;
  change: number | null;
  reference: string | null;
  note: string | null;
  giftCardId: string | null;
  giftCardCode: string | null;
  points: number | null;
  status: "completed" | "void";
  shiftId: string | null;
  createdByName: string | null;
  allocations: PaymentAllocation[];
}

// ---------------------------------------------------------------- sales

export interface InvoiceLine {
  id: string;
  variantId: string | null;
  productId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  lineDiscount: number;
  docDiscount: number;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
  unitCost: number;
  quantityReturned: number;
  note: string | null;
}

export interface DocLink {
  id: string;
  number: string;
  date: string;
  total: number;
}

export interface Invoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  date: string;
  dueDate: string | null;
  createdAt: number;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  locationId: string;
  locationName: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  salespersonId: string | null;
  salespersonName: string | null;
  createdByName: string | null;
  priceTier: PriceTier;
  taxInclusive: boolean;
  subtotal: number;
  itemDiscount: number;
  docDiscountType: DiscountType | null;
  docDiscountValue: number | null;
  docDiscount: number;
  discountTotal: number;
  netTotal: number;
  taxTotal: number;
  shipping: number;
  roundOff: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  amountReturned: number;
  costTotal: number;
  pointsEarned: number;
  pointsRedeemed: number;
  itemCount: number;
  note: string | null;
  voidReason: string | null;
  voidedAt: number | null;
  /** Return (credit note) that funded this invoice in an exchange */
  exchangeReturnId: string | null;
  lines?: InvoiceLine[];
  payments?: Payment[];
  returns?: DocLink[];
}

export interface ReturnableLine extends InvoiceLine {
  returnableQuantity: number;
}

export interface SaleReturnLine {
  id: string;
  invoiceLineId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  net: number;
  tax: number;
  total: number;
  unitCost: number;
  restock: boolean;
}

export interface SaleReturn {
  id: string;
  number: string;
  date: string;
  createdAt: number;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string | null;
  locationId: string;
  locationName: string | null;
  reason: string | null;
  netTotal: number;
  taxTotal: number;
  total: number;
  costTotal: number;
  /** Portion used to reduce the original invoice's balance due */
  appliedToInvoice: number;
  /** Portion paid back as money */
  refunded: number;
  /** Portion added to customer store credit */
  toStoreCredit: number;
  /** Portion applied to a new invoice (exchange) */
  appliedToExchange: number;
  exchangeInvoiceId: string | null;
  exchangeInvoiceNumber: string | null;
  createdByName: string | null;
  lines?: SaleReturnLine[];
  payments?: Payment[];
}

export interface CheckoutResponse {
  invoice: Invoice | null;
  saleReturn: SaleReturn | null;
  /** Change to hand back for cash tenders */
  change: number;
  /** Amount refunded to the customer (exchange where return > new sale) */
  refunded: number;
}

export interface QuotationLine {
  id: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  lineDiscount: number;
  docDiscount: number;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
}

export interface Quotation {
  id: string;
  number: string;
  date: string;
  validUntil: string | null;
  status: QuotationStatus;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  locationId: string;
  locationName: string | null;
  taxInclusive: boolean;
  subtotal: number;
  docDiscountType: DiscountType | null;
  docDiscountValue: number | null;
  discountTotal: number;
  netTotal: number;
  taxTotal: number;
  shipping: number;
  total: number;
  notes: string | null;
  terms: string | null;
  convertedInvoiceId: string | null;
  createdByName: string | null;
  createdAt: number;
  itemCount: number;
  lines?: QuotationLine[];
}

export interface HeldSale {
  id: string;
  label: string | null;
  locationId: string;
  customerId: string | null;
  customerName: string | null;
  total: number;
  itemCount: number;
  cart: unknown;
  userName: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------- purchases

export interface PurchaseLine {
  id: string;
  variantId: string;
  productId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  lineDiscount: number;
  docDiscount: number;
  taxRate: number;
  net: number;
  tax: number;
  total: number;
  /** (net + allocated shipping) / quantity */
  landedUnitCost: number;
  quantityReturned: number;
}

export interface Purchase {
  id: string;
  number: string;
  kind: PurchaseKind;
  status: PurchaseStatus;
  supplierId: string;
  supplierName: string | null;
  locationId: string;
  locationName: string | null;
  orderDate: string;
  receivedDate: string | null;
  dueDate: string | null;
  supplierRef: string | null;
  taxInclusive: boolean;
  subtotal: number;
  itemDiscount: number;
  docDiscountType: DiscountType | null;
  docDiscountValue: number | null;
  docDiscount: number;
  discountTotal: number;
  netTotal: number;
  taxTotal: number;
  shipping: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  amountReturned: number;
  paymentStatus: PaymentStatus;
  note: string | null;
  itemCount: number;
  createdByName: string | null;
  createdAt: number;
  lines?: PurchaseLine[];
  payments?: Payment[];
  returns?: DocLink[];
}

export interface PurchaseReturnLine {
  id: string;
  purchaseLineId: string;
  variantId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
  net: number;
  tax: number;
  total: number;
}

export interface PurchaseReturn {
  id: string;
  number: string;
  date: string;
  createdAt: number;
  purchaseId: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string | null;
  locationId: string;
  locationName: string | null;
  settlement: PurchaseReturnSettlement;
  netTotal: number;
  taxTotal: number;
  total: number;
  appliedToBill: number;
  refunded: number;
  toCredit: number;
  note: string | null;
  createdByName: string | null;
  lines?: PurchaseReturnLine[];
}

// ---------------------------------------------------------------- expenses, registers, gift cards

export interface Expense {
  id: string;
  number: string;
  date: string;
  accountId: string;
  accountName: string | null;
  accountCode: string | null;
  amount: number;
  taxAmount: number;
  methodId: string | null;
  methodName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  payee: string | null;
  reference: string | null;
  note: string | null;
  locationId: string | null;
  locationName: string | null;
  status: "posted" | "void";
  createdByName: string | null;
  createdAt: number;
}

export interface CashMovement {
  id: string;
  type: CashMovementType;
  amount: number;
  accountId: string | null;
  accountName: string | null;
  reason: string;
  createdAt: number;
  userName: string | null;
}

export interface Shift {
  id: string;
  number: string;
  locationId: string;
  locationName: string | null;
  userId: string;
  userName: string | null;
  status: ShiftStatus;
  openedAt: number;
  closedAt: number | null;
  openingFloat: number;
  cashSales: number;
  cashRefunds: number;
  payIns: number;
  payOuts: number;
  /** openingFloat + cashSales - cashRefunds + payIns - payOuts */
  expectedCash: number;
  countedCash: number | null;
  /** counted - expected (over > 0, short < 0) */
  difference: number | null;
  note: string | null;
  closingNote: string | null;
}

export interface ShiftReport extends Shift {
  invoiceCount: number;
  salesTotal: number;
  returnsCount: number;
  returnsTotal: number;
  discountTotal: number;
  taxTotal: number;
  byMethod: { methodId: string | null; name: string; type: string; collected: number; refunded: number }[];
  movements: CashMovement[];
  denominations: Record<string, number> | null;
}

export interface GiftCardTransaction {
  id: string;
  date: string;
  createdAt: number;
  type: "issue" | "redeem" | "void" | "refund";
  amount: number;
  reference: string | null;
  refType: string | null;
  refId: string | null;
}

export interface GiftCard {
  id: string;
  code: string;
  initialValue: number;
  balance: number;
  status: GiftCardStatus;
  expiresOn: string | null;
  customerId: string | null;
  customerName: string | null;
  note: string | null;
  paid: boolean;
  issuedAt: number;
  createdByName: string | null;
  transactions?: GiftCardTransaction[];
}

// ---------------------------------------------------------------- accounting

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  systemKey: string | null;
  isSystem: boolean;
  isActive: boolean;
  description: string | null;
  /** Balance on the account's normal side (positive = normal) */
  balance: number;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
  partyType: PartyType | null;
  partyId: string | null;
  partyName: string | null;
}

export interface JournalEntry {
  id: string;
  number: string;
  date: string;
  memo: string;
  sourceType: string;
  sourceId: string | null;
  sourceNumber: string | null;
  totalDebit: number;
  createdByName: string | null;
  createdAt: number;
  reversalOfId: string | null;
  reversedById: string | null;
  lines?: JournalLine[];
}

export interface LedgerEntry {
  lineId: string;
  entryId: string;
  entryNumber: string;
  date: string;
  memo: string;
  sourceType: string;
  sourceId: string | null;
  debit: number;
  credit: number;
  /** Running balance on the account's normal side */
  balance: number;
}

export interface LedgerResponse {
  account: Account;
  from: string;
  to: string;
  openingBalance: number;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

// ---------------------------------------------------------------- reports

export interface AccountAmount {
  accountId: string;
  code: string;
  name: string;
  subtype: string;
  amount: number;
}

export interface ProfitLossReport {
  from: string;
  to: string;
  /** Sales revenue (positive) and contra accounts (returns/discounts, negative) */
  income: AccountAmount[];
  netRevenue: number;
  costOfSales: AccountAmount[];
  totalCostOfSales: number;
  grossProfit: number;
  grossMargin: number;
  expenses: AccountAmount[];
  totalExpenses: number;
  otherIncome: AccountAmount[];
  totalOtherIncome: number;
  netProfit: number;
  netMargin: number;
}

export interface BalanceSheetReport {
  asOf: string;
  assets: AccountAmount[];
  totalAssets: number;
  liabilities: AccountAmount[];
  totalLiabilities: number;
  equity: AccountAmount[];
  /** All-time profit to date not yet closed to retained earnings */
  currentEarnings: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
}

export interface CashFlowReport {
  from: string;
  to: string;
  accounts: { accountId: string; code: string; name: string; opening: number; inflow: number; outflow: number; closing: number }[];
  totalOpening: number;
  totalInflow: number;
  totalOutflow: number;
  totalClosing: number;
}

export interface SalesSummaryReport {
  from: string;
  to: string;
  totals: {
    invoices: number;
    itemsSold: number;
    grossSales: number;
    discounts: number;
    returns: number;
    netSales: number;
    tax: number;
    collected: number;
    cost: number;
    grossProfit: number;
    margin: number;
    avgBasket: number;
  };
  series: { period: string; invoices: number; netSales: number; returns: number; grossProfit: number; tax: number }[];
  byPaymentMethod: { name: string; tender: string; amount: number; count: number }[];
  byStaff: { userId: string | null; name: string; invoices: number; netSales: number }[];
  byLocation: { locationId: string; name: string; invoices: number; netSales: number }[];
  byHour: { hour: number; invoices: number; netSales: number }[];
}

export interface ProductSalesRow {
  variantId: string | null;
  productId: string | null;
  name: string;
  sku: string | null;
  categoryName: string | null;
  quantity: number;
  returnedQuantity: number;
  netSales: number;
  cost: number;
  profit: number;
  margin: number;
}

export interface CategorySalesRow {
  categoryId: string | null;
  name: string;
  quantity: number;
  netSales: number;
  profit: number;
}

export interface TaxReport {
  from: string;
  to: string;
  salesTax: number;
  salesReturnsTax: number;
  purchaseTax: number;
  purchaseReturnsTax: number;
  expenseTax: number;
  outputTax: number;
  inputTax: number;
  netPayable: number;
  byRate: { rate: number; taxableSales: number; salesTax: number; taxablePurchases: number; purchaseTax: number }[];
}

export interface InventoryValuationReport {
  asOf: string;
  rows: StockLevelRow[];
  totalQuantity: number;
  totalValue: number;
  totalRetailValue: number;
  byCategory: { name: string; quantity: number; value: number; retailValue: number }[];
}

export interface AgingRow {
  partyId: string;
  name: string;
  phone: string | null;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
}

export interface AgingReport {
  asOf: string;
  rows: AgingRow[];
  totals: Omit<AgingRow, "partyId" | "name" | "phone">;
}

export interface ExpenseReport {
  from: string;
  to: string;
  total: number;
  byAccount: { accountId: string; code: string; name: string; amount: number; count: number }[];
  series: { period: string; amount: number }[];
}

export interface DashboardData {
  today: { netSales: number; invoices: number; grossProfit: number; avgBasket: number; collected: number };
  yesterday: { netSales: number; invoices: number };
  month: { netSales: number; grossProfit: number; expenses: number; returns: number; netProfit: number };
  lastMonth: { netSales: number; grossProfit: number };
  receivables: number;
  payables: number;
  cashBalance: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  salesTrend: { date: string; netSales: number; grossProfit: number; invoices: number }[];
  topProducts: { name: string; quantity: number; netSales: number }[];
  categorySales: { name: string; netSales: number }[];
  paymentMix: { name: string; amount: number }[];
  recentInvoices: Invoice[];
  lowStock: StockLevelRow[];
  openShift: Shift | null;
}

export interface AuditLog {
  id: string;
  createdAt: number;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
}
