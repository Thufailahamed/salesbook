# ShopBooks web app — frontend guide

Next.js 16 App Router, **static export** (`output: "export"`), React 19, Tailwind CSS v4, radix-ui, TanStack Query v5.
Everything is a client component that talks to the Hono API (`docs/API.md`). Read this before building a page.

```
apps/web/src
├── app/
│   ├── layout.tsx              root: fonts, globals.css, AppProviders, no-flash theme script
│   ├── globals.css             design tokens (OKLCH) for light + dark, utilities (.num, .label-caps), print CSS
│   ├── page.tsx                public marketing home "/" (components/marketing/landing.tsx); dashboard lives at /dashboard
│   ├── (auth)/login|signup     split-screen auth (no session)
│   ├── (app)/…                 AuthGuard + AppShell (sidebar, top bar, ⌘K palette). All business pages live here.
│   ├── (pos)/pos               AuthGuard, full-screen, no sidebar
│   └── (print)/print/…         AuthGuard, plain canvas for printable documents
├── components/
│   ├── ui/                     primitives (button, input, select, dialog, sheet, table, tabs, badge, card…)
│   ├── layout/                 auth-guard, app-shell, sidebar, topbar, command-palette, nav.ts, brand
│   ├── charts/                 TrendAreaChart, SimpleBarChart, DonutChart, Sparkline, ChartTooltipBox
│   ├── print/print-shell.tsx   PrintToolbar, PrintPage, DocHeader, PartyBlock, PrintTable, TotalsBlock, Receipt*
│   └── *.tsx                   app building blocks (page-header, data-table, filters, money, pickers…)
├── hooks/                      use-session, use-money, use-api, use-debounce, use-local-storage, use-hotkeys
├── providers/                  app-providers (query, theme, tooltip, confirm, toaster), session-provider, theme-provider
└── lib/                        api.ts (fetch client), utils.ts (cn + formatters)
```

## Golden rules

1. Every page file starts with `"use client";` and default-exports a component. No `generateStaticParams`, no server data fetching.
2. **Detail routes use query params**: `/sales/view?id=…`, `/products/edit?id=…`. Any component calling `useSearchParams()` must be rendered inside `<React.Suspense>`:
   ```tsx
   export default function Page() {
     return <React.Suspense fallback={<DetailSkeleton />}><InvoiceView /></React.Suspense>;
   }
   function InvoiceView() { const id = useSearchParams().get("id"); … }
   ```
3. **Money is always integer minor units.** Display with `<Money value={…} />` or `useMoney().format()`. Input with `<MoneyInput value={minor} onChange={setMinor} />`. Never show raw integers.
4. Use the shared contract: types from `@shopbooks/shared` (`Invoice`, `Paginated<T>`, `CheckoutInput`…), totals with `calculateDocument()` (identical to the API).
5. Gate actions with `const { can } = useSession(); can("sales.void")`. Nav items are already filtered.
6. Layout: `PageHeader` at the top, then cards (`SectionCard`/`Card`) and `DataTable`s. Content max width is handled by the shell. Use `grid gap-6` between sections, `lg:grid-cols-3` with a `lg:col-span-2` main column for detail pages.

## Data: `lib/api.ts` + `hooks/use-api.ts`

```ts
api.get<T>(path, query?)  api.post<T>(path, body?)  api.put<T>  api.patch<T>  api.del<T>(path)  api.upload(file) → {url,key}
// paths are relative to /api, e.g. api.get<Invoice>(`/sales/${id}`)
// throws ApiError { status, code, message, details }; 401 on non-auth routes redirects to /login
assetUrl(url)      // ALWAYS wrap image URLs from the API: "/api/files/<key>" → prefixed with NEXT_PUBLIC_API_URL
                   // (dev runs the API on :8787); absolute/data:/blob: URLs pass through. `fileUrl` is an alias.
errorMessage(err)  // human message for any error
```
`<img src={assetUrl(product.imageUrl) ?? undefined} />` — after `api.upload(file)` store the returned `url` (relative) and render it via `assetUrl`.

