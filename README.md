# ShopBooks — billing, inventory & accounting for shops

A complete point-of-sale, inventory and double-entry accounting system for retail shops (clothing,
footwear, electronics, grocery, pharmacy-style counters, gift shops…), built entirely on Cloudflare:

* **Frontend** — Next.js 16 (App Router, static export), Tailwind CSS v4, Radix UI, TanStack Query, Recharts
* **Backend** — Hono on Cloudflare Workers
* **Database** — Cloudflare D1 (SQLite) via Drizzle ORM
* **Files** — Cloudflare R2 (product images, logos)
* **Hosting** — one Worker serves both the API (`/api/*`) and the web app (Workers Static Assets)

```
apps/
  api/      Hono Worker: routes, services (posting engine), D1 schema + migrations
  web/      Next.js app (static export → apps/web/out)
packages/
  shared/   Contract shared by both: zod schemas, DTO types, money & tax engine, permissions
docs/
  API.md        Endpoint reference + accounting posting rules
  FRONTEND.md   UI conventions, hooks and components
scripts/
  e2e.mjs   End-to-end business scenario + books reconciliation test
```

## Features

**Point of sale** — fast product grid & search, barcode scanner support, variants (size/colour…),
retail & wholesale price tiers, line and cart discounts (amount / %), tax-inclusive or exclusive pricing,
cash rounding, split payments (cash, card, bank, mobile/QR, cheque, custom methods), change calculation,
**sell on credit (pay later)** with credit limits and due dates, store credit, gift cards, loyalty points,
park / resume sales, salesperson attribution, A4 invoices and 58/80 mm thermal receipts.

**Returns & exchanges** — return any part of an invoice (respecting the original discounts and tax),
restock or write off damaged goods, refund in money or to store credit, credit automatically reduces an
unpaid invoice first, **exchanges in one step** (return + new items, settle the difference either way),
return-window policy, voids with full reversal.

**Customers** — accounts with due balance & store credit, opening balances, receive payments on account
(auto-allocated oldest-first or to chosen invoices; overpayment becomes an advance), apply credit to
invoices, pay out credit, statements, loyalty points, birthdays, price tier.

**Products & inventory** — categories, brands, units (incl. decimal units like metres/kg), variants
with option matrix, SKU/barcode (auto-SKU), cost/selling/MRP/wholesale prices, reorder levels, images,
services (non-stock items), multi-location stock, opening stock, adjustments (count, damage, theft,
expiry, internal use…), transfers between branches, full movement history, barcode label printing,
weighted-average costing.

**Purchasing** — purchase orders → goods received, freight/landed cost capitalised into stock, supplier
invoices on credit with payment terms, partial payments, supplier advances & credits, purchase returns
(debit notes) settled as credit or refund, supplier statements.

**Money** — payments register, expenses by category with recoverable tax, cash register shifts
(opening float, pay-ins/outs, blind count, over/short, Z-report), gift cards (sold or promotional).

**Accounting** — automatic double-entry journals for every transaction, chart of accounts, manual
journals & reversals, fund transfers (cash → bank, owner drawings), general ledger, trial balance,
profit & loss, balance sheet, cash flow, tax report (output vs input), receivables & payables aging,
inventory valuation, sales/product/category/staff/hour analytics, dashboard, audit log.

**Team** — roles (owner, admin, manager, cashier, accountant) with permission-gated UI and API,
multiple locations, per-user default location.

See `docs/API.md` for the posting rules (which accounts each event debits/credits).

## Local development

Requirements: Node.js 20+.

```bash
npm install
npm run db:migrate:local          # create the local D1 database
npm run dev:api                   # API on http://localhost:8787
npm run dev:web                   # web on http://localhost:3000 (uses NEXT_PUBLIC_API_URL)
```

Create `apps/web/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8787`, open
http://localhost:3000/signup and create your shop.

Run the end-to-end accounting test against the local API:

```bash
node scripts/e2e.mjs http://localhost:8787
```

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler d1 create shopbooks-db          # copy the database_id into apps/api/wrangler.jsonc
npx wrangler r2 bucket create shopbooks-files
npm run db:migrate:remote
npm run deploy                               # builds the web app and deploys one Worker
```

The deployed Worker serves the app at its root and the API under `/api` — same origin, so no CORS or
API URL configuration is needed in production. D1 runs every business operation as a single atomic
batch; the Workers Paid plan is recommended for real shops (higher per-request query limits).

## Schema changes

Edit `apps/api/src/db/schema.ts`, then `npm run db:generate -w @shopbooks/api` to create a new SQL
migration in `apps/api/migrations`, and apply it with `db:migrate:local` / `db:migrate:remote`.
