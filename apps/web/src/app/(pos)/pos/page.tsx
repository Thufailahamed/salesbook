"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CirclePlus,
  FileUp,
  Minus,
  PackagePlus,
  PauseCircle,
  Pencil,
  Percent,
  Plus,
  RotateCcw,
  ScanBarcode,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Vault,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Category,
  CheckoutInput,
  CheckoutResponse,
  Customer,
  HeldSale,
  HeldSaleInput,
  Quotation,
  SellableItem,
  Shift,
} from "@shopbooks/shared";
import { promoLabel } from "@shopbooks/shared";
import { Brand } from "@/components/layout/brand";
import { LocationSwitcher, ThemeToggle, UserMenu } from "@/components/layout/topbar";
import { usePageTitle } from "@/components/page-header";
import { VariantPicker } from "@/components/variant-picker";
import { CustomerPicker } from "@/components/customer-picker";
import { UserSelect } from "@/components/entity-selects";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/empty-state";
import { FullPageLoader } from "@/components/loading";
import { useConfirm } from "@/components/confirm-dialog";
import { Field } from "@/components/form-field";
import { useBusinessToday } from "@/components/filters";
import { OpenShiftDialog } from "@/components/shift-dialogs";
import {
  addItem,
  cartTotals,
  emptyCart,
  lineKey,
  repriceForTier,
  returnCredit,
  settlement,
  tierPrice,
  unitPriceFor,
  type CartLine,
  type CartState,
  type ReturnSelection,
} from "@/components/pos/cart";
import { PaymentDialog, type PaymentResult } from "@/components/pos/payment-dialog";
import {
  CartOptionsDialog,
  CustomItemDialog,
  HeldSalesSheet,
  LineEditDialog,
  ReturnLookupDialog,
  SaleCompleteDialog,
} from "@/components/pos/dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/tooltip";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { ApiError, api, assetUrl } from "@/lib/api";
import { useCatalog, useOnline } from "@/hooks/use-offline";
import { OfflineStatus } from "@/components/offline/offline-status";
import { OfflineSaleDialog } from "@/components/offline/offline-sale-dialog";
import { reduceCatalogStock, searchCatalog } from "@/lib/offline-catalog";
import { kvGet, kvSet, outboxPut, type OutboxSale } from "@/lib/offline-db";
import { cn, formatQty, formatTime } from "@/lib/utils";

const INVALIDATE = [
  "/sales",
  "/returns",
  "/customers",
  "/products",
  "/inventory",
  "/reports",
  "/shifts",
  "/payments",
  "/gift-cards",
  "/held-sales",
  "/quotations",
  "/accounting",
];

export default function Page() {
  return (
    <React.Suspense fallback={<FullPageLoader />}>
      <PointOfSale />
    </React.Suspense>
  );
}

