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
| GET | /products/sellable | sellableSearchQuerySchema (`limit` ≤ 200, `offset` pages through the catalog) | SellableItem[] |
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
| **Promotions** ||||
| GET / POST | /promotions | – / promotionSchema (`productId` or `variantId`, `kind` percent \| fixed_price, `value`, `startDate`, `endDate`, `isActive`) | Promotion[] / Promotion |
| PUT / DELETE | /promotions/:id | promotionSchema / – | Promotion / OkResponse |
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
| GET | /ai/status | – | AiStatus. Each flag is true only when the server has the feature's model and this business has not switched it off |
| GET | /reports/sales-review | `?from=&to=` (default: month to date) | SalesReview `{ from, to, invoices, netSales, flags[], summary }` (`reports.view`). Flags: voids, returns (review when no reason), discounts of 20% or more, lines sold below unit cost, and anyone with 3 or more of these in the period. Rules only; `summary` only when `AI_SALESREVIEW_MODEL` is set and the `salesReview` switch is on |
| GET | /alerts | – | DailyAlert[] (any signed-in user; each check runs only for users with its area: `sales.view` overdue invoices, `suppliers.view` overdue and due-soon bills, `inventory.view` low stock). Rules only, no model. Urgent items first |
| GET | /reports/cash-forecast | – | CashForecast `{ asOf, openingCash, weeks[4], lowest, summary }` (`reports.view`). Four weeks from cash and bank balances, open invoices and bills by due date (overdue lands in week 1), typical sales (last 30 days) and expenses (last 90 days). `summary` only when `AI_CASHFLOW_MODEL` is set and the `cashForecast` switch is on |
| GET | /ai/settings | – | AiSettings `{ features: [{ key, label, description, available, enabled }] }` (any signed-in user) |
| PUT | /ai/settings | `{ features: { [key]?: boolean } }` | AiSettings (`settings.manage`). Stores the switched-off keys in `businesses.ai_disabled`. Features with no model on the server stay unavailable |
| POST | /ai/receipt | multipart `file` (JPEG/PNG/WEBP, ≤5 MB) | ReceiptScan (`expenses.manage`) |
| POST | /ai/ask | `{ question }` (3–300 chars) | AiAnswer (`reports.view`) |
| POST | /ai/bank-suggestions | `{ accountId }` | BankSuggestions (`accounting.view`). Unmatched money-out lines only, max 40 per call |
| POST | /ai/product-draft | `{ name }` | ProductDraft (`products.manage`). A suggestion only: the form fills empty fields and the user saves |
| GET | /ai/product-search | `?q=&locationId=` (2–200 chars) | SellableItem[] (`pos.sell`). Runs only when the normal POS search finds nothing. Max 20 |
| POST | /ai/reorder-advice | `{ locationId? }` | ReorderAdvice (`reports.view`). Rule checks always run; `summary` only when `AI_STOCK_MODEL` is set |
| POST | /ai/help | `{ question }` (3–300 chars) | HelpAnswer `{ answer, links[] }` (any signed-in user). The model picks up to 2 help topics the user may use, then writes the answer from those topics only. Links come from the topics. 200 with a "could not find" answer when nothing fits |
| POST | /ai/reminder-draft | `{ partyType: "customer"\|"supplier", partyId }` | ReminderDraft (`customers.view` / `suppliers.view`). Amounts and days overdue come from open invoices or received bills; the model only words the message. 400 when nothing is owed. Nothing is sent |
| POST | /accounting/close-review | `{ from?, to? }` (default: since last close, up to yesterday) | CloseReview (`accounting.view`). Rule checks always run; `summary` only when `AI_REVIEW_MODEL` is set |
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
| PUT | /accounting/books-lock | booksLockSchema (`closedThrough` date or null) | `{ booksClosedThrough }` |
| POST | /accounting/depreciation | depreciationSchema (`date`, `amount`, `memo`) | JournalEntry |
| GET | /accounting/reconciliation | `accountId`, `statementDate` | ReconciliationView |
| POST | /accounting/reconciliations | reconciliationSchema (`accountId`, `statementDate`, `statementBalance`, `lineIds`) | Reconciliation |
| DELETE | /accounting/reconciliations/:id | – (latest reconciliation of its account only) | OkResponse |
| GET / POST | /accounting/bank-statements | `?accountId=` / bankStatementImportSchema (`accountId`, `rows[{date, description, amount}]`, max 2000) | BankStatementView / `{ imported }` |
| DELETE | /accounting/bank-statements | `?accountId=` (removes unmatched lines) | OkResponse |
| POST | /accounting/bank-statements/match | bankMatchSchema (`accountId`) | BankMatchResult |
| GET / POST | /accounting/fixed-assets | – / fixedAssetSchema | FixedAssetRegister / FixedAsset |
| POST | /accounting/fixed-assets/depreciate | depreciationRunSchema (`throughDate`) | DepreciationRunResult |
| **Reports** (reportQuerySchema: `from, to, asOf, locationId, groupBy, limit`) ||||
| GET | /reports/dashboard | `?locationId=` | DashboardData |
| GET | /reports/sales-summary | | SalesSummaryReport |
| GET | /reports/products | + `categoryId` | ProductSalesRow[] |
| GET | /reports/categories | | CategorySalesRow[] |
| GET | /reports/profit-loss | reportQuerySchema | ProfitLossReport (includes `previous`: the equal-length period before) |
| GET | /reports/balance-sheet | `asOf` | BalanceSheetReport |
| GET | /reports/trial-balance | `asOf` | TrialBalanceReport |
| GET | /reports/cash-flow | | CashFlowReport |
| GET | /reports/tax | | TaxReport |
| GET | /reports/inventory-valuation | `locationId` | InventoryValuationReport |
| GET | /reports/receivables-aging | `asOf` | AgingReport |
| GET | /reports/payables-aging | `asOf` | AgingReport |
| GET | /reports/expenses | | ExpenseReport |
| GET | /reports/expiry | `locationId`, `days` (1–730, default 30) | ExpiryReport |
| GET | /reports/dead-stock | `locationId`, `days` (1–730, default 60) | DeadStockReport |
| **Audit** ||||
| GET | /audit-logs | listQuery + `userId, entityType` | Paginated<AuditLog> |

