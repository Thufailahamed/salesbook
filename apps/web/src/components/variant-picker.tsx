"use client";

import * as React from "react";
import { Package, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { promoPrice, type SellableItem } from "@shopbooks/shared";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Kbd } from "@/components/ui/kbd";
import { Command as CommandPrimitive } from "cmdk";
import { useApiQuery } from "@/hooks/use-api";
import { useDebounce } from "@/hooks/use-debounce";
import { useMoney } from "@/hooks/use-money";
import { useOptionalSession } from "@/hooks/use-session";
import { ApiError, api, assetUrl } from "@/lib/api";
import { cn, formatQty } from "@/lib/utils";

export interface VariantPickerProps {
  /** Called when the user picks an item (by click, Enter, or exact barcode/SKU scan). */
  onSelect: (item: SellableItem) => void;
  /** Location for stock figures (defaults to the session's selected location) */
  locationId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Show wholesale price instead of retail */
  priceTier?: "retail" | "wholesale";
  /** "cost" shows cost price (purchases); "price" shows selling price */
  showPrice?: "price" | "cost";
  /** Include service products (default true) */
  includeServices?: boolean;
  size?: "default" | "lg";
  /** Keep focus in the input after selecting (rapid entry). Default true */
  keepFocus?: boolean;
  disabled?: boolean;
}

/**
 * Product/variant search box with dropdown results and barcode support.
 * Typing searches GET /products/sellable; pressing Enter on an exact barcode/SKU adds it instantly
 * (works with USB barcode scanners that type + Enter).
 *   <VariantPicker onSelect={(item) => addLine(item)} autoFocus />
 */
export const VariantPicker = React.forwardRef<HTMLInputElement, VariantPickerProps>(function VariantPicker(
  {
    onSelect,
    locationId,
    placeholder = "Search products by name, SKU or scan barcode…",
    autoFocus,
    className,
    priceTier = "retail",
    showPrice = "price",
    includeServices = true,
    size = "default",
    keepFocus = true,
    disabled,
  },
  ref,
) {
  const session = useOptionalSession();
  const money = useMoney();
  const loc = locationId ?? session?.locationId;
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [looking, setLooking] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  const dq = useDebounce(query.trim(), 200);

  const results = useApiQuery<SellableItem[]>(
    dq ? "/products/sellable" : null,
    { q: dq, locationId: loc, limit: 30, includeServices },
    { staleTime: 10_000 },
  );
  const items = results.data ?? [];

  const pick = (item: SellableItem) => {
    onSelect(item);
    setQuery("");
    setOpen(false);
    if (keepFocus) requestAnimationFrame(() => inputRef.current?.focus());
  };

  const lookup = async (code: string) => {
    setLooking(true);
    try {
      const item = await api.get<SellableItem>("/products/lookup", { code, locationId: loc });
      pick(item);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) toast.error(`No product found for “${code}”`);
      else toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLooking(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    const q = query.trim();
    if (!q) return;
    const lower = q.toLowerCase();
    const exact = items.find((i) => i.barcode?.toLowerCase() === lower || i.sku?.toLowerCase() === lower);
    if (exact) {
      e.preventDefault();
      pick(exact);
      return;
    }
    // results not ready for this query (fast scanner) or nothing found → exact lookup
    if (dq !== q || results.isFetching || items.length === 0) {
      e.preventDefault();
      void lookup(q);
    }
  };

  const price = (i: SellableItem) => {
    if (showPrice === "cost") return i.costPrice;
    const tier = priceTier === "wholesale" && i.wholesalePrice ? i.wholesalePrice : i.price;
    return promoPrice(tier, i.promotion);
  };

  return (
    <Command shouldFilter={false} loop className={cn("h-auto overflow-visible bg-transparent", className)}>
      <Popover open={open && query.trim().length > 0} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border border-input bg-card px-3.5 shadow-xs transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15 dark:bg-input/20",
              size === "lg" ? "h-12" : "h-10",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <ScanBarcode className="size-4.5 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                setOpen(true);
              }}
              onFocus={() => query && setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              autoFocus={autoFocus}
              disabled={disabled}
              className={cn(
                "h-full w-full bg-transparent outline-none placeholder:text-muted-foreground/75",
                size === "lg" ? "text-[15px]" : "text-sm",
              )}
            />
            {(results.isFetching || looking) && <Spinner size={14} className="shrink-0 text-muted-foreground" />}
            {!query && <Kbd className="hidden sm:inline-flex">/</Kbd>}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (inputRef.current && e.target instanceof Node && inputRef.current.contains(e.target)) e.preventDefault();
          }}
          className="w-(--radix-popover-trigger-width) min-w-[min(520px,92vw)] p-0"
        >
          <CommandList className="max-h-[380px]">
            {!results.isFetching && dq && <CommandEmpty>No products match “{dq}”. Press Enter to look up the code.</CommandEmpty>}
            {items.length > 0 && (
              <CommandGroup heading={`${items.length} result${items.length === 1 ? "" : "s"}`}>
                {items.map((i) => (
                  <CommandItem key={i.variantId} value={i.variantId} onSelect={() => pick(i)} className="gap-3 py-2">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                      {i.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={assetUrl(i.imageUrl)!} alt="" className="size-full object-cover" />
                      ) : (
                        <Package className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {i.productName}
                        {i.variantName && <span className="font-normal text-muted-foreground"> · {i.variantName}</span>}
                      </p>
                      <p className="truncate font-mono text-[11.5px] text-muted-foreground">
                        {[i.sku, i.barcode].filter(Boolean).join(" · ") || "No SKU"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-sm font-semibold text-foreground">{money.format(price(i))}</p>
                      {i.trackInventory ? (
                        <p
                          className={cn(
                            "num text-[11.5px]",
                            i.stock <= 0 ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {formatQty(i.stock)} {i.unitShortName ?? "in stock"}
                        </p>
                      ) : (
                        <p className="text-[11.5px] text-muted-foreground">{i.type === "service" ? "Service" : "Not tracked"}</p>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
});
