# ShopBooks API contract

All endpoints are under `/api`. Request bodies are validated with the zod schemas in
`packages/shared/src/schemas.ts`; responses use the DTOs in `packages/shared/src/types.ts`.

* **Money** — integer minor units (cents). **Dates** — `YYYY-MM-DD` in the business timezone. **Timestamps** — epoch ms.
* **Auth** — httpOnly cookie `sb_session` (set by login/signup) or `Authorization: Bearer <token>`.
* **Errors** — non-2xx with `ApiErrorBody`: `{ "error": { "code": "validation_error", "message": "…", "details": … } }`.
  Codes: `unauthorized` 401, `forbidden` 403, `not_found` 404, `validation_error` 422, `conflict` 409, `bad_request` 400.
* **Files** — uploaded image URLs are returned as `/api/files/<key>` (relative to the API origin); the web app must prefix them with `NEXT_PUBLIC_API_URL` when set.
* **Lists** — `?page=1&pageSize=25&q=…&from=YYYY-MM-DD&to=YYYY-MM-DD` → `Paginated<T>` = `{ data, total, page, pageSize }`.

| Method | Path | Body / Query | Response |
|---|---|---|---|
| **Auth** ||||
| POST | /auth/signup | signupSchema | AuthResponse |
| POST | /auth/login | loginSchema | AuthResponse |
| POST | /auth/logout | – | OkResponse |
| GET | /auth/me | – | MeResponse |
| PUT | /auth/profile | updateProfileSchema | SessionUser |
| POST | /auth/change-password | changePasswordSchema | OkResponse |
| **Settings** (settings.manage for writes) ||||
| GET / PUT | /settings/business | businessSettingsSchema | Business |
| GET / POST | /settings/locations | locationSchema | Location[] / Location |
| PUT / DELETE | /settings/locations/:id | locationSchema | Location / OkResponse |
| GET / POST | /settings/tax-rates | taxRateSchema | TaxRate[] / TaxRate |
| PUT / DELETE | /settings/tax-rates/:id | taxRateSchema | TaxRate / OkResponse |
| GET / POST | /settings/payment-methods | paymentMethodSchema | PaymentMethod[] / PaymentMethod |
| PUT / DELETE | /settings/payment-methods/:id | paymentMethodSchema | PaymentMethod / OkResponse |
| GET | /settings/sequences | – | Sequence[] |
| PUT | /settings/sequences/:key | sequenceUpdateSchema | Sequence |
| POST | /uploads | multipart `file` (image ≤ 5 MB) | `{ url, key }` |
| GET | /files/:key | – | the file (public, used for product images/logo) |
| **Users** (users.manage) ||||
| GET / POST | /users | userCreateSchema | User[] / User |
| PUT / DELETE | /users/:id | userUpdateSchema | User / OkResponse (deactivates) |
| GET | /users/directory | – (any signed-in user) | `{ id, name, role }[]` active users for salesperson pickers |
| **Catalog** ||||
| GET / POST | /categories | categorySchema | Category[] / Category |
| PUT / DELETE | /categories/:id | categorySchema | Category / OkResponse |
| GET / POST | /brands | brandSchema | Brand[] / Brand |
| PUT / DELETE | /brands/:id | | |
| GET / POST | /units | unitSchema | Unit[] / Unit |
| PUT / DELETE | /units/:id | | |
| GET | /products | productListQuerySchema | Paginated<ProductListItem> |
| GET | /products/sellable | sellableSearchQuerySchema | SellableItem[] |
| GET | /products/lookup | `?code=&locationId=` exact barcode/SKU | SellableItem (404 if none) |
| GET | /products/:id | – | Product |
| POST | /products | productSchema | Product |
| PUT | /products/:id | productSchema (variants with `id` are updated, without are created, omitted ones are archived) | Product |
| DELETE | /products/:id | – | OkResponse (archives if it has history) |
| **Inventory** ||||
| GET | /inventory/stock | stockQuerySchema | Paginated<StockLevelRow> & `{ totals: { quantity, value, retailValue } }` |
| GET | /inventory/movements | movementQuerySchema | Paginated<StockMovement> |
| GET / POST | /inventory/adjustments | listQuery + `locationId, reason` / stockAdjustmentSchema | Paginated<StockAdjustment> / StockAdjustment |
| GET | /inventory/adjustments/:id | – | StockAdjustment (with lines) |
| GET / POST | /inventory/transfers | listQuery + `locationId` / stockTransferSchema | Paginated<StockTransfer> / StockTransfer |
| GET | /inventory/transfers/:id | – | StockTransfer (with lines) |
| **Customers** ||||
| GET / POST | /customers | partyListQuerySchema / customerSchema | Paginated<Customer> / Customer |
| GET / PUT / DELETE | /customers/:id | customerSchema | Customer / Customer / OkResponse |
| GET | /customers/:id/statement | statementQuerySchema | Statement |
| GET | /customers/:id/open-invoices | – | OpenDocument[] |
| POST | /customers/:id/payments | partyPaymentSchema | Payment |
| POST | /customers/:id/apply-credit | applyCreditSchema | Customer |
| POST | /customers/:id/refund-credit | creditRefundSchema | Payment |
| **Suppliers** ||||
| GET / POST | /suppliers | partyListQuerySchema / supplierSchema | Paginated<Supplier> / Supplier |
| GET / PUT / DELETE | /suppliers/:id | supplierSchema | Supplier / Supplier / OkResponse |
| GET | /suppliers/:id/statement | statementQuerySchema | Statement |
| GET | /suppliers/:id/open-bills | – | OpenDocument[] |
| POST | /suppliers/:id/payments | partyPaymentSchema | Payment |
| POST | /suppliers/:id/apply-credit | applyCreditSchema | Supplier |
| POST | /suppliers/:id/refund-credit | creditRefundSchema (supplier pays us back) | Payment |
| **Sales** ||||
| GET | /sales | invoiceListQuerySchema | Paginated<Invoice> & `{ totals: { total, due } }` |
| GET | /sales/lookup | `?number=` | Invoice (with lines) |
| GET | /sales/:id | – | Invoice (with lines, payments, returns) |
| GET | /sales/:id/returnable | – | ReturnableLine[] |
| POST | /sales/checkout | checkoutSchema (sale, credit sale, split tender, return, exchange) | CheckoutResponse |
| POST | /sales/:id/payments | invoicePaymentSchema | Invoice |
| POST | /sales/:id/void | voidSchema | Invoice |
| GET / POST | /returns | listQuery + `customerId, locationId, invoiceId` / saleReturnSchema | Paginated<SaleReturn> & `{ totals: { total } }` / SaleReturn |
| GET | /returns/:id | – | SaleReturn (with lines, payments) |
| GET / POST | /quotations | listQuery + `status, customerId` / quotationSchema | Paginated<Quotation> / Quotation |
| GET / PUT / DELETE | /quotations/:id | quotationSchema | Quotation |
| PATCH | /quotations/:id/status | quotationStatusSchema | Quotation |
| GET / POST | /held-sales | `?locationId=` / heldSaleSchema | HeldSale[] / HeldSale |
| DELETE | /held-sales/:id | – | OkResponse |
| **Purchases** ||||
| GET / POST | /purchases | purchaseListQuerySchema / purchaseSchema | Paginated<Purchase> & `{ totals: { total, due } }` / Purchase |
| GET / PUT | /purchases/:id | purchaseSchema (only while `ordered`) | Purchase |
| POST | /purchases/:id/receive | purchaseReceiveSchema | Purchase |
| POST | /purchases/:id/cancel | – | Purchase |
| POST | /purchases/:id/payments | purchasePaymentSchema | Purchase |
| GET / POST | /purchase-returns | listQuery + `supplierId, purchaseId` / purchaseReturnSchema | Paginated<PurchaseReturn> & `{ totals: { total } }` / PurchaseReturn |
| GET | /purchase-returns/:id | – | PurchaseReturn |
| **Money** ||||
| GET | /payments | paymentListQuerySchema | Paginated<Payment> & `{ totals: { in, out } }` |
| GET | /payments/:id | – | Payment |
| POST | /payments/:id/void | voidSchema (account payments only) | Payment |
| GET / POST | /expenses | expenseListQuerySchema / expenseSchema | Paginated<Expense> & `{ totals: { amount } }` / Expense |
| GET | /expenses/:id | – | Expense |
| POST | /expenses/:id/void | voidSchema | Expense |
| GET | /shifts | listQuery + `userId, locationId, status` | Paginated<Shift> |
| GET | /shifts/current | `?locationId=` | `{ shift: Shift \| null }` (current user) |
| POST | /shifts/open | shiftOpenSchema | Shift |
| GET | /shifts/:id | – | ShiftReport |
| POST | /shifts/:id/movements | cashMovementSchema | CashMovement |
| POST | /shifts/:id/close | shiftCloseSchema | ShiftReport |
| GET / POST | /gift-cards | listQuery + `status` / giftCardSchema | Paginated<GiftCard> / GiftCard |
| GET | /gift-cards/lookup | `?code=` | GiftCard |
| GET / PATCH | /gift-cards/:id | giftCardUpdateSchema | GiftCard (with transactions) |
| **Accounting** (accounting.view / accounting.manage) ||||
| GET / POST | /accounting/accounts | `?includeInactive=1` / accountSchema (GET also allowed with `expenses.manage`) | Account[] / Account |
| PUT / DELETE | /accounting/accounts/:id | accountSchema | Account / OkResponse |
| GET / POST | /accounting/journals | journalListQuerySchema / journalSchema | Paginated<JournalEntry> / JournalEntry |
| GET | /accounting/journals/:id | – | JournalEntry (with lines) |
| POST | /accounting/journals/:id/reverse | – | JournalEntry |
| POST | /accounting/transfers | fundsTransferSchema | JournalEntry |
| GET | /accounting/ledger/:accountId | ledgerQuerySchema | LedgerResponse |
| **Reports** (reportQuerySchema: `from, to, asOf, locationId, groupBy, limit`) ||||
| GET | /reports/dashboard | `?locationId=` | DashboardData |
| GET | /reports/sales-summary | | SalesSummaryReport |
| GET | /reports/products | + `categoryId` | ProductSalesRow[] |
| GET | /reports/categories | | CategorySalesRow[] |
| GET | /reports/profit-loss | | ProfitLossReport |
| GET | /reports/balance-sheet | `asOf` | BalanceSheetReport |
| GET | /reports/trial-balance | `asOf` | TrialBalanceReport |
| GET | /reports/cash-flow | | CashFlowReport |
| GET | /reports/tax | | TaxReport |
| GET | /reports/inventory-valuation | `locationId` | InventoryValuationReport |
| GET | /reports/receivables-aging | `asOf` | AgingReport |
| GET | /reports/payables-aging | `asOf` | AgingReport |
| GET | /reports/expenses | | ExpenseReport |
| **Audit** ||||
| GET | /audit-logs | listQuery + `userId, entityType` | Paginated<AuditLog> |