## AI features (Workers AI through Cloudflare AI Gateway)

Models run on Workers AI through the `AI` binding (`wrangler.jsonc`), and each call is routed through an AI Gateway for
logs, caching and limits. No provider API keys are needed.

| Name | Where | Purpose |
|---|---|---|
| `AI` | binding in `wrangler.jsonc` | Workers AI |
| `AI_GATEWAY_ID` | `vars` (currently `default`) | Gateway the calls go through |
| `AI_RECEIPT_MODEL` | `vars` | Workers AI model for receipts, e.g. `@cf/meta/llama-3.2-11b-vision-instruct`. Unset = feature off |
| `AI_ASK_MODEL` | `vars` | Workers AI model for Ask your books, e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Unset = feature off |
| `AI_BANK_MODEL` | `vars` | Workers AI model for bank line categories, e.g. `@cf/meta/llama-3.1-8b-instruct-fast`. Unset = feature off |
| `AI_PRODUCT_MODEL` | `vars` | Workers AI model that drafts product descriptions, tags and category from the name, e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Unset = feature off |
| `AI_SEARCH_MODEL` | `vars` | Workers AI model that turns a failed POS search into catalogue words, e.g. `@cf/meta/llama-3.1-8b-instruct-fast`. Unset = feature off |
| `AI_STOCK_MODEL` | `vars` | Workers AI model that summarises reorder advice, e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Unset = rules only |
| `AI_REVIEW_MODEL` | `vars` | Workers AI model for the pre-close review summary, e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Unset = checks only |
| `AI_REMINDER_MODEL` | `vars` | Workers AI model that words payment reminders and supplier messages, e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Unset = feature off |
| `AI_HELP_MODEL` | `vars` | Workers AI model that answers "how do I…" questions from the built-in help topics (`services/ai-help.ts`), e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Unset = feature off |
| `AI_CASHFLOW_MODEL` | `vars` | Workers AI model that writes the two-to-three sentence note on the cash-flow forecast, e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Unset = numbers only |
| `AI_SALESREVIEW_MODEL` | `vars` | Workers AI model that writes the note on the sales and refund review, e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Unset = flags only |

Llama 3.2 Vision needs Meta's licence accepted once in the Cloudflare dashboard (Workers AI → model page), or calls return 403.

