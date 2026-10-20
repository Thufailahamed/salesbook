"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Moon, Package, PackagePlus, Receipt, ShoppingBag, ShoppingCart, Sun, UserPlus, Users } from "lucide-react";
import type { Customer, Invoice, Paginated, SellableItem } from "@shopbooks/shared";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { Kbd } from "@/components/ui/kbd";
import { useApiQuery } from "@/hooks/use-api";
import { useDebounce } from "@/hooks/use-debounce";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useMoney } from "@/hooks/use-money";
import { useSession } from "@/hooks/use-session";
import { useTheme } from "@/providers/theme-provider";
import { formatDate } from "@/lib/utils";
import { ALL_NAV_ITEMS } from "./nav";

const CommandPaletteContext = React.createContext<{ open: () => void } | null>(null);

export function useCommandPalette() {
  return React.useContext(CommandPaletteContext);
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  useHotkeys("mod+k", () => setOpen((o) => !o), { enableInInputs: true });
  const value = React.useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </CommandPaletteContext.Provider>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { can } = useSession();
  const money = useMoney();
  const { resolvedTheme, toggle } = useTheme();
  const [q, setQ] = React.useState("");
  const dq = useDebounce(q.trim(), 220);
  const searching = dq.length >= 2;

  React.useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const products = useApiQuery<SellableItem[]>(searching && open ? "/products/sellable" : null, { q: dq, limit: 6 });
  const customers = useApiQuery<Paginated<Customer>>(searching && open && can("customers.view") ? "/customers" : null, {
    q: dq,
    pageSize: 5,
  });
  const invoices = useApiQuery<Paginated<Invoice>>(searching && open && can("sales.view") ? "/sales" : null, {
    q: dq,
    pageSize: 5,
  });
  const loading = products.isFetching || customers.isFetching || invoices.isFetching;

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const lower = q.trim().toLowerCase();
  const pages = ALL_NAV_ITEMS.filter((i) => !i.permission || can(i.permission)).filter(
    (i) => !lower || i.label.toLowerCase().includes(lower) || i.keywords?.some((k) => k.includes(lower)),
  );

  const actions = [
    { label: "New sale", icon: ShoppingCart, href: "/pos", perm: "pos.sell" as const, shortcut: "F2" },
    { label: "Add product", icon: PackagePlus, href: "/products/new", perm: "products.manage" as const },
    { label: "New purchase", icon: ShoppingBag, href: "/purchases/new", perm: "purchases.manage" as const },
    { label: "New quotation", icon: FilePlus2, href: "/sales/quotations/new", perm: "quotations.manage" as const },
    { label: "Customers", icon: UserPlus, href: "/customers", perm: "customers.manage" as const },
  ].filter((a) => can(a.perm) && (!lower || a.label.toLowerCase().includes(lower)));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false} title="Search" description="Search pages, products, customers and invoices">
      <CommandInput
        placeholder="Search pages, products, customers, invoice #…"
        value={q}
        onValueChange={setQ}
        right={loading ? <Spinner size={14} className="text-muted-foreground" /> : <Kbd>Esc</Kbd>}
      />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>{searching && loading ? "Searching…" : "No results found."}</CommandEmpty>

        {actions.length > 0 && (
          <CommandGroup heading="Quick actions">
            {actions.map((a) => (
              <CommandItem key={a.label} value={`action-${a.label}`} onSelect={() => go(a.href)}>
                <a.icon />
                {a.label}
                {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
            {(!lower || "theme dark light".includes(lower)) && (
              <CommandItem
                value="action-theme"
                onSelect={() => {
                  toggle();
                  onOpenChange(false);
                }}
              >
                {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {searching && (products.data?.length ?? 0) > 0 && (
          <CommandGroup heading="Products">
            {products.data!.map((p) => (
              <CommandItem key={p.variantId} value={`p-${p.variantId}`} onSelect={() => go(`/products/view?id=${p.productId}`)}>
                <Package />
                <span className="truncate">
                  {p.productName}
                  {p.variantName && <span className="text-muted-foreground"> · {p.variantName}</span>}
                </span>
                <span className="num ml-auto text-xs text-muted-foreground">{money.format(p.price)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searching && (customers.data?.data.length ?? 0) > 0 && (
          <CommandGroup heading="Customers">
            {customers.data!.data.map((c) => (
              <CommandItem key={c.id} value={`c-${c.id}`} onSelect={() => go(`/customers/view?id=${c.id}`)}>
                <Users />
                <span className="truncate">{c.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{c.phone}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searching && (invoices.data?.data.length ?? 0) > 0 && (
          <CommandGroup heading="Invoices">
            {invoices.data!.data.map((inv) => (
              <CommandItem key={inv.id} value={`i-${inv.id}`} onSelect={() => go(`/sales/view?id=${inv.id}`)}>
                <Receipt />
                <span className="font-mono text-[12.5px]">{inv.number}</span>
                <span className="truncate text-muted-foreground">{inv.customerName ?? "Walk-in"}</span>
                <span className="num ml-auto text-xs text-muted-foreground">
                  {formatDate(inv.date)} · {money.format(inv.total)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {pages.length > 0 && (
          <CommandGroup heading="Go to">
            {pages.map((i) => (
              <CommandItem key={i.href} value={`nav-${i.href}`} onSelect={() => go(i.href)}>
                <i.icon />
                {i.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <div className="flex items-center gap-3 border-t px-4 py-2 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd> toggle
        </span>
      </div>
    </CommandDialog>
  );
}
