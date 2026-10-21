import { z } from "zod";
import { PROMOTION_KINDS } from "./promotions";
import {
  ACCOUNT_TYPES,
  ADJUSTMENT_REASONS,
  CASH_MOVEMENT_TYPES,
  CUSTOMER_TYPES,
  PAYMENT_METHOD_TYPES,
  PRICE_TIERS,
  PRODUCT_TYPES,
  PURCHASE_RETURN_SETTLEMENTS,
  QUOTATION_STATUSES,
  REFUND_MODES,
  ROLES,
} from "./constants";

/*
 * Request body / query schemas. Shared by the API (validation) and the web app (form validation + types).
 * Conventions:
 *  - money: integer minor units
 *  - dates: "YYYY-MM-DD" in the business timezone
 *  - optional text fields accept null or "" (the API normalises "" to null)
 */

export const zId = z.string().min(1).max(64);
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const zMoney = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000);
export const zMoneyPos = z.number().int().min(0).max(1_000_000_000_000);
export const zQty = z.number().min(-1_000_000).max(1_000_000);
export const zQtyPos = z.number().positive().max(1_000_000);
export const zText = (max = 500) => z.string().trim().max(max).nullish();
export const zName = (max = 200) => z.string().trim().min(1, "Required").max(max);
export const zDiscountType = z.enum(["amount", "percent"]).nullish();
export const zPercent = z.number().min(0).max(100);

// ---------------------------------------------------------------- list queries

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  q: z.string().trim().max(200).optional(),
  from: zDate.optional(),
  to: zDate.optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const dateRangeQuerySchema = z.object({
  from: zDate.optional(),
  to: zDate.optional(),
  locationId: z.string().optional(),
});

// ---------------------------------------------------------------- auth & settings