List endpoints that return extra totals (type them as `Paginated<T> & { totals: … }`):
`/sales` `{ total, due }`, `/returns` `{ total }`, `/purchases` `{ total, due }`, `/purchase-returns` `{ total }`,
`/payments` `{ in, out }`, `/expenses` `{ amount }`, `/inventory/stock` `{ quantity, value, retailValue }`, `/customers` (see docs/API.md).
Show them in a `DataTable` `footer` row or a small stat strip above the table.

```tsx
// GET — key is [path, query]; pass null path to disable
const { data, isLoading, isFetching, error, refetch } =
  useApiQuery<Paginated<Invoice>>("/sales", { page, pageSize: 25, q, from: range.from, to: range.to });

// mutations — toasts errors automatically; invalidates every query whose path starts with a prefix
const save = useApiMutation((body: CustomerInput) => api.post<Customer>("/customers", body), {
  invalidate: ["/customers"],        // also refreshes "/customers/abc", "/customers/abc/statement"…
  success: "Customer saved",          // or (res) => `Saved ${res.name}`
  onSuccess: (c) => router.push(`/customers/view?id=${c.id}`),
});
<Button loading={save.isPending} onClick={() => save.mutate(form)}>Save</Button>
```
After sales/purchases/payments also invalidate `"/reports"`, `"/inventory"`, `"/products"`, `"/customers"` etc. as relevant.

## Session, money, misc hooks

```ts
const { user, business, locations, activeLocations, taxRates, paymentMethods, permissions,
        can, locationId, location, setLocationId, refresh } = useSession();
// locationId = the working location selected in the top bar (persisted in localStorage "sb.locationId")
// refresh() re-fetches /auth/me (call after changing settings, tax rates, payment methods, locations)

const money = useMoney();
money.format(12345)            // "$123.45" (business currency + locale)
money.format(v, { signed: true, symbol: false, compact: true })
money.formatCompact(1234500)   // "$12.3K"
money.toMinor(12.5) / money.toMajor(1250) / money.symbol / money.decimals

useDebounce(value, 300); useLocalStorage(key, initial); useHotkeys("f2, mod+enter", handler, { enableInInputs })
usePageTitle("Title")          // PageHeader sets document.title automatically for string titles
const confirm = useConfirm();  // promise-based dialog
if (!(await confirm({ title: "Delete product?", description: "…", tone: "destructive", confirmText: "Delete" }))) return;
const reason = await confirm({ title: "Void invoice", requireReason: true, tone: "destructive" }); // string | false
useBusinessToday()             // "YYYY-MM-DD" in the business timezone (from components/filters)
```

`lib/utils.ts`: `cn`, `formatDate(dateOrTs, opts?)`, `formatDateTime(ts)`, `formatTime(ts)`, `formatQty(n)`, `formatNumber(n, digits?)`,
`formatPercent(n)` (input already in %), `todayISO(tz?)`, `relativeTime(ts)`, `initials`, `percentChange(cur, prev)`, `withQuery(path, query)`,
`downloadFile(name, content)`, `toCSV(rows)`.

## UI primitives (`components/ui/*`)