function PointOfSale() {
  usePageTitle("Point of sale");
  const router = useRouter();
  const confirm = useConfirm();
  const money = useMoney();
  const today = useBusinessToday();
  const { business, user, can, locationId, location, paymentMethods } = useSession();

  const [cart, setCart] = useLocalStorage<CartState>(`sb.pos.cart.${user.id}.${locationId}`, emptyCart());
  const [heldSaleId, setHeldSaleId] = React.useState<string | null>(null);
  const [ret, setRet] = React.useState<ReturnSelection | null>(null);
  const [saleDate, setSaleDate] = React.useState<string>(today);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<CartLine | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [customOpen, setCustomOpen] = React.useState(false);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [heldOpen, setHeldOpen] = React.useState(false);
  const [shiftOpen, setShiftOpen] = React.useState(false);
  const [result, setResult] = React.useState<CheckoutResponse | null>(null);
  const [offlineSale, setOfflineSale] = React.useState<OutboxSale | null>(null);
  const online = useOnline();
  const catalog = useCatalog(business.id, locationId);
  const [mobileView, setMobileView] = React.useState<"products" | "cart">("products");
  const searchRef = React.useRef<HTMLInputElement>(null);

  const allowed = can("pos.sell") || can("sales.return");
  React.useEffect(() => {
    if (!allowed) router.replace("/dashboard");
  }, [allowed, router]);

  const customer = useApiQuery<Customer>(cart.customerId ? `/customers/${cart.customerId}` : null);
  const cust = cart.customerId ? customer.data ?? null : null;
  const tier = cust?.priceTier ?? "retail";
  const shift = useApiQuery<{ shift: Shift | null }>(can("registers.use") ? "/shifts/current" : null, { locationId });
  // The last register shift we saw, so the till can keep selling when the shift can't be fetched.
  const shiftKey = `shift:${user.id}:${locationId}`;
  const [cachedShift, setCachedShift] = React.useState<{ shift: Shift | null } | null>(null);
  React.useEffect(() => {
    void kvGet<{ shift: Shift | null }>(shiftKey).then((v) => setCachedShift(v ?? null));
  }, [shiftKey]);
  React.useEffect(() => {
    if (shift.data) void kvSet(shiftKey, shift.data);
  }, [shift.data, shiftKey]);
  const categories = useApiQuery<Category[]>("/categories", undefined, { staleTime: 60_000 });
  const grid = useApiQuery<SellableItem[]>(
    online ? "/products/sellable" : null,
    { locationId, categoryId: categoryId ?? undefined, limit: 60 },
    { staleTime: 15_000 },
  );
  const held = useApiQuery<HeldSale[]>("/held-sales", { locationId }, { staleTime: 15_000 });

  // ---------------------------------------------------------------- URL hand-offs (customer, quotation)
  const handled = React.useRef(false);
  React.useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    // static export: useSearchParams can still be empty on the first effect run, so read the real URL
    const sp = new URLSearchParams(window.location.search);
    const cid = sp.get("customerId");
    const qid = sp.get("quotationId");
    if (cid) setCart((c) => ({ ...c, customerId: cid }));
    if (qid) {
      api
        .get<Quotation>(`/quotations/${qid}`)
        .then((q) => {
          setCart({
            ...emptyCart(),
            customerId: q.customerId,
            docDiscountType: q.docDiscountType,
            docDiscountValue: q.docDiscountValue,
            shipping: q.shipping,
            note: q.notes ?? "",
            quotationId: q.id,
            lines: (q.lines ?? []).map((l) => ({
              key: lineKey(),
              variantId: l.variantId,
              productId: null,
              name: l.name,
              variantName: "",
              sku: l.sku,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              listPrice: l.unitPrice,
              retailPrice: l.unitPrice,
              wholesalePrice: null,
              promotion: null,
              discountType: l.discountType,
              discountValue: l.discountValue,
              taxRate: l.taxRate,
              allowDecimal: true,
              trackInventory: false,
              stock: 0,
              imageUrl: null,
              unitShortName: null,
              note: null,
            })),
          });
          toast.success(`Quotation ${q.number} loaded`);
        })
        .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load the quotation"));
    }
    if (cid || qid) router.replace("/pos");
  }, [router, setCart]);

  // re-price when the customer's tier changes
  const lastTier = React.useRef(tier);
  React.useEffect(() => {
    if (lastTier.current === tier) return;
    lastTier.current = tier;
    setCart((c) => ({ ...c, lines: repriceForTier(c.lines, tier) }));
  }, [tier, setCart]);

  // ---------------------------------------------------------------- derived totals
  const totals = cartTotals(cart, { taxInclusive: business.taxInclusive, roundingIncrement: business.roundingIncrement });
  const hasSale = cart.lines.length > 0;
  const credit = returnCredit(ret);
  const st = settlement(totals.total, hasSale, credit.total, ret?.invoice.amountDue ?? 0);
  const itemCount = cart.lines.reduce((s, l) => s + l.quantity, 0);
  const shortLines = business.allowNegativeStock ? [] : cart.lines.filter((l) => l.trackInventory && l.variantId && l.quantity > l.stock);
  const knownShift = shift.data ?? (online ? null : cachedShift);
  const needsShift = business.requireShift && can("registers.use") && !shift.isLoading && !knownShift?.shift;
  const empty = !hasSale && !ret;

  const update = (patch: Partial<CartState>) => setCart((c) => ({ ...c, ...patch }));
  const setLines = (fn: (lines: CartLine[]) => CartLine[]) => setCart((c) => ({ ...c, lines: fn(c.lines) }));

  const add = (item: SellableItem) => {
    if (!can("pos.sell")) return toast.error("You can't sell items");
    if (item.trackInventory && item.stock <= 0 && !business.allowNegativeStock) {
      toast.error(`${item.displayName} is out of stock here`);
      return;
    }
    setLines((ls) => addItem(ls, item, tier));
  };

  /** A scan that matches nothing: offer to create the product with that barcode filled in. */
  const notFound = (code: string) => {
    if (!online || !can("products.manage")) return toast.error(`No product found for “${code}”`);
    toast(`No product found for “${code}”`, {
      action: { label: "Add product", onClick: () => router.push(`/products/new?barcode=${encodeURIComponent(code)}`) },
      duration: 8000,
    });
  };

  const reset = React.useCallback(() => {
    setCart({ ...emptyCart() });
    setRet(null);
    setHeldSaleId(null);
    setSaleDate(today);
  }, [setCart, today]);

  // ---------------------------------------------------------------- mutations
  /** Save a finished sale on this device; it is sent to the server as soon as there is a connection. */
  const queueSale = async (body: CheckoutInput): Promise<OutboxSale> => {
    const sale: OutboxSale = {
      ref: body.clientRef!,
      businessId: business.id,
      userId: user.id,
      createdAt: Date.now(),
      body: { ...body, date: today },
      summary: {
        total: totals.total,
        change: (body.payments ?? []).reduce((s, t) => s + Math.max(0, (t.tendered ?? 0) - t.amount), 0),
        itemCount: itemCount,
        customerName: cust?.name ?? null,
        lines: cart.lines.map((l, i) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, total: totals.lines[i]?.total ?? 0 })),
        payments: (body.payments ?? []).map((t) => ({
          label: paymentMethods.find((m) => m.id === t.methodId)?.name ?? "Payment",
          amount: t.amount,
        })),
      },
      status: "pending",
      attempts: 0,
    };
    await outboxPut(sale);
    await reduceCatalogStock(business.id, locationId, body.lines.map((l) => ({ variantId: l.variantId ?? null, quantity: l.quantity })));
    return sale;
  };

  // What can be settled without the server: plain sales paid with the shop's own payment methods.
  const canQueue = (body: CheckoutInput) =>
    body.lines.length > 0 && !body.returnFrom && !body.refund && !body.allowCredit && body.payments.every((t) => t.tender === "method");

  const checkout = useApiMutation(
    async (body: CheckoutInput): Promise<{ done: CheckoutResponse } | { queued: OutboxSale }> => {
      try {
        return { done: await api.post<CheckoutResponse>("/sales/checkout", body) };
      } catch (e) {
        // The connection dropped mid-sale. Same clientRef, so if the server did get it, it is not recorded twice.
        if (e instanceof ApiError && e.status === 0 && canQueue(body)) return { queued: await queueSale(body) };
        throw e;
      }
    },
    {
      invalidate: INVALIDATE,
      onSuccess: (out) => {
        setPayOpen(false);
        if ("queued" in out) setOfflineSale(out.queued);
        else setResult(out.done);
        reset();
      },
    },
  );

  const hold = useApiMutation(
    async (body: HeldSaleInput) => {
      if (heldSaleId) await api.del(`/held-sales/${heldSaleId}`).catch(() => undefined);
      return api.post<HeldSale>("/held-sales", body);
    },
    {
      invalidate: ["/held-sales"],
      success: "Sale on hold",
      onSuccess: () => reset(),
    },
  );

  const submit = (p: PaymentResult) => {
    const body: CheckoutInput = {
      clientRef: crypto.randomUUID(),
      locationId,
      customerId: cart.customerId,
      salespersonId: cart.salespersonId,
      date: can("pos.backdate") && saleDate !== today ? saleDate : undefined,
      dueDate: p.dueDate,
      priceTier: tier,
      lines: cart.lines.map((l) => ({
        variantId: l.variantId,
        name: l.variantId ? undefined : l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountType: l.discountType,
        discountValue: l.discountValue,
        taxRate: l.variantId ? undefined : l.taxRate,
        note: l.note,
      })),
      docDiscountType: cart.docDiscountType,
      docDiscountValue: cart.docDiscountValue,
      shipping: cart.shipping || null,
      note: cart.note.trim() || null,
      payments: p.payments,
      allowCredit: p.allowCredit,
      returnFrom: ret
        ? {
            invoiceId: ret.invoice.id,
            reason: ret.reason.trim() || null,
            lines: Object.entries(ret.picks)
              .filter(([, v]) => v.quantity > 0)
              .map(([invoiceLineId, v]) => ({ invoiceLineId, quantity: v.quantity, restock: v.restock })),
          }
        : null,
      refund: p.refund,
      quotationId: cart.quotationId,
      heldSaleId,
    };
    if (!online) {
      if (!canQueue(body)) return toast.error("This sale needs a connection. Use cash or card and no credit while offline.");
      void queueSale(body).then((sale) => {
        setPayOpen(false);
        setOfflineSale(sale);
        reset();
      });
      return;
    }
    checkout.mutate(body);
  };

  const charge = () => {
    if (empty) return;
    if (shortLines.length) return toast.error(`Not enough stock for ${shortLines[0]!.name}`);
    if (needsShift && (st.remainingSale > 0 || st.refundDue > 0)) {
      toast.error("Open a register shift before taking payments");
      setShiftOpen(true);
      return;
    }
    setPayOpen(true);
  };

  const holdCart = () => {
    if (!online) return toast.error("Holding a sale needs a connection");
    if (!hasSale) return toast.error("Add items before holding the sale");
    if (ret) return toast.error("Finish or cancel the return before holding");
    hold.mutate({
      label: cust?.name ?? null,
      locationId,
      customerId: cart.customerId,
      cart,
      total: totals.total,
      itemCount,
    });
  };

  const resume = async (h: HeldSale) => {
    if (hasSale && !(await confirm({ title: "Replace the current cart?", description: "Hold it first if you want to keep it.", confirmText: "Replace" }))) return;
    setCart({ ...emptyCart(), ...(h.cart as CartState) });
    setHeldSaleId(h.id);
    setRet(null);
    setHeldOpen(false);
    setMobileView("cart");
  };

  const clear = async () => {
    if (empty) return;
    if (await confirm({ title: "Clear the cart?", tone: "destructive", confirmText: "Clear" })) reset();
  };

  // ---------------------------------------------------------------- keyboard
  const dialogsOpen = payOpen || !!offlineSale || !!editing || customOpen || optionsOpen || returnOpen || heldOpen || shiftOpen || !!result;
  useHotkeys("f9, mod+enter", charge, { enabled: !dialogsOpen, enableInInputs: true });
  useHotkeys("f4", holdCart, { enabled: !dialogsOpen });
  useHotkeys("f8", () => setOptionsOpen(true), { enabled: !dialogsOpen && hasSale });
  useHotkeys("f2, /", () => searchRef.current?.focus(), { enabled: !dialogsOpen });
  useHotkeys("f6", () => can("sales.return") && (online ? setReturnOpen(true) : toast.error("Returns need a connection")), { enabled: !dialogsOpen });

  if (!allowed) return null;

  const openShift = (shift.data ?? (online ? null : cachedShift))?.shift;
  const chargeLabel = empty
    ? "Charge"
    : !hasSale
    ? st.refundDue > 0
      ? "Refund"
      : "Complete return"
    : st.remainingSale > 0
      ? "Charge"
      : "Complete";
  const activeCategory = categoryId ? (categories.data ?? []).find((c) => c.id === categoryId) : null;
  const shelf = online ? grid.data ?? [] : catalog ? searchCatalog(catalog.items, "", { limit: 60, categoryId }) : [];
  const lowStock = shelf.filter((i) => i.trackInventory && i.stock > 0 && i.stock <= LOW_STOCK).length;

  return (
    <>
      {/* ------------------------------------------------ top bar, on the obsidian frame */}
      <header className="dark flex h-14 shrink-0 items-center gap-2 bg-frame px-2 text-foreground sm:px-3">
        <Hint label="Back to the office">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={can("dashboard.view") ? "/dashboard" : "/sales"} aria-label="Back">
              <ArrowLeft />
            </Link>
          </Button>
        </Hint>
        <Brand className="hidden sm:flex" />
        <div className="mx-1.5 hidden h-5 w-px bg-border-strong sm:block" />
        <LocationSwitcher />
        {can("registers.use") && (
          <button
            type="button"
            onClick={() => (openShift ? router.push(`/registers/view?id=${openShift.id}`) : setShiftOpen(true))}
            className="hidden items-center gap-2 rounded-full bg-card px-3 py-1 text-[12.5px] ring-1 ring-border transition-colors hover:bg-accent md:flex"
          >
            <span className="relative flex size-2">
              {openShift && <span className="motion-anim absolute inset-0 animate-ping rounded-full bg-success/60" />}
              <span className={cn("relative size-2 rounded-full", openShift ? "bg-success" : "bg-muted-foreground/50")} />
            </span>
            {openShift ? (
              <>
                <span className="font-mono text-[12px]">{openShift.number}</span>
                <span className="text-muted-foreground">since {formatTime(openShift.openedAt)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No open shift · open one</span>
            )}
          </button>
        )}
        <div className="flex-1" />
        <OfflineStatus />
        <LiveClock />
        {can("sales.return") && (
          <Button variant={ret ? "soft" : "ghost"} size="sm" onClick={() => (online ? setReturnOpen(true) : toast.error("Returns need a connection"))}>
            <Undo2 /> <span className="hidden sm:inline">Return</span>
            <Kbd className="ml-1 hidden lg:inline-flex">F6</Kbd>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => (online ? setHeldOpen(true) : toast.error("Held sales need a connection"))}>
          <PauseCircle /> <span className="hidden sm:inline">Held</span>
          {(held.data?.length ?? 0) > 0 && (
            <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-highlight px-1 text-[10.5px] font-semibold text-highlight-foreground">
              {held.data!.length}
            </span>
          )}
        </Button>
        <ThemeToggle />
        <UserMenu />
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_452px]">
        {/* ------------------------------------------------ products: the stone panel */}
        <section
          className={cn(
            "min-h-0 flex-col overflow-hidden bg-background lg:mb-2 lg:ml-2 lg:rounded-[20px] lg:shadow-[0_0_0_1px_var(--border)]",
            mobileView === "products" ? "flex" : "hidden lg:flex",
          )}
        >
          <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <div className="mb-4 hidden items-end justify-between gap-4 sm:flex">
              <div className="min-w-0">
                <p className="eyebrow">Counter · {location?.name ?? "Store"}</p>
                <h1 className="mt-1.5 truncate text-[28px] leading-none tracking-[-0.045em] [font-stretch:120%]">
                  {activeCategory?.name ?? "All items"}
                </h1>
              </div>
              {!grid.isLoading && shelf.length > 0 && (
                <p className="shrink-0 pb-0.5 text-[12.5px] text-muted-foreground">
                  <span className="num font-medium text-foreground">{shelf.length}</span> on the shelf
                  {lowStock > 0 && (
                    <>
                      {" · "}
                      <span className="num font-medium text-warning-soft-foreground">{lowStock}</span> running low
                    </>
                  )}
                </p>
              )}
            </div>
            <VariantPicker
              ref={searchRef}
              onSelect={add}
              onNotFound={notFound}
              locationId={locationId}
              priceTier={tier}
              size="lg"
              autoFocus
              placeholder="Search products, scan a barcode…   (F2)"
              disabled={!can("pos.sell")}
            />
            {(categories.data ?? []).some((c) => c.productCount > 0) && (
              <div className="scrollbar-none -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
                <CategoryChip on={!categoryId} onClick={() => setCategoryId(null)}>
                  All items
                </CategoryChip>
                {(categories.data ?? [])
                  .filter((c) => c.productCount > 0)
                  .map((c) => (
                    <CategoryChip key={c.id} on={categoryId === c.id} onClick={() => setCategoryId(c.id)} color={c.color} count={c.productCount}>
                      {c.name}
                    </CategoryChip>
                  ))}
              </div>
            )}
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4 sm:px-6 sm:pb-6">
            {grid.isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-52 rounded-[18px]" />
                ))}
              </div>
            ) : shelf.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {shelf.map((i) => (
                  <ProductTile
                    key={i.variantId}
                    item={i}
                    tier={tier}
                    onClick={() => add(i)}
                    inCart={cart.lines.filter((l) => l.variantId === i.variantId).reduce((s, l) => s + l.quantity, 0)}
                  />
                ))}
              </div>
            ) : categoryId ? (
              <EmptyState icon={ShoppingCart} title="Nothing here yet" description="No products in this category." />
            ) : (
              <EmptyCatalog canManage={can("products.manage")} canSell={can("pos.sell")} onCustom={() => setCustomOpen(true)} />
            )}
          </div>
        </section>

        {/* ------------------------------------------------ cart: the ticket, on the frame */}
        <aside className={cn("dark min-h-0 flex-col bg-frame text-foreground", mobileView === "cart" ? "flex" : "hidden lg:flex")}>
          <div className="flex items-center gap-2 px-3 pt-2 pb-2.5 lg:pt-0">
            <CustomerPicker
              value={cart.customerId}
              onChange={(id) => update({ customerId: id })}
              allowWalkIn
              className="flex-1"
              disabled={!!ret?.invoice.customerId}
            />
            <SaleDetails
              salespersonId={cart.salespersonId}
              onSalesperson={(id) => update({ salespersonId: id ?? null })}
              date={saleDate}
              onDate={setSaleDate}
              canBackdate={can("pos.backdate")}
              today={today}
            />
          </div>

          <div className="mx-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-card shadow-[0_24px_60px_-30px_rgb(0_0_0/0.9)] ring-1 ring-border">
            {/* ticket header */}
            <div className="flex items-center justify-between gap-3 border-b border-dashed border-border-strong px-4 py-3">
              <div className="min-w-0">
                <p className="eyebrow">{ret && !hasSale ? "Return" : ret ? "Exchange" : cart.quotationId ? "From quotation" : heldSaleId ? "Resumed sale" : "Current sale"}</p>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  {cust ? cust.name : "Walk-in customer"}
                  {saleDate !== today && <> · {saleDate}</>}
                </p>
              </div>
              <span className="num shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">
                {formatQty(itemCount)} item{itemCount === 1 ? "" : "s"}
              </span>
            </div>

            {cust && (cust.dueBalance > 0 || cust.creditBalance > 0 || cust.loyaltyPoints > 0 || cust.priceTier === "wholesale") && (
              <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5 text-[11.5px]">
                {cust.priceTier === "wholesale" && <Chip className="text-info-soft-foreground">Wholesale prices</Chip>}
                {cust.dueBalance > 0 && (
                  <Chip>
                    Owes <Money value={cust.dueBalance} className="font-semibold text-destructive-soft-foreground" />
                  </Chip>
                )}
                {cust.creditBalance > 0 && (
                  <Chip>
                    Credit <Money value={cust.creditBalance} className="font-semibold text-success-soft-foreground" />
                  </Chip>
                )}
                {business.loyaltyEnabled && cust.loyaltyPoints > 0 && <Chip>{formatQty(cust.loyaltyPoints)} pts</Chip>}
              </div>
            )}

            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              {ret && (
                <button
                  type="button"
                  onClick={() => (online ? setReturnOpen(true) : toast.error("Returns need a connection"))}
                  className="flex w-full items-center gap-3 border-b border-dashed border-border-strong bg-warning-soft/50 px-4 py-3 text-left"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                    <RotateCcw className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      Returning {formatQty(credit.count)} item{credit.count === 1 ? "" : "s"}
                    </span>
                    <span className="block font-mono text-[11.5px] text-muted-foreground">from {ret.invoice.number}</span>
                  </span>
                  <Money value={-credit.total} tone="signed" className="font-semibold" />
                </button>
              )}
              {!hasSale ? (
                !ret && <EmptyTicket />
              ) : (
                <ul className="divide-y divide-border">
                  {cart.lines.map((l, i) => {
                    const calc = totals.lines[i];
                    const lineTotal = calc ? calc.gross - calc.lineDiscount : 0;
                    const short = shortLines.includes(l);
                    return (
                      <li key={l.key} className="group px-4 py-3.5 transition-colors hover:bg-accent/40">
                        <div className="flex gap-3">
                          <Thumb name={l.name} imageUrl={l.imageUrl} className="size-11 rounded-xl" />
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(l)}>
                            <p className="truncate text-[13.5px] leading-tight font-medium">{l.name}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {l.variantName && <>{l.variantName} · </>}
                              <span className="num">{money.format(l.unitPrice)}</span>
                              {l.unitPrice !== l.listPrice && l.variantId && <span className="ml-1 text-warning">(was {money.format(l.listPrice)})</span>}
                              {l.discountType && (
                                <span className="ml-1 text-success-soft-foreground">
                                  −{l.discountType === "percent" ? `${l.discountValue}%` : money.format(l.discountValue)}
                                </span>
                              )}
                            </p>
                            {l.note && <p className="truncate text-xs text-muted-foreground italic">{l.note}</p>}
                            {short && <p className="text-xs font-medium text-destructive-soft-foreground">Only {formatQty(l.stock)} in stock</p>}
                          </button>
                          <Money value={lineTotal} className="num pt-0.5 text-[14px] font-semibold" />
                        </div>
                        <div className="mt-2.5 flex items-center gap-1 pl-14">
                          <QtyStep
                            value={l.quantity}
                            unit={l.unitShortName}
                            onChange={(q) =>
                              q <= 0
                                ? setLines((ls) => ls.filter((x) => x.key !== l.key))
                                : setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: q } : x)))
                            }
                            step={1}
                          />
                          <div className="flex-1" />
                          <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setEditing(l)} aria-label={`Edit ${l.name}`}>
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="opacity-50 group-hover:opacity-100 hover:text-destructive-soft-foreground"
                            onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                            aria-label={`Remove ${l.name}`}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* totals: the foot of the ticket */}
            <div className="border-t border-dashed border-border-strong bg-muted/40 px-4 pt-3 pb-4">
              <dl className="grid gap-1.5 text-[13px]">
                <Row label={`Subtotal · ${formatQty(itemCount)} item${itemCount === 1 ? "" : "s"}`} value={totals.subtotal} />
                {totals.docDiscount > 0 && (
                  <Row label={`Discount${cart.docDiscountType === "percent" ? ` (${cart.docDiscountValue}%)` : ""}`} value={-totals.docDiscount} />
                )}
                {totals.taxTotal > 0 && <Row label={business.taxInclusive ? "Tax (included)" : "Tax"} value={totals.taxTotal} muted={business.taxInclusive} />}
                {totals.shipping > 0 && <Row label="Charges" value={totals.shipping} />}
                {totals.roundOff !== 0 && <Row label="Rounding" value={totals.roundOff} muted />}
                {ret && hasSale && <Row label="Total" value={totals.total} />}
                {ret && st.appliedToExchange > 0 && <Row label="Exchange credit" value={-st.appliedToExchange} />}
                {ret && st.appliedToOriginal > 0 && <Row label={`Reduces ${ret.invoice.number} balance`} value={st.appliedToOriginal} muted />}
              </dl>
              <div className="mt-3 flex items-end justify-between border-t-[3px] border-double border-border-strong pt-3">
                <span className="text-[12px] font-semibold tracking-[0.14em] text-muted-foreground uppercase [font-stretch:115%]">
                  {hasSale ? (st.remainingSale > 0 ? "To pay" : "Total") : st.refundDue > 0 ? "Refund" : "Total"}
                </span>
                <span className="figure text-gold text-[32px] leading-none">{money.format(hasSale ? st.remainingSale : st.refundDue)}</span>
              </div>
            </div>
          </div>

          {/* actions + charge */}
          <div className="px-3 pt-2.5 pb-3">
            <div className="grid grid-cols-4 gap-1.5">
              <ActionTile icon={CirclePlus} label="Custom" onClick={() => setCustomOpen(true)} disabled={!can("pos.sell")} />
              <ActionTile icon={Percent} label="Discount" kbd="F8" onClick={() => setOptionsOpen(true)} disabled={!hasSale} />
              <ActionTile icon={PauseCircle} label="Hold" kbd="F4" onClick={holdCart} disabled={!hasSale || hold.isPending} />
              <ActionTile icon={Trash2} label="Clear" onClick={clear} disabled={empty} />
            </div>
            {needsShift && (
              <button
                type="button"
                onClick={() => setShiftOpen(true)}
                className="mt-2.5 flex w-full items-center gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-left text-[12.5px] text-warning-soft-foreground ring-1 ring-warning/20"
              >
                <Vault className="size-4" /> Open a register shift to take payments
              </button>
            )}
            <Button
              size="xl"
              variant="highlight"
              className="mt-2.5 h-16 w-full justify-between rounded-[18px] px-6"
              onClick={charge}
              disabled={empty || shortLines.length > 0}
            >
              <span className="flex items-center gap-2.5 text-[17px]">
                {chargeLabel}
                <Kbd className="hidden border-black/10 bg-black/10 text-current lg:inline-flex">F9</Kbd>
              </span>
              <span className="flex items-center gap-2">
                <span className="figure text-[24px]">{money.format(hasSale ? st.remainingSale : st.refundDue)}</span>
                <ArrowRight className="size-5" />
              </span>
            </Button>
          </div>
        </aside>
      </div>

      {/* mobile switcher */}
      <div className="dark flex gap-1.5 bg-frame p-2 text-foreground lg:hidden">
        <Button variant={mobileView === "products" ? "secondary" : "ghost"} className="flex-1" onClick={() => setMobileView("products")}>
          Products
        </Button>
        <Button
          variant={mobileView === "cart" ? "secondary" : itemCount > 0 ? "highlight" : "ghost"}
          className="flex-1"
          onClick={() => setMobileView("cart")}
        >
          Cart · {formatQty(itemCount)} · <Money value={totals.total} />
        </Button>
      </div>

      {/* ------------------------------------------------ dialogs */}
      <LineEditDialog
        line={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        canOverride={can("pos.priceOverride")}
        onSave={(l) => {
          setLines((ls) => ls.map((x) => (x.key === l.key ? l : x)));
          setEditing(null);
        }}
        onRemove={() => {
          if (editing) setLines((ls) => ls.filter((x) => x.key !== editing.key));
          setEditing(null);
        }}
      />
      <CustomItemDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        onAdd={(l) => {
          setLines((ls) => [...ls, l]);
          setCustomOpen(false);
        }}
      />
      <CartOptionsDialog open={optionsOpen} onOpenChange={setOptionsOpen} cart={cart} onSave={update} />
      <ReturnLookupDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        initial={ret}
        onConfirm={(sel) => {
          setRet(sel);
          if (sel?.invoice.customerId) update({ customerId: sel.invoice.customerId });
          if (sel) setMobileView("cart");
        }}
      />
      <HeldSalesSheet open={heldOpen} onOpenChange={setHeldOpen} locationId={locationId} onResume={resume} />
      <OpenShiftDialog open={shiftOpen} onOpenChange={setShiftOpen} locationId={locationId} />
      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        amountDue={st.remainingSale}
        refundDue={st.refundDue}
        customer={cust}
        pending={checkout.isPending}
        offline={!online}
        summary={
          ret
            ? [
                ...(hasSale ? [{ label: "New items", value: totals.total }] : []),
                { label: `Return credit (${ret.invoice.number})`, value: -credit.total },
                ...(st.appliedToOriginal > 0 ? [{ label: "Applied to unpaid balance", value: st.appliedToOriginal }] : []),
              ]
            : undefined
        }
        onComplete={submit}
      />
      <OfflineSaleDialog
        sale={offlineSale}
        onNewSale={() => {
          setOfflineSale(null);
          setMobileView("products");
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
      />
      <SaleCompleteDialog
        result={result}
        onNewSale={() => {
          setResult(null);
          setMobileView("products");
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
      />
      {location && !location.isActive && (
        <div className="fixed inset-x-0 bottom-0 bg-destructive p-2 text-center text-sm text-destructive-foreground">This location is inactive.</div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- pieces

/** Items at or below this count show as running low. */
const LOW_STOCK = 5;

function Row({ label, value, muted }: { label: React.ReactNode; value: number; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted-foreground")}>
      <dt className={muted ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd>
        <Money value={value} />
      </dd>
    </div>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground", className)}>{children}</span>;
}

function LiveClock() {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  if (now == null) return null;
  return <span className="num mr-1 hidden font-mono text-[12.5px] text-muted-foreground xl:block">{formatTime(now)}</span>;
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
}

function Thumb({ name, imageUrl, className }: { name: string; imageUrl: string | null; className?: string }) {
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden bg-muted ring-1 ring-border", className)}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(imageUrl)!} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-[11px] font-semibold tracking-[0.02em] text-muted-foreground [font-stretch:125%]">{initials(name)}</span>
      )}
    </span>
  );
}

function CategoryChip({
  on,
  onClick,
  children,
  color,
  count,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string | null;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap ring-1 transition-all",
        on ? "bg-ink text-ink-foreground ring-ink" : "bg-card text-foreground/75 ring-border hover:text-foreground hover:ring-border-strong",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
      {count != null && <span className={cn("num text-[11px]", on ? "text-ink-foreground/60" : "text-muted-foreground")}>{count}</span>}
    </button>
  );
}

function ProductTile({ item, tier, onClick, inCart }: { item: SellableItem; tier: "retail" | "wholesale"; onClick: () => void; inCart: number }) {
  const money = useMoney();
  const base = tierPrice(item.price, item.wholesalePrice, tier);
  const price = unitPriceFor(item, tier);
  const out = item.trackInventory && item.stock <= 0;
  const low = item.trackInventory && !out && item.stock <= LOW_STOCK;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col rounded-[18px] bg-card p-1.5 text-left ring-1 ring-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] hover:ring-border-strong active:translate-y-0 active:scale-[0.985]",
        inCart > 0 && "ring-2 ring-primary hover:ring-primary",
        out && "opacity-50",
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[13px] bg-muted">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(item.imageUrl)!} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        ) : (
          <span className="flex size-full items-center justify-center bg-[radial-gradient(120%_90%_at_30%_0%,var(--card),var(--muted))]">
            <span className="text-[30px] font-semibold tracking-[-0.04em] text-foreground/20 [font-stretch:125%]">{initials(item.productName)}</span>
          </span>
        )}
        {item.promotion && (
          <span className="absolute top-2 left-2 rounded-full bg-success px-2 py-0.5 text-[10.5px] font-semibold text-white shadow">
            {promoLabel(item.promotion, (m) => money.format(m))}
          </span>
        )}
        {inCart > 0 ? (
          <span className="absolute top-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[linear-gradient(180deg,oklch(0.92_0.06_90),oklch(0.8_0.1_80))] px-2 text-xs font-semibold text-[oklch(0.26_0.04_70)] shadow">
            ×{formatQty(inCart)}
          </span>
        ) : null}
        {!out && (
          <span className="absolute right-2 bottom-2 flex size-8 translate-y-1 items-center justify-center rounded-full bg-ink text-ink-foreground opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <Plus className="size-4" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-2 pt-2.5 pb-1.5">
        <p className="line-clamp-2 text-[13.5px] leading-snug font-medium">{item.productName}</p>
        {item.variantName && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{item.variantName}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="flex items-baseline gap-1.5">
            <span className="figure text-[15.5px] leading-none">{money.format(price)}</span>
            {price !== base && <span className="num text-[11px] text-muted-foreground line-through">{money.format(base)}</span>}
          </span>
          {item.trackInventory && (
            <span
              className={cn(
                "num flex items-center gap-1 text-[11px]",
                out ? "text-destructive" : low ? "text-warning-soft-foreground" : "text-muted-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", out ? "bg-destructive" : low ? "bg-warning" : "bg-success")} />
              {out ? "Out" : formatQty(item.stock)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ActionTile({
  icon: Icon,
  label,
  kbd,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  kbd?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-center gap-1 rounded-xl bg-card px-1 py-2.5 text-[11.5px] font-medium text-foreground/80 ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="size-4" />
      <span className="flex items-center gap-1">
        {label}
        {kbd && <span className="hidden font-mono text-[9.5px] text-muted-foreground xl:inline">{kbd}</span>}
      </span>
    </button>
  );
}

/** Empty cart: a blank receipt and the counter's keyboard shortcuts. */
function EmptyTicket() {
  const keys: [string, string][] = [
    ["F2", "Search"],
    ["F4", "Hold sale"],
    ["F6", "Return"],
    ["F8", "Discount"],
    ["F9", "Charge"],
    ["⌘ ↵", "Charge"],
  ];
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-36">
        <div className="space-y-2 rounded-t-lg bg-muted px-4 pt-4 pb-3">
          <span className="mx-auto block h-1.5 w-14 rounded-full bg-foreground/15" />
          <span className="block h-px border-t border-dashed border-foreground/15" />
          {[72, 54, 64].map((w) => (
            <span key={w} className="flex justify-between gap-3">
              <span className="h-1.5 rounded-full bg-foreground/10" style={{ width: `${w}%` }} />
              <span className="h-1.5 w-5 rounded-full bg-foreground/10" />
            </span>
          ))}
        </div>
        <svg viewBox="0 0 144 8" preserveAspectRatio="none" className="block h-2 w-full text-muted" aria-hidden="true">
          <path d="M0 0H144V2L138 8L132 2L126 8L120 2L114 8L108 2L102 8L96 2L90 8L84 2L78 8L72 2L66 8L60 2L54 8L48 2L42 8L36 2L30 8L24 2L18 8L12 2L6 8L0 2Z" fill="currentColor" />
        </svg>
      </div>
      <p className="mt-6 text-[16px] font-semibold tracking-[-0.03em] [font-stretch:115%]">Ready for the next customer</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Scan a barcode or tap a product to start.</p>
      <dl className="mt-6 grid w-full max-w-[260px] grid-cols-2 gap-x-4 gap-y-2 text-left text-[12px]">
        {keys.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <Kbd className="min-w-8 justify-center">{k}</Kbd>
            <span className="text-muted-foreground">{v}</span>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Empty catalog: what to do first, right from the counter. */
function EmptyCatalog({ canManage, canSell, onCustom }: { canManage: boolean; canSell: boolean; onCustom: () => void }) {
  const actions = [
    { href: "/products/new", icon: PackagePlus, title: "Add a product", text: "Name, price, variants, stock and barcode." },
    { href: "/products/quick-add", icon: Zap, title: "Quick add", text: "Type a few items in a row and start selling." },
    { href: "/products/import", icon: FileUp, title: "Import a CSV", text: "Bring your whole catalog in one go." },
  ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center sm:py-16">
      <div className="relative h-28 w-56" aria-hidden="true">
        {[
          "left-2 top-4 -rotate-[10deg]",
          "right-2 top-4 rotate-[10deg]",
          "left-1/2 top-0 -translate-x-1/2",
        ].map((pos, i) => (
          <div key={i} className={cn("absolute w-24 rounded-[16px] bg-card p-1.5 shadow-[var(--shadow-raised)] ring-1 ring-border", pos)}>
            <div className="flex aspect-[4/3] items-center justify-center rounded-[11px] bg-muted">
              {i === 2 && <ScanBarcode className="size-6 text-primary" strokeWidth={1.6} />}
            </div>
            <div className="space-y-1 px-1 pt-2 pb-1">
              <span className="block h-1.5 w-3/4 rounded-full bg-foreground/10" />
              <span className="block h-1.5 w-1/3 rounded-full bg-primary/40" />
            </div>
          </div>
        ))}
      </div>
      <h2 className="mt-8 text-[26px] leading-tight tracking-[-0.045em] [font-stretch:120%]">Your counter is ready.</h2>
      <p className="mt-2 max-w-sm text-[14px] text-muted-foreground">
        Add what you sell and it lands right here — ready to tap, search or scan.
      </p>
      {canManage && (
        <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex flex-col items-start rounded-[18px] bg-card p-5 text-left ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] hover:ring-border-strong"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                <a.icon className="size-[17px]" />
              </span>
              <span className="mt-4 flex items-center gap-1 text-[14px] font-semibold">
                {a.title}
                <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </span>
              <span className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{a.text}</span>
            </Link>
          ))}
        </div>
      )}
      {canSell && (
        <button type="button" onClick={onCustom} className="mt-6 text-[13px] font-medium text-primary hover:underline">
          Or sell a custom item now
        </button>
      )}
    </div>
  );
}

function QtyStep({ value, onChange, step, unit }: { value: number; onChange: (v: number) => void; step: number; unit: string | null }) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);
  return (
    <div className="flex items-center rounded-full bg-muted ring-1 ring-border">
      <button
        type="button"
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={() => onChange(value - step)}
        aria-label="Decrease"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        value={text}
        inputMode="decimal"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => {
          const n = Number.parseFloat(text);
          if (Number.isFinite(n)) onChange(Math.round(n * 1000) / 1000);
          else setText(String(value));
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="num h-7 w-9 bg-transparent text-center text-[13px] font-semibold outline-none"
        aria-label="Quantity"
      />
      {unit && <span className="pr-1 text-[11px] text-muted-foreground">{unit}</span>}
      <button
        type="button"
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={() => onChange(value + step)}
        aria-label="Increase"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function SaleDetails({
  salespersonId,
  onSalesperson,
  date,
  onDate,
  canBackdate,
  today,
}: {
  salespersonId: string | null;
  onSalesperson: (id: string | undefined) => void;
  date: string;
  onDate: (d: string) => void;
  canBackdate: boolean;
  today: string;
}) {
  const active = !!salespersonId || date !== today;
  return (
    <Popover>
      <Hint label="Salesperson & date">
        <PopoverTrigger asChild>
          <Button variant={active ? "soft" : "outline"} size="icon" aria-label="Sale details">
            <SlidersHorizontal />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="grid w-72 gap-4">
        <Field label="Salesperson" hint="Credited in staff sales reports">
          <UserSelect value={salespersonId} onChange={onSalesperson} allowAll allLabel="Me (default)" />
        </Field>
        {canBackdate && (
          <Field label="Sale date">
            <Input type="date" value={date} max={today} onChange={(e) => onDate(e.target.value || today)} />
          </Field>
        )}
      </PopoverContent>
    </Popover>
  );
}
