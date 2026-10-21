"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CirclePlus,
  Minus,
  PauseCircle,
  Percent,
  Plus,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Vault,
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
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/tooltip";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { api, assetUrl } from "@/lib/api";
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
  const { business, user, can, locationId, location } = useSession();

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
  const categories = useApiQuery<Category[]>("/categories", undefined, { staleTime: 60_000 });
  const grid = useApiQuery<SellableItem[]>("/products/sellable", { locationId, categoryId: categoryId ?? undefined, limit: 60 }, { staleTime: 15_000 });
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
  const needsShift = business.requireShift && can("registers.use") && !shift.isLoading && !shift.data?.shift;
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

  const reset = React.useCallback(() => {
    setCart({ ...emptyCart() });
    setRet(null);
    setHeldSaleId(null);
    setSaleDate(today);
  }, [setCart, today]);

  // ---------------------------------------------------------------- mutations
  const checkout = useApiMutation((body: CheckoutInput) => api.post<CheckoutResponse>("/sales/checkout", body), {
    invalidate: INVALIDATE,
    onSuccess: (res) => {
      setPayOpen(false);
      setResult(res);
      reset();
    },
  });

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
    checkout.mutate({
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
    });
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
  const dialogsOpen = payOpen || !!editing || customOpen || optionsOpen || returnOpen || heldOpen || shiftOpen || !!result;
  useHotkeys("f9, mod+enter", charge, { enabled: !dialogsOpen, enableInInputs: true });
  useHotkeys("f4", holdCart, { enabled: !dialogsOpen });
  useHotkeys("f8", () => setOptionsOpen(true), { enabled: !dialogsOpen && hasSale });
  useHotkeys("f2, /", () => searchRef.current?.focus(), { enabled: !dialogsOpen });
  useHotkeys("f6", () => can("sales.return") && setReturnOpen(true), { enabled: !dialogsOpen });

  if (!allowed) return null;

  const openShift = shift.data?.shift;
  const chargeLabel = empty
    ? "Charge"
    : !hasSale
    ? st.refundDue > 0
      ? "Refund"
      : "Complete return"
    : st.remainingSale > 0
      ? "Charge"
      : "Complete";

  return (
    <>
      {/* ------------------------------------------------ top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:px-4">
        <Hint label="Back to the office">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={can("dashboard.view") ? "/dashboard" : "/sales"} aria-label="Back">
              <ArrowLeft />
            </Link>
          </Button>
        </Hint>
        <Brand className="hidden sm:flex" />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <LocationSwitcher />
        {can("registers.use") && (
          <button
            type="button"
            onClick={() => (openShift ? router.push(`/registers/view?id=${openShift.id}`) : setShiftOpen(true))}
            className="hidden items-center gap-2 rounded-full border border-border px-3 py-1 text-[12.5px] transition-colors hover:bg-muted md:flex"
          >
            <span className={cn("size-2 rounded-full", openShift ? "bg-success" : "bg-muted-foreground/40")} />
            {openShift ? (
              <>
                {openShift.number} <span className="text-muted-foreground">since {formatTime(openShift.openedAt)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">No open shift</span>
            )}
          </button>
        )}
        <div className="flex-1" />
        {can("sales.return") && (
          <Button variant={ret ? "soft" : "ghost"} size="sm" onClick={() => setReturnOpen(true)}>
            <Undo2 /> <span className="hidden sm:inline">Return</span>
            <Kbd className="ml-1 hidden lg:inline-flex">F6</Kbd>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setHeldOpen(true)}>
          <PauseCircle /> <span className="hidden sm:inline">Held</span>
          {(held.data?.length ?? 0) > 0 && (
            <Badge variant="solid" className="ml-0.5 px-1.5">
              {held.data!.length}
            </Badge>
          )}
        </Button>
        <ThemeToggle />
        <UserMenu />
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_460px]">
        {/* ------------------------------------------------ products */}
        <section className={cn("min-h-0 flex-col", mobileView === "products" ? "flex" : "hidden lg:flex")}>
          <div className="space-y-3 border-b border-border/70 px-4 pt-4 pb-3">
            <VariantPicker
              ref={searchRef}
              onSelect={add}
              locationId={locationId}
              priceTier={tier}
              size="lg"
              autoFocus
              placeholder="Search products, scan a barcode…   (F2)"
              disabled={!can("pos.sell")}
            />
            <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
              <CategoryChip on={!categoryId} onClick={() => setCategoryId(null)}>
                All items
              </CategoryChip>
              {(categories.data ?? [])
                .filter((c) => c.productCount > 0)
                .map((c) => (
                  <CategoryChip key={c.id} on={categoryId === c.id} onClick={() => setCategoryId(c.id)} color={c.color}>
                    {c.name}
                  </CategoryChip>
                ))}
            </div>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
            {grid.isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            ) : grid.data && grid.data.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {grid.data.map((i) => (
                  <ProductTile key={i.variantId} item={i} tier={tier} onClick={() => add(i)} inCart={cart.lines.filter((l) => l.variantId === i.variantId).reduce((s, l) => s + l.quantity, 0)} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShoppingCart}
                title="No products to show"
                description={categoryId ? "Nothing in this category yet." : "Add products to your catalog to start selling."}
                action={
                  can("products.manage") ? (
                    <Button size="sm" asChild>
                      <Link href="/products/new">Add a product</Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        </section>

        {/* ------------------------------------------------ cart */}
        <aside className={cn("min-h-0 flex-col border-l border-border bg-card", mobileView === "cart" ? "flex" : "hidden lg:flex")}>
          <div className="flex items-center gap-2 border-b border-border/70 p-3">
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
          {cust && (cust.dueBalance > 0 || cust.creditBalance > 0 || cust.loyaltyPoints > 0 || cust.priceTier === "wholesale") && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border/70 bg-muted/30 px-4 py-2 text-[12px]">
              {cust.priceTier === "wholesale" && <span className="font-medium text-info">Wholesale prices</span>}
              {cust.dueBalance > 0 && (
                <span className="text-muted-foreground">
                  Owes <Money value={cust.dueBalance} className="font-medium text-destructive" />
                </span>
              )}
              {cust.creditBalance > 0 && (
                <span className="text-muted-foreground">
                  Credit <Money value={cust.creditBalance} className="font-medium text-success-soft-foreground" />
                </span>
              )}
              {business.loyaltyEnabled && cust.loyaltyPoints > 0 && <span className="text-muted-foreground">{formatQty(cust.loyaltyPoints)} pts</span>}
            </div>
          )}

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {ret && (
              <button
                type="button"
                onClick={() => setReturnOpen(true)}
                className="flex w-full items-center gap-3 border-b border-dashed border-border bg-warning-soft/40 px-4 py-3 text-left"
              >
                <RotateCcw className="size-4 shrink-0 text-warning" />
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
              !ret && (
                <EmptyState
                  compact
                  icon={ShoppingCart}
                  title="Cart is empty"
                  description="Tap a product, scan a barcode or search to start a sale."
                  className="py-16"
                />
              )
            ) : (
              <ul className="divide-y divide-border/60">
                {cart.lines.map((l, i) => {
                  const calc = totals.lines[i];
                  const lineTotal = calc ? calc.gross - calc.lineDiscount : 0;
                  const short = shortLines.includes(l);
                  return (
                    <li key={l.key} className="group px-4 py-3">
                      <div className="flex items-start gap-3">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(l)}>
                          <p className="truncate text-sm font-medium">{l.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
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
                          {short && <p className="text-xs font-medium text-destructive">Only {formatQty(l.stock)} in stock</p>}
                        </button>
                        <Money value={lineTotal} className="pt-0.5 text-sm font-semibold" />
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <QtyStep
                          value={l.quantity}
                          unit={l.unitShortName}
                          onChange={(q) => (q <= 0 ? setLines((ls) => ls.filter((x) => x.key !== l.key)) : setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: q } : x))))}
                          step={1}
                        />
                        <div className="flex-1" />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-60 group-hover:opacity-100"
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

          {/* totals */}
          <div className="border-t border-border bg-card">
            <div className="flex items-center gap-1 border-b border-border/70 px-2 py-1.5">
              <Button variant="ghost" size="sm" onClick={() => setCustomOpen(true)} disabled={!can("pos.sell")}>
                <CirclePlus /> Custom
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOptionsOpen(true)} disabled={!hasSale}>
                <Percent /> Discount
              </Button>
              <Button variant="ghost" size="sm" onClick={holdCart} disabled={!hasSale || hold.isPending}>
                <PauseCircle /> Hold
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clear} disabled={empty}>
                Clear
              </Button>
            </div>
            <dl className="grid gap-1 px-4 pt-3 text-[13px]">
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
            {needsShift && (
              <button
                type="button"
                onClick={() => setShiftOpen(true)}
                className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-left text-[12.5px] text-warning-soft-foreground"
              >
                <Vault className="size-4" /> Open a register shift to take payments
              </button>
            )}
            <div className="p-4">
              <Button
                size="xl"
                variant="brand"
                className="w-full justify-between"
                onClick={charge}
                disabled={empty || shortLines.length > 0}
              >
                <span className="flex items-center gap-2">
                  {chargeLabel}
                  <Kbd className="hidden border-white/20 bg-white/10 text-current lg:inline-flex">F9</Kbd>
                </span>
                <span className="figure text-2xl">{money.format(hasSale ? st.remainingSale : st.refundDue)}</span>
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* mobile switcher */}
      <div className="flex border-t border-border bg-card p-2 lg:hidden">
        <Button
          variant={mobileView === "products" ? "secondary" : "ghost"}
          className="flex-1"
          onClick={() => setMobileView("products")}
        >
          Products
        </Button>
        <Button variant={mobileView === "cart" ? "secondary" : "ghost"} className="flex-1" onClick={() => setMobileView("cart")}>
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

function CategoryChip({ on, onClick, children, color }: { on: boolean; onClick: () => void; children: React.ReactNode; color?: string | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
        on ? "border-ink bg-ink text-ink-foreground" : "border-border bg-card text-foreground/80 hover:bg-muted",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function ProductTile({ item, tier, onClick, inCart }: { item: SellableItem; tier: "retail" | "wholesale"; onClick: () => void; inCart: number }) {
  const money = useMoney();
  const base = tierPrice(item.price, item.wholesalePrice, tier);
  const price = unitPriceFor(item, tier);
  const out = item.trackInventory && item.stock <= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-card text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised active:translate-y-0 dark:shadow-[inset_0_0_0_1px_var(--border)]",
        out && "opacity-55",
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(item.imageUrl)!} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
        ) : (
          <span className="flex size-full items-center justify-center font-display text-3xl text-muted-foreground/50">
            {item.productName.slice(0, 1).toUpperCase()}
          </span>
        )}
        {item.promotion && (
          <span className="absolute top-2 left-2 rounded-full bg-success px-2 py-0.5 text-[10.5px] font-semibold text-white shadow">
            {promoLabel(item.promotion, (m) => money.format(m))}
          </span>
        )}
        {inCart > 0 && (
          <span className="absolute top-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-xs font-semibold text-ink-foreground shadow">
            {formatQty(inCart)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium">{item.productName}</p>
        {item.variantName && <p className="truncate text-[11.5px] text-muted-foreground">{item.variantName}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <span className="flex items-baseline gap-1.5">
            <span className="num text-sm font-semibold">{money.format(price)}</span>
            {price !== base && <span className="num text-[11px] text-muted-foreground line-through">{money.format(base)}</span>}
          </span>
          {item.trackInventory && (
            <span className={cn("num text-[11px]", out ? "text-destructive" : "text-muted-foreground")}>{out ? "Out" : formatQty(item.stock)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function QtyStep({ value, onChange, step, unit }: { value: number; onChange: (v: number) => void; step: number; unit: string | null }) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);
  return (
    <div className="flex items-center rounded-lg border border-border bg-card">
      <button type="button" className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => onChange(value - step)} aria-label="Decrease">
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
        className="num h-7 w-10 bg-transparent text-center text-[13px] font-medium outline-none"
        aria-label="Quantity"
      />
      {unit && <span className="pr-1 text-[11px] text-muted-foreground">{unit}</span>}
      <button type="button" className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => onChange(value + step)} aria-label="Increase">
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