| Component | Notes |
|---|---|
| `Button` | `variant`: default, secondary, outline, ghost, destructive, success, soft, link · `size`: xs, sm, default, lg, xl, icon, icon-sm, icon-xs · `loading` · `asChild` (wrap `<Link>`) |
| `Input` | `icon={<Search/>}`, `prefix="$"`, `suffix="%"`, `wrapperClassName` (when icon/prefix/suffix is used) |
| `Textarea`, `Label`, `Checkbox`, `Switch`, `Separator`, `Skeleton`, `Spinner`, `Kbd`, `Progress` | standard |
| `Select, SelectTrigger(size), SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel` | radix; item values must be non-empty strings |
| `RadioGroup, RadioGroupItem, RadioCard` | `RadioCard` = selectable card option (refund method, etc.) |
| `Dialog, DialogContent(size: sm/md/lg/xl/2xl/full, hideClose), DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter` | body scrolls; wrap header/body/footer in `<form className="contents">` for forms |
| `Sheet, SheetContent(side), SheetHeader, SheetTitle, SheetBody, SheetFooter` | side panels |
| `AlertDialog…` | prefer `useConfirm()` |
| `DropdownMenu…` | `DropdownMenuItem variant="destructive"` |
| `Popover`, `Tooltip` / `Hint label="…"` | `<Hint label="Refresh"><Button size="icon-sm">…</Button></Hint>` |
| `Tabs variant="pill" \| "underline"`, `TabsList`, `TabsTrigger`, `TabsContent` | |
| `Badge variant` neutral/primary/success/warning/danger/info/outline/solid, `dot` | |
| `Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter` | |
| `Table, TableHeader(sticky), TableBody, TableFooter, TableRow, TableHead(align), TableCell(align, numeric)` | `numeric` = right + tabular |
| `Avatar name src size square` | initials with stable colour |
| `ToggleGroup type="single"`, `ToggleGroupItem` | segmented control |
| `Command…`, `CommandDialog` | cmdk |

## App components

```tsx
<PageHeader title="Invoices" description="…" actions={<Button>New</Button>} backHref="/sales"
  breadcrumbs={[{ label: "Sales", href: "/sales" }, { label: inv.number }]} badge={<PaymentStatusBadge status="paid" />} />

<StatCard label="Today's sales" value={money.format(x)} icon={Wallet} tone="primary|success|warning|danger|info|neutral"
  delta={12.3} deltaLabel="vs yesterday" invertDelta sublabel="…" sparkline={[…]} loading href="/sales" size="sm" />

<SectionCard title="Items" description="…" icon={Package} action={<Button size="sm">Add</Button>} footer={…} flush>
  {/* flush = no padding, for tables/lists */}
</SectionCard>

<KeyValue columns={2} items={[{ label: "Customer", value: inv.customerName }, …]} />          // stacked
<KeyValue layout="inline" items={[{ label: "Subtotal", value: <Money value={…} /> }]} />    // totals list

<Field label="Name" htmlFor="name" required hint="…" error={errors.name}><Input id="name" … /></Field>
<FieldGrid cols={2}>…</FieldGrid>    <ToggleRow title="Allow credit" description="…"><Switch … /></ToggleRow>

<EmptyState icon={Receipt} title="No invoices" description="…" action={<Button>…</Button>} compact />
<PageLoader />  <DetailSkeleton />  <ErrorState message={error.message} onRetry={refetch} />   {/* title defaults to "Something went wrong" */}

<Money value={minor} tone="default|auto|positive|signed|muted" compact plain dashZero />
<MoneyInput value={minor} onChange={setMinor} allowNegative hideSymbol />
<QtyInput value={qty} onChange={setQty} steppers allowDecimal min={0} max={10} size="sm" />
<PercentInput value={pct} onChange={setPct} />

<PaymentStatusBadge status /> <InvoiceStatusBadge status /> <PurchaseStatusBadge status /> <QuotationStatusBadge status />
<GiftCardStatusBadge status /> <ShiftStatusBadge status /> <ActiveBadge active /> <StockBadge quantity reorderLevel />
<StatusBadge variant="warning">Custom</StatusBadge>
```

### DataTable (list pages)