export const signupSchema = z.object({
  businessName: zName(120),
  name: zName(120),
  email: z.email().max(200),
  password: z.string().min(8, "At least 8 characters").max(200),
  currency: z.string().length(3),
  timezone: z.string().min(1).max(64),
  country: zText(80),
  phone: zText(40),
  taxInclusive: z.boolean().default(true),
  defaultTaxRate: z.number().min(0).max(100).default(0),
  taxName: zText(40),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const updateProfileSchema = z.object({
  name: zName(120),
  defaultLocationId: z.string().nullish(),
});

export const businessSettingsSchema = z
  .object({
    name: zName(120),
    legalName: zText(200),
    email: zText(200),
    phone: zText(40),
    website: zText(200),
    address: zText(500),
    city: zText(100),
    country: zText(80),
    taxNumber: zText(60),
    currency: z.string().length(3),
    locale: z.string().max(20),
    timezone: z.string().max(64),
    logoUrl: zText(500),
    taxInclusive: z.boolean(),
    allowNegativeStock: z.boolean(),
    requireShift: z.boolean(),
    roundingIncrement: z.number().int().min(0).max(100_000),
    lowStockThreshold: z.number().min(0).max(1_000_000),
    defaultTaxRateId: z.string().nullish(),
    invoiceFooter: zText(2000),
    receiptFooter: zText(1000),
    invoiceTerms: zText(4000),
    receiptWidth: z.enum(["58mm", "80mm"]),
    loyaltyEnabled: z.boolean(),
    loyaltyEarnPer: z.number().int().min(1),
    loyaltyPointValue: z.number().int().min(0),
    loyaltyMinRedeem: z.number().int().min(0),
    returnWindowDays: z.number().int().min(0).max(3650),
    creditDueDays: z.number().int().min(0).max(3650),
  })
  .partial();
export type BusinessSettingsInput = z.infer<typeof businessSettingsSchema>;

export const locationSchema = z.object({
  name: zName(120),
  code: zText(20),
  address: zText(500),
  phone: zText(40),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type LocationInput = z.infer<typeof locationSchema>;

export const taxRateSchema = z.object({
  name: zName(60),
  rate: z.number().min(0).max(100),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type TaxRateInput = z.infer<typeof taxRateSchema>;

export const paymentMethodSchema = z.object({
  name: zName(60),
  type: z.enum(PAYMENT_METHOD_TYPES),
  /** Ledger account money settles into. Defaults by type when omitted. */
  accountId: z.string().nullish(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

export const sequenceUpdateSchema = z.object({
  prefix: z.string().max(20),
  nextValue: z.number().int().min(1).optional(),
  padding: z.number().int().min(1).max(12).optional(),
});

export const userCreateSchema = z.object({
  name: zName(120),
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(ROLES),
  defaultLocationId: z.string().nullish(),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  name: zName(120).optional(),
  role: z.enum(ROLES).optional(),
  defaultLocationId: z.string().nullish(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// ---------------------------------------------------------------- catalog

export const categorySchema = z.object({
  name: zName(120),
  parentId: z.string().nullish(),
  color: zText(20),
  description: zText(500),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const brandSchema = z.object({ name: zName(120) });
export type BrandInput = z.infer<typeof brandSchema>;

export const unitSchema = z.object({
  name: zName(60),
  shortName: zName(12),
  allowDecimal: z.boolean().default(false),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const productOptionSchema = z.object({
  name: zName(40),
  values: z.array(zName(60)).min(1).max(100),
});

export const variantInputSchema = z.object({
  /** Present when updating an existing variant. */
  id: z.string().optional(),
  name: zText(200),
  /** e.g. { Size: "M", Color: "Red" }; {} for simple products */
  options: z.record(z.string(), z.string()).default({}),
  sku: zText(64),
  barcode: zText(64),
  price: zMoneyPos,
  wholesalePrice: zMoneyPos.nullish(),
  costPrice: zMoneyPos.default(0),
  mrp: zMoneyPos.nullish(),
  reorderLevel: z.number().min(0).nullish(),
  isActive: z.boolean().default(true),
  /** Only honoured on create: opening stock per location (posted at costPrice). */
  openingStock: z.array(z.object({ locationId: zId, quantity: zQtyPos })).optional(),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const productSchema = z.object({
  name: zName(200),
  description: zText(4000),
  type: z.enum(PRODUCT_TYPES).default("standard"),
  categoryId: z.string().nullish(),
  brandId: z.string().nullish(),
  unitId: z.string().nullish(),
  taxRateId: z.string().nullish(),
  trackInventory: z.boolean().default(true),
  imageUrl: zText(500),
  tags: zText(500),
  isActive: z.boolean().default(true),
  hasVariants: z.boolean().default(false),
  /** Variant dimensions, e.g. [{name:"Size",values:["S","M"]},{name:"Color",values:["Red"]}] */
  options: z.array(productOptionSchema).max(3).default([]),
  variants: z.array(variantInputSchema).min(1).max(500),
});
export type ProductInput = z.infer<typeof productSchema>;

export const productListQuerySchema = listQuerySchema.extend({
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  status: z.enum(["active", "archived", "all"]).optional(),
  stock: z.enum(["low", "out", "in"]).optional(),
  type: z.enum(PRODUCT_TYPES).optional(),
  locationId: z.string().optional(),
});

export const sellableSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  locationId: z.string().optional(),
  categoryId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(40),
  /** Include variants of service products / non-tracked items (default true) */
  includeServices: z.coerce.boolean().optional(),
});

// ---------------------------------------------------------------- inventory

export const stockAdjustmentSchema = z.object({
  locationId: zId,
  date: zDate.optional(),
  reason: z.enum(ADJUSTMENT_REASONS),
  note: zText(1000),
  lines: z
    .array(
      z
        .object({
          variantId: zId,
          /** Signed change (+ adds stock, - removes stock). */
          quantityChange: zQty.optional(),
          /** Physical count; server computes the change against current stock. */
          countedQuantity: z.number().min(0).max(1_000_000).optional(),
          /** Unit cost for added stock (defaults to current average cost). */
          unitCost: zMoneyPos.optional(),
        })
        .refine((l) => l.quantityChange !== undefined || l.countedQuantity !== undefined, {
          message: "quantityChange or countedQuantity is required",
        }),
    )
    .min(1)
    .max(500),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const stockTransferSchema = z
  .object({
    fromLocationId: zId,
    toLocationId: zId,
    date: zDate.optional(),
    note: zText(1000),
    lines: z.array(z.object({ variantId: zId, quantity: zQtyPos })).min(1).max(500),
  })
  .refine((t) => t.fromLocationId !== t.toLocationId, { message: "Choose two different locations" });
export type StockTransferInput = z.infer<typeof stockTransferSchema>;

export const stockQuerySchema = listQuerySchema.extend({
  locationId: z.string().optional(),
  categoryId: z.string().optional(),
  stock: z.enum(["low", "out", "in", "negative"]).optional(),
});

export const movementQuerySchema = listQuerySchema.extend({
  locationId: z.string().optional(),
  variantId: z.string().optional(),
  productId: z.string().optional(),
  type: z.string().optional(),
});

// ---------------------------------------------------------------- parties

export const customerSchema = z.object({
  name: zName(200),
  phone: zText(40),
  email: zText(200),
  address: zText(500),
  taxNumber: zText(60),
  type: z.enum(CUSTOMER_TYPES).default("individual"),
  priceTier: z.enum(PRICE_TIERS).default("retail"),
  allowCredit: z.boolean().default(true),
  /** 0 = no limit */
  creditLimit: zMoneyPos.default(0),
  birthday: zDate.nullish(),
  notes: zText(2000),
  isActive: z.boolean().default(true),
  /** Create only: amount the customer already owes (posted to opening balance equity). */
  openingBalance: zMoneyPos.optional(),
  /** Manual loyalty adjustment (edit only, admins). */
  loyaltyPoints: z.number().int().min(0).optional(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const supplierSchema = z.object({
  name: zName(200),
  contactName: zText(120),
  phone: zText(40),
  email: zText(200),
  address: zText(500),
  taxNumber: zText(60),
  paymentTermsDays: z.number().int().min(0).max(365).default(0),
  notes: zText(2000),
  isActive: z.boolean().default(true),
  /** Create only: amount we already owe the supplier. */
  openingBalance: zMoneyPos.optional(),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const partyListQuerySchema = listQuerySchema.extend({
  balance: z.enum(["due", "credit", "any"]).optional(),
  status: z.enum(["active", "archived", "all"]).optional(),
});

export const allocationInputSchema = z.object({ docId: zId, amount: zMoneyPos });

/** Receive money from a customer / pay a supplier on account. Allocations default to oldest-first. */
export const partyPaymentSchema = z.object({
  amount: zMoneyPos.refine((v) => v > 0, "Amount must be positive"),
  methodId: zId,
  date: zDate.optional(),
  reference: zText(120),
  note: zText(1000),
  allocations: z.array(allocationInputSchema).optional(),
});
export type PartyPaymentInput = z.infer<typeof partyPaymentSchema>;

/** Use a customer's store credit (or a supplier's credit) against open documents. */
export const applyCreditSchema = z.object({
  allocations: z.array(allocationInputSchema).optional(),
  amount: zMoneyPos.optional(),
});
export type ApplyCreditInput = z.infer<typeof applyCreditSchema>;

/** Pay out a customer's store credit (or receive a supplier's credit back) as money. */
export const creditRefundSchema = z.object({
  amount: zMoneyPos.refine((v) => v > 0, "Amount must be positive"),
  methodId: zId,
  date: zDate.optional(),
  reference: zText(120),
  note: zText(1000),
});
export type CreditRefundInput = z.infer<typeof creditRefundSchema>;

export const statementQuerySchema = z.object({ from: zDate.optional(), to: zDate.optional() });

// ---------------------------------------------------------------- sales

export const saleLineSchema = z.object({
  /** null/omitted = custom (non-catalog) line */
  variantId: z.string().nullish(),
  name: zText(200),
  quantity: zQtyPos,
  unitPrice: zMoneyPos,
  discountType: zDiscountType,
  discountValue: z.number().min(0).nullish(),
  /** Only used for custom lines; catalog lines use the product's tax rate. */
  taxRate: zPercent.nullish(),
  note: zText(500),
});
export type SaleLineInput = z.infer<typeof saleLineSchema>;

export const tenderSchema = z.object({
  tender: z.enum(["method", "store_credit", "gift_card", "loyalty"]),
  methodId: z.string().nullish(),
  /** Amount applied to the sale (minor units). For cash, exclude change. */
  amount: zMoneyPos,
  /** Cash handed over by the customer (for change calculation / receipt). */
  tendered: zMoneyPos.nullish(),
  reference: zText(120),
  giftCardCode: zText(64),
  /** Loyalty points redeemed (amount must equal points * pointValue). */
  points: z.number().int().min(0).nullish(),
});
export type TenderInput = z.infer<typeof tenderSchema>;

export const returnLineSchema = z.object({
  invoiceLineId: zId,
  quantity: zQtyPos,
  /** true = goods go back to sellable stock; false = damaged / written off */
  restock: z.boolean().default(true),
});
export type ReturnLineInput = z.infer<typeof returnLineSchema>;

export const refundSchema = z.object({
  mode: z.enum(REFUND_MODES),
  methodId: z.string().nullish(),
  reference: zText(120),
});
export type RefundInput = z.infer<typeof refundSchema>;

/**
 * POS checkout. Handles: plain sales, credit (pay-later) sales, split tenders,
 * returns from a previous invoice (`returnFrom`) and exchanges (both together).
 */
export const checkoutSchema = z
  .object({
    locationId: zId,
    customerId: z.string().nullish(),
    salespersonId: z.string().nullish(),
    date: zDate.optional(),
    dueDate: zDate.nullish(),
    priceTier: z.enum(PRICE_TIERS).optional(),
    lines: z.array(saleLineSchema).max(500).default([]),
    docDiscountType: zDiscountType,
    docDiscountValue: z.number().min(0).nullish(),
    shipping: zMoneyPos.nullish(),
    note: zText(2000),
    payments: z.array(tenderSchema).max(20).default([]),
    /** Must be true to leave a balance due on the invoice (sale on credit). */
    allowCredit: z.boolean().default(false),
    returnFrom: z
      .object({
        invoiceId: zId,
        lines: z.array(returnLineSchema).min(1).max(500),
        reason: zText(500),
      })
      .nullish(),
    /** How to settle when the return credit exceeds the new sale. */
    refund: refundSchema.nullish(),
    quotationId: z.string().nullish(),
    heldSaleId: z.string().nullish(),
  })
  .refine((c) => c.lines.length > 0 || !!c.returnFrom, { message: "Add at least one item" });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const saleReturnSchema = z.object({
  invoiceId: zId,
  date: zDate.optional(),
  reason: zText(500),
  lines: z.array(returnLineSchema).min(1).max(500),
  refund: refundSchema.nullish(),
});
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;

export const invoicePaymentSchema = z.object({
  date: zDate.optional(),
  payments: z.array(tenderSchema).min(1).max(20),
});
export type InvoicePaymentInput = z.infer<typeof invoicePaymentSchema>;

export const voidSchema = z.object({ reason: zName(500) });

export const invoiceListQuerySchema = listQuerySchema.extend({
  customerId: z.string().optional(),
  locationId: z.string().optional(),
  status: z.enum(["completed", "void"]).optional(),
  paymentStatus: z.enum(["paid", "partial", "unpaid", "due"]).optional(),
  salespersonId: z.string().optional(),
  kind: z.enum(["sale", "opening_balance", "all"]).optional(),
});

export const quotationSchema = z.object({
  customerId: z.string().nullish(),
  customerName: zText(200),
  locationId: zId,
  date: zDate.optional(),
  validUntil: zDate.nullish(),
  status: z.enum(QUOTATION_STATUSES).optional(),
  lines: z.array(saleLineSchema).min(1).max(500),
  docDiscountType: zDiscountType,
  docDiscountValue: z.number().min(0).nullish(),
  shipping: zMoneyPos.nullish(),
  notes: zText(2000),
  terms: zText(4000),
});
export type QuotationInput = z.infer<typeof quotationSchema>;

export const quotationStatusSchema = z.object({ status: z.enum(QUOTATION_STATUSES) });

export const heldSaleSchema = z.object({
  label: zText(120),
  locationId: zId,
  customerId: z.string().nullish(),
  /** Opaque POS cart state (stored as JSON). */
  cart: z.unknown(),
  total: zMoney,
  itemCount: z.number().min(0),
});
export type HeldSaleInput = z.infer<typeof heldSaleSchema>;

// ---------------------------------------------------------------- promotions

export const promotionSchema = z
  .object({
    name: z.string().trim().min(1, "Give the offer a name").max(120),
    /** Set productId to offer every variant of a product; set variantId for one variant. */
    productId: zId.nullish(),
    variantId: zId.nullish(),
    kind: z.enum(PROMOTION_KINDS),
    value: z.number().min(0).max(1_000_000_000_000),
    startDate: zDate,
    endDate: zDate.nullish(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => !!(v.productId || v.variantId), { message: "Choose a product or variant", path: ["productId"] })
  .refine((v) => v.kind !== "percent" || (v.value > 0 && v.value <= 100), {
    message: "Percent must be between 0 and 100",
    path: ["value"],
  })
  .refine((v) => v.kind !== "fixed_price" || v.value >= 0, { message: "Price can't be negative", path: ["value"] })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "End date is before the start date", path: ["endDate"] });
export type PromotionInput = z.infer<typeof promotionSchema>;

// ---------------------------------------------------------------- purchases

export const purchaseLineSchema = z.object({
  variantId: zId,
  quantity: zQtyPos,
  unitCost: zMoneyPos,
  discountType: zDiscountType,
  discountValue: z.number().min(0).nullish(),
  taxRate: zPercent.nullish(),
  /** Expiry / best-before date of the goods received on this line. */
  expiryDate: zDate.nullish(),
});
export type PurchaseLineInput = z.infer<typeof purchaseLineSchema>;

export const supplierPaymentLineSchema = z.object({
  methodId: zId,
  amount: zMoneyPos,
  reference: zText(120),
});

export const purchaseSchema = z.object({
  supplierId: zId,
  locationId: zId,
  status: z.enum(["ordered", "received"]),
  orderDate: zDate.optional(),
  receivedDate: zDate.optional(),
  dueDate: zDate.nullish(),
  supplierRef: zText(120),
  taxInclusive: z.boolean().default(false),
  lines: z.array(purchaseLineSchema).min(1).max(500),
  docDiscountType: zDiscountType,
  docDiscountValue: z.number().min(0).nullish(),
  /** Freight / landed cost: capitalised into inventory, allocated by line value. */
  shipping: zMoneyPos.nullish(),
  note: zText(2000),
  /** Payments made immediately (only when status = received). */
  payments: z.array(supplierPaymentLineSchema).max(10).default([]),
  /** Also apply available supplier credit to this bill (when received). */
  applySupplierCredit: z.boolean().default(false),
  /** When receiving: update variant selling price/cost? Selling prices are never changed automatically. */
  updateCostPrice: z.boolean().default(true),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const purchaseReceiveSchema = z.object({
  receivedDate: zDate.optional(),
  payments: z.array(supplierPaymentLineSchema).max(10).default([]),
  applySupplierCredit: z.boolean().default(false),
});
export type PurchaseReceiveInput = z.infer<typeof purchaseReceiveSchema>;

export const purchasePaymentSchema = z.object({
  date: zDate.optional(),
  payments: z.array(supplierPaymentLineSchema).min(1).max(10),
});

export const purchaseReturnSchema = z.object({
  purchaseId: zId,
  date: zDate.optional(),
  note: zText(1000),
  lines: z.array(z.object({ purchaseLineId: zId, quantity: zQtyPos })).min(1).max(500),
  /** credit = reduce what we owe / keep as supplier credit; refund = supplier pays us back now */
  settlement: z.enum(PURCHASE_RETURN_SETTLEMENTS),
  methodId: z.string().nullish(),
  reference: zText(120),
});
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;

export const purchaseListQuerySchema = listQuerySchema.extend({
  supplierId: z.string().optional(),
  locationId: z.string().optional(),
  status: z.enum(["ordered", "received", "cancelled"]).optional(),
  paymentStatus: z.enum(["paid", "partial", "unpaid", "due"]).optional(),
});

// ---------------------------------------------------------------- money & expenses

export const paymentListQuerySchema = listQuerySchema.extend({
  direction: z.enum(["in", "out"]).optional(),
  partyType: z.enum(["customer", "supplier", "none"]).optional(),
  partyId: z.string().optional(),
  methodId: z.string().optional(),
  tender: z.string().optional(),
});

export const expenseSchema = z.object({
  date: zDate.optional(),
  /** Expense category = an expense-type ledger account */
  accountId: zId,
  /** Total paid, incl. tax. */
  amount: zMoneyPos.refine((v) => v > 0, "Amount must be positive"),
  /** Recoverable input tax included in amount. */
  taxAmount: zMoneyPos.default(0),
  methodId: zId,
  supplierId: z.string().nullish(),
  payee: zText(200),
  reference: zText(120),
  note: zText(1000),
  locationId: z.string().nullish(),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expenseListQuerySchema = listQuerySchema.extend({
  accountId: z.string().optional(),
  locationId: z.string().optional(),
  status: z.enum(["posted", "void"]).optional(),
});

export const shiftOpenSchema = z.object({
  locationId: zId,
  openingFloat: zMoneyPos,
  note: zText(500),
});
export type ShiftOpenInput = z.infer<typeof shiftOpenSchema>;

export const shiftCloseSchema = z.object({
  countedCash: zMoneyPos,
  note: zText(1000),
  /** Optional breakdown of counted notes/coins, stored for the Z report. */
  denominations: z.record(z.string(), z.number()).optional(),
});
export type ShiftCloseInput = z.infer<typeof shiftCloseSchema>;

export const cashMovementSchema = z.object({
  type: z.enum(CASH_MOVEMENT_TYPES),
  amount: zMoneyPos.refine((v) => v > 0, "Amount must be positive"),
  /** Counter account (e.g. Bank for a cash drop, an expense, Owner's drawings). Defaults to Bank. */
  accountId: z.string().nullish(),
  reason: zName(500),
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;

export const giftCardSchema = z.object({
  code: zText(40),
  value: zMoneyPos.refine((v) => v > 0, "Value must be positive"),
  customerId: z.string().nullish(),
  expiresOn: zDate.nullish(),
  note: zText(500),
  /** true = sold for money (methodId required); false = promotional (expensed to marketing) */
  paid: z.boolean().default(true),
  methodId: z.string().nullish(),
  reference: zText(120),
});
export type GiftCardInput = z.infer<typeof giftCardSchema>;

export const giftCardUpdateSchema = z.object({
  status: z.enum(["active", "void"]).optional(),
  expiresOn: zDate.nullish(),
  note: zText(500),
  customerId: z.string().nullish(),
});

// ---------------------------------------------------------------- accounting

export const accountSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: zName(120),
  type: z.enum(ACCOUNT_TYPES),
  subtype: z.string().min(1).max(40),
  description: zText(500),
  isActive: z.boolean().default(true),
});
export type AccountInput = z.infer<typeof accountSchema>;

export const journalLineInputSchema = z.object({
  accountId: zId,
  debit: zMoneyPos.default(0),
  credit: zMoneyPos.default(0),
  memo: zText(300),
});

export const journalSchema = z
  .object({
    date: zDate,
    memo: zName(500),
    lines: z.array(journalLineInputSchema).min(2).max(100),
  })
  .refine(
    (j) =>
      j.lines.reduce((s, l) => s + l.debit, 0) === j.lines.reduce((s, l) => s + l.credit, 0) &&
      j.lines.reduce((s, l) => s + l.debit, 0) > 0,
    { message: "Debits must equal credits" },
  );
export type JournalInput = z.infer<typeof journalSchema>;

export const fundsTransferSchema = z
  .object({
    fromAccountId: zId,
    toAccountId: zId,
    amount: zMoneyPos.refine((v) => v > 0, "Amount must be positive"),
    date: zDate.optional(),
    memo: zText(500),
  })
  .refine((t) => t.fromAccountId !== t.toAccountId, { message: "Choose two different accounts" });
export type FundsTransferInput = z.infer<typeof fundsTransferSchema>;

export const journalListQuerySchema = listQuerySchema.extend({
  sourceType: z.string().optional(),
  accountId: z.string().optional(),
});

export const ledgerQuerySchema = z.object({
  from: zDate.optional(),
  to: zDate.optional(),
});

export const reportQuerySchema = z.object({
  from: zDate.optional(),
  to: zDate.optional(),
  asOf: zDate.optional(),
  locationId: z.string().optional(),
  groupBy: z.enum(["day", "week", "month"]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const booksLockSchema = z.object({ closedThrough: zDate.nullable() });
export type BooksLockInput = z.infer<typeof booksLockSchema>;

export const depreciationSchema = z.object({
  date: zDate,
  amount: zMoneyPos.refine((v) => v > 0, "Amount must be positive"),
  memo: zName(200),
});
export type DepreciationInput = z.infer<typeof depreciationSchema>;

export const reconciliationQuerySchema = z.object({
  accountId: zId,
  statementDate: zDate,
});

export const reconciliationSchema = z.object({
  accountId: zId,
  statementDate: zDate,
  statementBalance: zMoney,
  lineIds: z.array(zId).min(0).max(5000),
});
export type ReconciliationInput = z.infer<typeof reconciliationSchema>;

export const fixedAssetSchema = z
  .object({
    name: zName(120),
    accountId: zId,
    paidFromAccountId: zId,
    acquiredOn: zDate,
    cost: zMoneyPos.refine((v) => v > 0, "Cost must be positive"),
    salvage: zMoneyPos,
    usefulLifeMonths: z.number().int().min(1).max(600),
  })
  .refine((v) => v.salvage < v.cost, { message: "Salvage value must be less than the cost", path: ["salvage"] });
export type FixedAssetInput = z.infer<typeof fixedAssetSchema>;

export const depreciationRunSchema = z.object({ throughDate: zDate });
export type DepreciationRunInput = z.infer<typeof depreciationRunSchema>;

export const bankStatementImportSchema = z.object({
  accountId: zId,
  rows: z
    .array(z.object({ date: zDate, description: zName(200), amount: zMoney.refine((v) => v !== 0, "Amount can't be zero") }))
    .min(1)
    .max(2000),
});
export type BankStatementImportInput = z.infer<typeof bankStatementImportSchema>;

export const bankStatementQuerySchema = z.object({ accountId: zId });
export const bankMatchSchema = z.object({ accountId: zId });

// ---------------------------------------------------------------- online payments (payments.lk)

export const gatewaySettingsSchema = z.object({
  isEnabled: z.boolean(),
  /** Omit (or send empty) to keep the stored key. */
  secretKey: z.string().trim().max(200).nullish(),
  webhookSecret: z.string().trim().max(200).nullish(),
  methodId: z.string().nullish(),
});
export type GatewaySettingsInput = z.infer<typeof gatewaySettingsSchema>;

export const createCheckoutSchema = z.object({
  invoiceId: zId,
  /** Minor units; defaults to the invoice balance due. */
  amount: zMoneyPos.optional(),
  /** Browser origin to return to after paying. */
  returnOrigin: z.string().max(200).optional(),
});
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

// ---------------------------------------------------------------- platform admin & subscriptions

export const planSchema = z.object({
  name: zName(80),
  description: zText(500),
  /** LKR cents per period */
  priceCents: zMoneyPos,
  periodDays: z.number().int().min(1).max(3660),
  /** 0 = unlimited */
  maxUsers: z.number().int().min(0).max(10_000),
  maxLocations: z.number().int().min(0).max(10_000),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type PlanInput = z.infer<typeof planSchema>;

/** Public: buy a plan and create the shop once the payment succeeds. */
export const planPurchaseSchema = z.object({
  planId: zId,
  signup: signupSchema,
  returnOrigin: z.string().max(200).optional(),
});
export type PlanPurchaseInput = z.infer<typeof planPurchaseSchema>;

export const renewSchema = z.object({ planId: zId, returnOrigin: z.string().max(200).optional() });
export type RenewInput = z.infer<typeof renewSchema>;

export const platformSettingsSchema = z.object({
  requirePayment: z.boolean(),
  isEnabled: z.boolean(),
  /** Omit/empty to keep the stored value. */
  secretKey: z.string().trim().max(200).nullish(),
  webhookSecret: z.string().trim().max(200).nullish(),
});
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;

export const platformShopUpdateSchema = z.object({
  status: z.enum(["active", "suspended"]).optional(),
  planId: z.string().nullish(),
  /** YYYY-MM-DD (end of that day) or null for no expiry */
  subscriptionEndsOn: zDate.nullish(),
  /** Adds days to the current end (or to now when expired) */
  extendDays: z.number().int().min(1).max(3660).optional(),
});
export type PlatformShopUpdateInput = z.infer<typeof platformShopUpdateSchema>;

export const platformUserUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});
export type PlatformUserUpdateInput = z.infer<typeof platformUserUpdateSchema>;

export const platformAdminCreateSchema = z.object({
  name: zName(120),
  email: z.email().max(200),
  password: z.string().min(8).max(200),
});
export type PlatformAdminCreateInput = z.infer<typeof platformAdminCreateSchema>;

export const platformShopListQuerySchema = listQuerySchema.extend({
  status: z.enum(["active", "suspended", "expired"]).optional(),
});
export const platformOrderListQuerySchema = listQuerySchema.extend({
  status: z.enum(["pending", "paid", "failed", "expired"]).optional(),
});
