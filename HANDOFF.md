# Handoff — current status

**Status: feature-complete.** API, shared contract and every web screen are implemented; nothing is stubbed.

## Verified
- `npx tsc --noEmit -p packages/shared`, `-p apps/api`, `npm run typecheck -w @shopbooks/web` — clean
- `npm run build -w @shopbooks/web` — static export succeeds
- `node scripts/e2e.mjs http://localhost:8787` — 45/45 (books reconcile)
- Browser smoke test: all ~65 routes render against a real local DB without console/API errors; POS cash sale end-to-end

## Web screens (all under `apps/web/src/app`)
- POS `(pos)/pos` — product grid, barcode search, variants, line/cart discounts, custom items, wholesale tier, hold/resume,
  split tender (cash/card/store credit/gift card/loyalty), credit sale, returns & exchanges, register-shift gating.
  Logic in `components/pos/{cart.ts,payment-dialog.tsx,dialogs.tsx}`.
- Sales: invoices, returns, quotations (convert at POS via `/pos?quotationId=`)
- Catalog: products (form with option matrix `components/product-form.tsx`), categories/brands/units, barcode labels (own Code 128 encoder `components/barcode.tsx`)
- Inventory: stock, movements, adjustments (count/add/remove), transfers
- Contacts: customers, suppliers (shared dialogs in `components/party-dialogs.tsx`, statements in `components/statement-card.tsx`)
- Purchasing: purchases (PO → receive → pay), purchase returns
- Money: payments, expenses, registers (shift dialogs `components/shift-dialogs.tsx`), gift cards
- Accounting: chart of accounts + fund transfers, ledger, journals (manual + reverse)
- Reports hub + 11 reports via `components/report-shell.tsx`
- Settings (business/locations/taxes/payment methods/numbering), users, audit log
- Print routes: invoice (A4/receipt), return, quotation, purchase, statement, shift (Z/X report), labels

## Fixes made while finishing
- `GET /products/sellable` returned 500 with no search term (`ORDER BY 0`) — fixed in `services/products-read.ts`
- `GET /accounting/accounts` now also allows `expenses.manage` (expense category picker for non-accountants)
- `VariantPicker` no longer stretches to fill its parent

## Conventions worth remembering
- Next page files may only default-export; shared helpers live in `components/` or `lib/` (e.g. `lib/links.ts` → `docHref()`)
- Detail pages use `?id=` query params inside `<Suspense>`

## Possible future work
- No automated UI tests (only the API e2e script)
- Barcode labels target A4 sheets; no thermal label-printer layout
- Held sales/POS cart persist per user+location in localStorage

## Platform admin & paid signup (added)
- Super-admin portal at `/admin` (shops, plans, payments, settings, admins); selling plans via payments.lk; subscription
  enforcement (expiry/suspension/plan limits). Contract + flow: `docs/API.md` → "Platform admin, plans & subscriptions".
- Before go-live: `wrangler secret put PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`, run `db:migrate:remote`, sign in at
  `/admin/login`, create plans, paste live payments.lk keys + webhook secret in Admin → Settings, then enable "Require payment".
- Verified with `scripts/e2e-platform.mjs` (64 checks, mock payments.lk). **Not** yet tested against the real payments.lk
  sandbox — webhook payload shape is only partly documented, so the webhook re-fetches the checkout to confirm.