```tsx
const [page, setPage] = React.useState(1);
const [q, setQ] = React.useState("");
const [range, setRange] = React.useState<DateRange>({});
const [status, setStatus] = React.useState<string | undefined>();
const { data, isLoading, isFetching } = useApiQuery<Paginated<Invoice>>("/sales", { page, pageSize: 25, q, ...range, paymentStatus: status });

const columns: Column<Invoice>[] = [
  { key: "number", header: "Invoice", cell: (r) => <span className="font-mono text-[12.5px] font-medium">{r.number}</span> },
  { key: "customer", header: "Customer", cell: (r) => r.customerName ?? "Walk-in", hideBelow: "md" },
  { key: "total", header: "Total", numeric: true, cell: (r) => <Money value={r.total} /> },
];

<DataTable
  columns={columns} rows={data?.data} rowKey={(r) => r.id} loading={isLoading || isFetching}
  onRowClick={(r) => router.push(`/sales/view?id=${r.id}`)}
  toolbar={<>
    <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search invoices…" />
    <DateRangePicker value={range} onChange={(r) => { setRange(r); setPage(1); }} />
    <FilterSelect value={status} onChange={setStatus} allLabel="All statuses" options={[{ value: "paid", label: "Paid" }]} />
  </>}
  pagination={{ page, pageSize: 25, total: data?.total ?? 0, onPageChange: setPage }}
  empty={<EmptyState icon={Receipt} title="No invoices yet" />}
  footer={<TableRow>…totals…</TableRow>}
/>
```
`Column<T>`: `{ key, header, cell(row, i), align?, numeric?, className?, headerClassName?, width?, hideBelow?: "sm"|"md"|"lg" }`.
Props: `bare` (no card), `stickyHeader`, `skeletonRows`, `rowClassName(row)`. `DATE_PRESETS`, `presetRange("month", today)` are exported from `components/filters`.

### Pickers & selects

```tsx
<CustomerPicker value={customerId} onChange={(id, customer) => …} allowWalkIn allowCreate size="lg" />   // shows due/credit balances
<SupplierPicker value={supplierId} onChange={(id, supplier) => …} />
<VariantPicker onSelect={(item: SellableItem) => addLine(item)} locationId={…} autoFocus size="lg"
  priceTier="retail|wholesale" showPrice="price|cost" keepFocus />   // search + barcode scan (Enter → /products/lookup); press "/" hint
<BarcodeInput value onChange productId compact />   // scanner-friendly (Enter never submits), warns if another product owns the code, "Generate" makes an in-store EAN-13
// VariantPicker `onNotFound(code)`: POS uses it to offer "Add product" → /products/new?barcode=CODE (pre-fills the barcode)
<AccountPicker value={id} onChange={(id, account) => …} types={["expense"]} subtypes={["cash","bank"]} excludeIds={[…]} clearable />
useAccounts()   // Account[] cached
<PaymentMethodSelect value={methodId} onChange={setMethodId} types={["cash"]} />   PAYMENT_METHOD_ICONS[type]
<LocationSelect value={locId} onChange={setLocId} allowAll excludeId />
<TaxRateSelect value={taxRateId} onChange={setTaxRateId} />                  // null = no tax
<UserSelect value={userId} onChange={setUserId} allowAll />                   // GET /users/directory (any signed-in user)
<Combobox value onChange options={[{ value, label, description, group, keywords, render }]} onSearch loading footer />
<QuickCustomerDialog open onOpenChange onCreated />  <QuickSupplierDialog … />
```

### Charts (`components/charts`)

```tsx
<TrendAreaChart data={rows} xKey="date" series={[{ key: "netSales", name: "Net sales" }, { key: "grossProfit", name: "Profit", color: "var(--chart-2)" }]}
  height={280} xFormatter={(d) => formatDate(d, { month: "short", day: "numeric" })} yFormatter={money.formatCompact} valueFormatter={money.format} />
<SimpleBarChart data={rows} xKey="name" series={[{ key: "netSales", name: "Sales" }]} layout="vertical" colorful stacked … />
<DonutChart data={[{ name, value }]} valueFormatter={money.format} centerValue="…" centerLabel="…" legend />
<Sparkline data={[1,2,3]} color="var(--chart-2)" />
```
Colours: `var(--chart-1)` … `var(--chart-6)`, also Tailwind `bg-chart-1`.