**Receipt scan** reads a receipt photo and returns suggested expense values. It never saves anything: the UI fills the
expense form and the user records it through `POST /expenses`. The suggested category is always one of the business's
active expense accounts (not cost of goods sold); anything else is dropped. The model names the category, which is matched by
name. If it names none, a keyword table over the payee and note (fuel, courier, repairs, stationery, …) fills it in.
Amounts come back in minor units. The image is not stored.
These vision models ignore JSON-mode options, so the prompt asks for JSON and the reply is parsed from the text.

**Bank suggestions** propose an expense category for each unmatched money-out statement line. Nothing is posted: the
reconcile page links each suggestion to the expense form, pre-filled from the line. Once the expense is recorded,
Auto-match pairs it with the statement line. Money-in lines never get a suggestion. Categories are checked against the
business's active expense accounts.

**Ask your books** picks one of seven read-only report tools and runs it on the server. The model never runs SQL or
computes totals. Each question makes two model calls.

**Product drafts** fill a new product's description, tags and category from its name, when the user clicks "Draft with AI"
on the product form. They never overwrite text already typed. The prompt forbids claims the name does't state, such as
durability or materials. The category is matched only to the business's own list.

**Product search** is a fallback for the POS search box. When the normal search finds nothing, the model turns the
shopper's words into likely catalogue words (e.g. colours, fabrics). The server then ranks real products by how many words
they match. Size words are mapped on the server (small → S, medium → M, large → L). The model never sees or returns
products.

**Reorder advice** flags variants that have less than 14 days of stock left at their net sales rate over the last 30 days,
and variants that are out of stock. It suggests an order that covers 30 days. It also counts stock with no sales in 30
days. The rules decide everything; the model only writes a summary of them.

**Close review** runs fixed checks over a period (possible duplicate expenses, bank lines not in the books, unreconciled
bank entries, manual journals, customer balances over 90 days, no sales). It changes nothing. The model only writes a
short summary of those findings, and the summary may only restate them.

Each model call logs one `ai_usage` line (model, tokens, Neurons) to the Worker logs.

## Accounting rules (auto-posted journals)

### Period close

`businesses.books_closed_through` locks every entry dated on or before that day. The lock is enforced in `Tx.journal()`, so
sales, purchases, payments, manual journals, transfers and depreciation are all refused with a 400 before anything is written.
The lock can only be set to a date before today, so today's trade is never blocked.

### Depreciation

`POST /accounting/depreciation` posts Dr Depreciation Expense (6130) / Cr Accumulated Depreciation (1510). Both accounts are
created on first use. Accumulated depreciation is an asset account with a credit balance, so it reduces total assets on the
balance sheet. The entry is a manual journal, so it can be reversed.

### Bank reconciliation

Only cash and bank accounts can be reconciled. A reconciliation stamps the chosen journal lines with `reconciliation_id`.
Its statement balance must equal the balance cleared by earlier reconciliations plus the selected lines. Statement dates must
not go backwards. The latest reconciliation can be undone, which releases its lines.

A reconciled entry can't be reversed or voided (`queueReversals` refuses it). Undo the reconciliation first.

Bank statement lines are imported per account. Auto-match pairs each unmatched line with an uncleared book line that has the
same amount and a date within 7 days. Each book line is used once, and matched lines start ticked in the reconciliation.

### Cash flow (direct method)

`GET /reports/cash-flow` splits cash movements into activities. Each journal entry that touches a cash, bank or wallet
account is classified by the non-cash account it was paid against: fixed assets are investing, equity and long-term loans
are financing, and everything else is operating. Cash-to-cash transfers net to zero and are left out.
`netChange` equals closing minus opening cash.

### Fixed assets

Straight-line depreciation over `usefulLifeMonths`, starting the month after acquisition. A run posts the depreciation
due up to the last full month that ends on or before `throughDate`, as one journal (Dr 6130 / Cr 1510). Each asset stores
its accumulated charge and the month it was depreciated through, so running the same date again posts nothing. Assets
can't yet be disposed of.

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

### Expiry lots (FEFO)

`stock_lots` splits each stock level by expiry date (`""` = no expiry recorded). Per variant and location, the lots always add
up to `stock_levels.quantity`; the value is not split, so the ledger rules above are unchanged.