## Accounting rules (auto-posted journals)

| Event | Debit | Credit |
|---|---|---|
| Sale invoice | Accounts Receivable (total) | Sales (net), Sales Tax Payable (tax), Rounding (±) |
| ↳ cost of goods | COGS | Inventory |
| Tender: payment method | Method's account (Cash/Card/Bank…) | Accounts Receivable |
| Tender: store credit | Customer Store Credit | Accounts Receivable |
| Tender: gift card | Gift Card Liability | Accounts Receivable |
| Tender: loyalty points | Loyalty Redemptions & Discounts | Accounts Receivable |
| Sales return (credit note) | Sales Returns (net), Sales Tax Payable (tax) | Accounts Receivable (total) |
| ↳ restocked goods | Inventory | COGS |
| ↳ damaged goods | Inventory Adjustments & Shrinkage | COGS |
| Refund in money | Accounts Receivable | Method account |
| Refund to store credit | Accounts Receivable | Customer Store Credit |
| Customer payment on account | Method account | AR (allocated) / Store Credit (advance) |
| Purchase received | Inventory (net + freight), Input Tax | Accounts Payable |
| Supplier payment | AP (allocated) / Supplier Advances (advance) | Method account |
| Purchase return | Accounts Payable | Inventory (at the location's average cost), Input Tax; difference from the bill's net → Shrinkage |
| Expense | Expense account, Input Tax | Method account |
| Stock adjustment + / − | Inventory / Shrinkage | Shrinkage / Inventory (opening stock → Opening Balance Equity) |
| Gift card sold / promotional | Method account / Marketing | Gift Card Liability |
| Shift over / short | Cash / Cash Over-Short | Cash Over-Short / Cash |
| Cash drawer pay-in / pay-out | Cash / chosen account | chosen account / Cash |
| Opening balances | AR / Opening Equity | Opening Equity / AP |
| Void | exact reversal of the original entries | |

### Stock valuation

Each stock level (variant × location) holds its value at cost in `stock_levels.value`. Every stock movement posts the same
ledger amount to the Inventory account and to that value, so the Inventory account always equals the stock valuation report.

* Goods leave a location at its average cost (value ÷ quantity). Taking the last units takes the whole remaining value.
* Sale lines and return lines store their exact cost amount (`cost_amount`), so voids and returns reverse what was posted.
* Receipts enter at the landed value the purchase journal books (net + allocated freight).
* A manual cost edit revalues every location at the new cost and posts the difference to Inventory.
* `variants.cost_price` is the average cost for display and defaults; the ledger is driven by the stored values.