### Print routes (`app/(print)/print/*`)

```tsx
function InvoicePrint() {
  const id = useSearchParams().get("id");
  const format = useSearchParams().get("format") ?? "a4";      // "a4" | "receipt"
  const { data } = useApiQuery<Invoice>(id ? `/sales/${id}` : null);
  return (<>
    <PrintToolbar title={data?.number} backHref={`/sales/view?id=${id}`} ready={!!data} />   {/* ?autoprint=1 prints when ready */}
    {data && format === "receipt" ? (
      <PrintPage size="receipt"><ReceiptHeader /><ReceiptDivider /><ReceiptRow label="Total" value={money.format(data.total)} bold /><ReceiptFooter /></PrintPage>
    ) : data && (
      <PrintPage>
        <DocHeader title="Invoice" number={data.number} meta={[{ label: "Date", value: formatDate(data.date) }]} />
        <div className="my-6 grid grid-cols-2 gap-6"><PartyBlock label="Bill to" name={data.customerName ?? "Walk-in customer"} lines={[data.customerPhone]} /></div>
        <PrintTable columns={…} rows={data.lines ?? []} rowKey={(l) => l.id} />
        <div className="mt-6"><TotalsBlock rows={[{ label: "Subtotal", value: … }, { label: "Total", value: …, strong: true }]} /></div>
        <DocFooter notes={data.note} terms={business.invoiceTerms} />
      </PrintPage>
    )}
  </>);
}
```
Open print pages with `window.open("/print/invoice?id=…&autoprint=1", "_blank")` or a `<Link target="_blank">`.
Use `className="no-print"` to hide anything else when printing. `BusinessBlock` renders the business identity anywhere.

## Page patterns

**List page**: `PageHeader` (title, description, primary action) → optional `StatCard` row → `DataTable` with toolbar filters + pagination. Reset `page` to 1 when filters change.

**Detail page**: Suspense + `useSearchParams` → `useApiQuery` → `DetailSkeleton` while loading → `PageHeader` with `backHref`, status badge and actions (Print, Edit, Void… in a `DropdownMenu` for secondary actions) → `grid gap-6 lg:grid-cols-3`: main column (`lg:col-span-2`) with line items in `SectionCard flush` + `Table`; side column with summary `KeyValue` cards (customer, payments, totals).

**Forms**: plain controlled state (`useState` object) + `Field` + `useApiMutation`. Validate with the shared zod schema when helpful:
`const parsed = customerSchema.safeParse(form); if (!parsed.success) setErrors(…)`. API validation errors arrive as `ApiError` with `code: "validation_error"` and are toasted automatically.
Small create/edit forms → `Dialog` (size md/lg); big documents (product, purchase, quotation) → full page.

**Empty first-run states**: always render a friendly `EmptyState` with the primary action.

**Keyboard**: `F2` opens the POS from anywhere, `⌘/Ctrl+K` opens the command palette. Pages may add their own with `useHotkeys`.

## Design tokens