* Receipts take the expiry date of their purchase line (`purchase_lines.expiry_date`); other receipts (opening stock, returns, void restocks, count gains) go to the "no expiry" lot.
* Anything taken out (sales, transfers, write-offs, purchase returns) takes the earliest expiry first (FEFO), and the lot quantities follow the movement.
* A sale or transfer is refused while the stock it would take has expired. Write it off first with an adjustment (reason `expired`).
* Purchase lines with an expiry date already in the past are refused.
* Stock returned by a customer goes back as "no expiry" because the sale doesn't remember the batch it came from.

### Promotions

A promotion applies to a variant (or to every variant of a product) while it is active and `startDate ≤ today ≤ endDate`
(`endDate` null = open-ended). A variant offer beats a product offer. `percent` takes that % off the tier price; `fixed_price`
sets the unit price (never above the tier price). `GET /products/sellable` returns the running offer as `promotion`, and
checkout prices each catalog line with the same rule, so a changed or paused offer is caught.

## Online payments (payments.lk)

Hosted-checkout integration for invoices. Per-business config lives in `gateway_settings` (secret key and webhook
secret are write-only; reads return `hasSecretKey` / `hasWebhookSecret`).

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET/PUT | `/gateway/settings` | `settings.manage` | `GatewaySettings` / `gatewaySettingsSchema`. Enabling requires secret key, webhook secret and a payment method |
| GET | `/gateway/status` | any | `{ enabled }` — drives the "Pay online" button |
| POST | `/gateway/checkouts` | `customers.payments` | `{ invoiceId, amount? }` → `{ id, url }`; creates a `gateway_checkouts` row and a payments.lk checkout (`reference` = our row id). Redirect the browser to `url` |
| POST | `/gateway/webhook/:businessId` | public, signed | `Payments-Signature: t=…,v1=…` = HMAC-SHA256(`t.rawBody`) with the webhook secret, 300 s skew |

On `payment.succeeded` the webhook re-fetches the checkout from payments.lk (`GET /v1/checkouts/:id`), checks status
and amount, then records a normal invoice payment through `addInvoicePayment` (so the journal, receipt number and
sub-ledgers are posted exactly as for a manual receipt) using the configured payment method. `payment.failed` /
`checkout.expired` mark the checkout failed/expired. Settled checkouts are idempotent. Amounts are LKR cents.

## Platform admin, plans & subscriptions

A separate **platform admin** identity (table `platform_admins`, cookie `sb_admin_session`, Bearer also accepted) manages
every shop. Bootstrap the first admin by setting the secrets `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`
(`wrangler secret put …`; locally in `apps/api/.dev.vars`, quote values containing `#`): the first successful login with
them creates the admin. Shop tokens never work on `/platform/*` and vice versa.

`/api/platform/*` (all except `auth/login|logout` require an admin):

| Path | Notes |
|---|---|
| `POST auth/login`, `POST auth/logout`, `GET auth/me` | |
| `GET stats` | shop counts (active/expired/suspended), users, revenue, recent shops/payments |
| `GET shops?q&status=active\|expired\|suspended`, `GET shops/:id` | detail has users, usage counters, plan orders |
| `PATCH shops/:id` | `status`, `planId`, `subscriptionEndsOn` (YYYY-MM-DD / null), `extendDays`. Suspending revokes the shop's sessions |
| `PATCH users/:id` | `isActive`, `password` (reset). Revokes that user's sessions |
| `GET/POST plans`, `PUT/DELETE plans/:id` | price in LKR cents, `periodDays`, `maxUsers`/`maxLocations` (0 = unlimited). Plans in use are deactivated, not deleted |
| `GET orders?q&status` | plan purchases / renewals |
| `GET/PUT settings` | the platform's own payments.lk keys + `requirePayment` (secrets write-only) |
| `GET/POST admins`, `PATCH admins/:id` | |

**Selling the system.** `GET /public/plans` → `{ paymentRequired, plans }`. When `requirePayment` is on,
`POST /auth/signup` returns 402 and shops are created only by purchase:

1. `POST /public/purchase { planId, signup }` stores the sign-up (password hashed) in `platform_orders` and opens a
   payments.lk checkout (`reference` = order id) → `{ orderId, url }`; redirect the browser to `url`.
