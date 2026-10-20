# Agent guide — ShopBooks

Read this file first, then `HANDOFF.md` (current status + remaining tasks), `docs/API.md` (API contract +
accounting rules) and `docs/FRONTEND.md` (UI conventions, hooks, components).

## What this is

Shop billing/POS + inventory + double-entry accounting, fully on Cloudflare.

| Path | What | Tech |
|---|---|---|
| `packages/shared` | **The contract.** zod input schemas (`schemas.ts`), response DTOs (`types.ts`), money/tax engine (`calc.ts`, `money.ts`), roles & permissions, enums, default chart of accounts (`constants.ts`), date helpers | TypeScript, zod 4 |
| `apps/api` | One Cloudflare Worker: Hono API under `/api/*`, also serves the web build (Workers Static Assets) | Hono 4, Drizzle ORM 0.45, D1, R2 |
| `apps/web` | Next.js 16 App Router, **static export** (`output: "export"`) → `apps/web/out` | React 19, Tailwind v4, radix-ui, TanStack Query, Recharts, sonner, cmdk |
| `scripts/e2e.mjs` | End-to-end business scenario + books reconciliation test against a running API | Node 20+ |

## Commands (run from repo root)

```bash
npm install                                  # workspaces; root package.json has allowScripts {esbuild, workerd}
npx tsc --noEmit -p packages/shared
npx tsc --noEmit -p apps/api                 # or: npm run typecheck -w @shopbooks/api
npm run typecheck -w @shopbooks/web
npm run db:generate -w @shopbooks/api        # drizzle-kit → apps/api/migrations/*.sql (after schema changes)
npm run db:migrate:local                     # apply migrations to local D1 (.wrangler/)
npm run dev:api                              # http://localhost:8787  (wrangler dev)
npm run dev:web                              # http://localhost:3000  (apps/web/.env.local: NEXT_PUBLIC_API_URL=http://localhost:8787)
npm run build -w @shopbooks/web              # static export → apps/web/out
node scripts/e2e.mjs http://localhost:8787   # full scenario + reconciliation (needs a fresh-ish local DB is fine; it signs up a new business each run)
npm run deploy                               # build web + wrangler deploy (see README for D1/R2 setup)
```

Windows note: the dev machine is Windows 11. Prefer the PowerShell tool or Node scripts for multi-line file
operations; Git-Bash heredocs were unreliable in this environment.

## Non-negotiable conventions

**Money** is always an INTEGER in minor units (cents) in the API, DB and shared code. Only the UI converts
(`useMoney().toMinor/toMajor/format`, `<MoneyInput>` emits minor units). Quantities are REAL with 3 decimals
(`roundQty`). Tax rates are percents (e.g. `10` = 10%).

**Dates** are `"YYYY-MM-DD"` strings in the business timezone (`ctx.today`); timestamps are epoch ms.

**The contract is `packages/shared`.** If an endpoint's body/response changes, change `schemas.ts`/`types.ts`
first, then both apps. Keep `docs/API.md` in sync.

**Document totals** must be computed with `calculateDocument()` from `@shopbooks/shared` on both the POS (live
totals) and the API (authoritative). Never re-implement tax/discount math.

### API rules (apps/api)

* Every route handler gets the request context with `const ctx = c.get("ctx")` (see `src/lib/context.ts`):
  `ctx.db` (Drizzle), `ctx.businessId`, `ctx.userId`, `ctx.role`, `ctx.business`, `ctx.today`, `ctx.require(perm)`,
  `ctx.can(perm)`, `ctx.accounts()` (system account ids by key: `cash`, `receivable`, `inventory`, `sales`, …).
* **Every query must be scoped by `businessId`** (multi-tenant).
* Validation: `vJson(schema)` / `vQuery(schema)` from `src/lib/validate.ts`. Errors: throw helpers from
  `src/lib/errors.ts` (`badRequest`, `notFound`, `conflict`, `forbidden`) → JSON `{ error: { code, message } }`.
* Permissions: `requirePerm("x.y")` middleware or `ctx.require("x.y")`; the matrix lives in `shared/constants.ts`.
* **D1 has no interactive transactions.** Every business operation reads what it needs, then builds ALL writes
  into a `Tx` (`src/services/tx.ts`): `tx.add(stmt)`, `tx.journal({...})` (balanced journal entry; numbers are
  reserved at commit), `tx.audit(...)`, then `await tx.commit()` = one atomic `db.batch`.
* **D1 allows at most 100 bound parameters per statement** — use `insertMany()` (`src/lib/batch.ts`) for
  multi-row inserts and chunk `inArray` lists to ≤ 90 ids.
* Document numbers: `reserveNumbers(ctx, { invoice: 1, receipt: n })` (`src/services/sequences.ts`) BEFORE building
  the Tx.
* Stock changes only through `queueStockChanges()` (`src/services/stock.ts`); costing is weighted average.
* Every money event must post a balanced journal (see the posting table in `docs/API.md`). Sub-ledger balances
  (`customers.due_balance/credit_balance`, `suppliers.due_balance/credit_balance`, `gift_cards.balance`) must move
  in the same Tx as the journal so control accounts reconcile — `scripts/e2e.mjs` checks this.
* Reuse the core services instead of duplicating logic: `services/payments.ts` (tenders, allocations, party
  payments, voids, payment DTOs), `services/sales.ts` (`checkout` handles sale / credit sale / split tender / return /
  exchange; `addInvoicePayment`, `voidInvoice`), `services/purchases.ts`, `services/inventory.ts`
  (`createAdjustment`, `createTransfer`, `queueOpeningStock`).

### Web rules (apps/web)

* Static export: **no runtime dynamic route segments**. Detail pages use query params (`/sales/view?id=…`) and
  must wrap `useSearchParams` users in `<Suspense>`. No server actions, no route handlers, no `next/image`
  optimisation.
* All pages are client components using the hooks in `src/hooks` (`useSession`, `useMoney`, `useApiQuery`,
  `useApiMutation`) and the API client in `src/lib/api.ts` (`api.get/post/put/patch/del/upload`, `assetUrl()` for
  `/api/files/...` image URLs).
* Build UIs from the existing kit (`src/components/ui/*`) and app components (`src/components/*`: `PageHeader`,
  `DataTable`, `StatCard`, `Money`, `MoneyInput`, `QtyInput`, pickers, `StatusBadge`, `EmptyState`,
  `ConfirmDialog`, `Field`, `KeyValue`, charts, `print-shell`). Do not add new UI libraries.
* Hide actions the user can't perform: `const { can } = useSession(); can("sales.void")`.
* Design bar: premium and consistent (Mona Sans for UI, Mona Sans expanded for titles and KPI figures, Geist Mono for
  codes; tabular numbers for money; light + dark themes; responsive; loading skeletons and empty states everywhere).

## Definition of done for any change

1. `npx tsc --noEmit -p apps/api` and `npm run typecheck -w @shopbooks/web` pass.
2. `npm run build -w @shopbooks/web` succeeds.
3. API changes: `node scripts/e2e.mjs http://localhost:8787` passes against `npm run dev:api` (after
   `db:migrate:local`).
4. `docs/API.md` / `docs/FRONTEND.md` updated if contracts or conventions changed.