"Obsidian & Brass" identity (private-banking). Layout: on desktop the app is a stone-white panel (`bg-background`,
rounded 18px, scrolls internally — `[data-scroll-root]`) floating inside an obsidian frame (`bg-frame`); the sidebar sits on
the frame (`bg-sidebar`, `sidebar-*` tokens). Colour: `bg-ink text-ink-foreground` obsidian with champagne text is the
default `<Button>` (in dark mode it becomes a champagne-gold button); brass `primary` (bronze in light, champagne in dark)
for brand, links, focus and selected states; champagne `highlight` + the `.text-gold` gradient text for rare accents (active
nav dot, the headline KPI figure). `.metal` = brushed-obsidian "black card" surface (`StatCard variant="feature"`, sidebar
workspace card) — max one per KPI row. Button variants: `default`, `ink`, `brand`, `highlight`, `outline`, `secondary`, `ghost`,
`soft`, `destructive`, `success`, `link`. Semantic `success | warning | destructive | info` with `-soft` pairs for status only.
Icons are monochrome (no tinted icon blobs); icon tiles are round `bg-muted`. Cards are borderless `rounded-2xl` with
`shadow-card` (an inset hairline in dark mode). Shadows: `shadow-xs`, `shadow-card`, `shadow-raised`, `shadow-[var(--shadow-overlay)]`.
Typography: one family, Mona Sans, at two widths — `font-sans` (100%) for UI, `font-display` (112% expanded, semibold, tight
tracking) for titles; `.figure` = expanded tabular figures for KPIs/totals; `.eyebrow` / `.label-caps` = tiny expanded caps;
`font-mono` Geist Mono for codes/doc numbers. `PageHeader` takes an `eyebrow` (brass caps line above the title).
Use `.num` (or `tabular-nums`) for every number column and `label-caps` for tiny uppercase section labels.
Typical text sizes: body `text-sm` (14px), secondary `text-[13px] text-muted-foreground`, table header 10.5px expanded caps, page title 32px expanded display.
Dark mode is automatic — use tokens, never raw colours (except inside print documents, which are always light).

## Platform admin portal & billing UI

* `/admin/login` and `/admin/(portal)/*` (overview, shops + `shops/view?id=`, plans, payments, settings) use
  `components/layout/admin-shell.tsx` (its own guard against `/platform/auth/me`; `api.ts` redirects 401s on
  `/platform/*` to `/admin/login`). Money there is always LKR via `lib/platform.ts#lkr` (no business session).
* `/signup` adds a "Plan & pay" step when `/public/plans` says payment is required and sends the buyer to the
  payments.lk checkout; `/signup/complete?order=` polls until the webhook has created the shop.
* Shops see **Settings → Subscription** (`components/billing-panel.tsx`) and a renew banner (≤7 days); an expired shop's
  app shell is replaced by the same panel.


## Offline POS

* `public/sw.js` (registered by `lib/offline-sw.ts`, production builds only) caches the app shell and `/pos` so the
  till opens with no connection. It never caches `/api/*` except product images. Bump `VERSION` in it to reset caches.
* `lib/offline-db.ts`: IndexedDB `kv` (cached `/auth/me`, catalog per location, last shift) + `outbox` of queued sales.
  `AuthGuard` falls back to the cached `/auth/me` on a network error; logout clears the cache (not the outbox).
* `lib/connectivity.ts` + `useOnline()`: navigator.onLine AND last request reached the server (pings `/health` while down).
* `lib/offline-catalog.ts` + `useCatalog()`: the whole sellable catalog (paged by `offset`), refreshed every 10 min;
  `VariantPicker` and the POS grid search it locally when offline.
* `<OfflineRunner/>` (mounted in `AuthGuard`) syncs the outbox when online, keeps the catalog fresh and registers the
  worker. `<OfflineStatus/>` is the POS header pill + queue dialog (retry/discard failed sales).
* POS: `checkout` falls back to `queueSale()` on a network error or when `!online`; the payment dialog takes `offline`.


## Customer messaging

* `<SendMessageDialog kind customerId invoiceId />` (`components/send-message-dialog.tsx`): previews the server-written text,
  lets the user edit it, then "Send SMS" or "WhatsApp" (opens `wa.me` in a tab opened synchronously inside the click).
  Used from the POS sale-complete dialog, invoice view (Message menu), customer view, and the reminders page.
* `/customers/reminders`: overdue customers, one-tap "Remind N by SMS" (needs `messaging.bulk`) and a WhatsApp queue that opens one chat per click.
* Settings → Messaging (`components/messaging-settings.tsx`): Notify.lk account, country code, pay link toggle, message wording.