2. payments.lk calls `POST /public/webhook` (signature `Payments-Signature`, same scheme as the shop gateway). On
   `payment.succeeded` the order is re-verified with `GET /v1/checkouts/:id` (status + amount), then `createBusiness()`
   runs and the shop gets `planId` + `subscriptionEndsAt = now + periodDays`. Idempotent per order.
3. `GET /public/orders/:id` → `{ status }` is polled by `/signup/complete` until the order is `paid`.

When `requirePayment` is off, `POST /auth/signup` takes an optional `planId` (defaults to the first active plan, so the
API can't be used to skip plans). A paid plan starts a `TRIAL_DAYS` (14) day trial — `subscriptionEndsAt = now + 14d` —
after which the shop renews from `/billing` like any other; a free plan (price 0) never expires. With no active plans
the shop gets no plan and never expires. The signup screen shows a plan step whenever plans exist (pre-selected).

**Subscriptions.** `businesses.status` (`active|suspended`), `planId`, `subscriptionEndsAt` (null = never expires, used
by shops that predate plans). `requireAuth` returns 403 `shop_suspended` for suspended shops, and 402
`subscription_expired` for expired ones on everything except `/auth/*` and `/billing`. `GET /auth/me` carries
`subscription` (`state`: none/active/expiring(≤7d)/expired/suspended). `GET /billing` and `POST /billing/renew { planId }`
(permission `settings.manage`) let a shop renew; renewals stack on remaining time and never lift an admin suspension.
Plan limits (`maxUsers`, `maxLocations`) are enforced on user/location creation.

`PAYMENTS_LK_API` (optional env) overrides `https://api.payments.lk/v1` — `scripts/e2e-platform.mjs` points it at a
local mock. Run it with the API started using the `.dev.vars` shown in the script header; it checks admin auth, plan CRUD,
paid signup, webhook security/idempotency, plan limits, suspension, expiry + renewal, and the per-shop invoice gateway.


## Offline sales

The POS keeps selling with no connection (cash/card-style tenders only; no returns, holds, credit, gift cards or points).
Sales are queued in the browser (IndexedDB) and replayed to `POST /sales/checkout`.

* `checkoutSchema.clientRef` (8–64 chars, client-generated UUID) is an idempotency key stored on `invoices.client_ref`
  (unique per business). Re-sending a `clientRef` returns the invoice from the first attempt (`change: 0`) and records
  nothing new, so a retry after a dropped response never double-posts.
* A checkout carrying a `clientRef` may set `date` to an earlier day (the day it was rung up) without `pos.backdate`;
  future dates are ignored. The invoice number is assigned by the server at sync time.
* Stock/credit problems found at sync time come back as normal 4xx errors; the POS keeps the sale as "failed" for a
  manager to retry or discard. The sale attaches to whichever register shift is open when it syncs.


## Customer messaging (SMS / WhatsApp)

Receipts, payment reminders and "order ready" notes. SMS goes out from the server through the shop's own Notify.lk
account (`POST` form to `https://app.notify.lk/api/v1/send`; override with `NOTIFY_LK_API` in tests). WhatsApp needs no
account: the API writes the message and returns a `wa.me` URL that the browser opens; a person presses send.
Every attempt is stored in `messages` (status `sent` | `opened` | `failed`).

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET/PUT | /messaging/settings | settings.manage | provider, Notify.lk credentials (key never returned), country code, pay link, wording. Blank template = built-in text |
| GET | /messaging/status | messaging.send | `{ smsReady, countryCode }` |
| GET | /messaging/overdue | messaging.send | customers with an invoice past its due date, with last-reminded time |
| POST | /messaging/preview | messaging.send | `messageComposeSchema` → `MessagePreview` (final text incl. pay link) |
| POST | /messaging/send | messaging.send | `messageSendSchema` (`channel` sms/whatsapp, optional edited `body`, optional `phone`) → `MessageSendResult` |
| POST | /messaging/remind-overdue | messaging.bulk | SMS to many customers; skips no-phone / not-overdue / reminded within `skipRecentHours` (24) → `RemindOverdueResult` |
| GET | /messaging/log | messaging.send | recent messages, optional `customerId` |

Phone numbers are normalised with the shop's country code (`0771234567` → `94771234567`). The pay link is a payments.lk
checkout for a receipt with a balance, or for a reminder when the customer has exactly one open invoice; a pending
checkout for the same invoice and amount created within 24 h is reused. A pay link that can't be created never blocks a message.
