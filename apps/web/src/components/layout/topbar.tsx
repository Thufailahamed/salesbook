"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, LogOut, MapPin, Menu, Monitor, Moon, Plus, Search, Settings, Sun, UserRound } from "lucide-react";
import { ROLE_LABELS } from "@shopbooks/shared";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/tooltip";
import { useSession } from "@/hooks/use-session";
import { useTheme, type Theme } from "@/providers/theme-provider";
import { clearOfflineCache } from "@/lib/offline-db";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "./command-palette";

export function LocationSwitcher({ className }: { className?: string }) {
  const { activeLocations, location, setLocationId, locationId } = useSession();
  if (activeLocations.length <= 1) {
    return location ? (
      <div className={cn("hidden items-center gap-1.5 text-[13px] text-muted-foreground md:flex", className)}>
        <MapPin className="size-3.5" />
        {location.name}
      </div>
    ) : null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("gap-1.5 text-[13px] font-medium", className)}>
          <MapPin className="text-muted-foreground" />
          <span className="max-w-36 truncate">{location?.name ?? "Select location"}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Working location</DropdownMenuLabel>
        {activeLocations.map((l) => (
          <DropdownMenuItem key={l.id} onSelect={() => setLocationId(l.id)}>
            <MapPin />
            <span className="flex-1 truncate">{l.name}</span>
            {l.id === locationId && <Check className="!text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, toggle } = useTheme();
  return (
    <Hint label={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}>
      <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle theme">
        {resolvedTheme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </Hint>
  );
}

export function UserMenu() {
  const { user, business, can } = useSession();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [loggingOut, setLoggingOut] = React.useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    qc.clear();
    void clearOfflineCache();
    router.replace("/login");
  };

  const themes: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/25 sm:pr-2"
          aria-label="Account menu"
        >
          <Avatar name={user.name} size="sm" />
          <span className="hidden text-left sm:block">
            <span className="block max-w-32 truncate text-[13px] leading-tight font-medium">{user.name}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2.5">
          <Avatar name={user.name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="truncate">{business.name}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound /> My account
          </Link>
        </DropdownMenuItem>
        {can("settings.manage") && (
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings /> Business settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />} Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {themes.map((t) => (
              <DropdownMenuItem key={t.value} onSelect={() => setTheme(t.value)}>
                <t.icon />
                <span className="flex-1">{t.label}</span>
                {theme === t.value && <Check className="!text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={logout} disabled={loggingOut}>
          <LogOut /> {loggingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const palette = useCommandPalette();
  const { can } = useSession();
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/70 sm:px-6 lg:px-10">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu />
      </Button>
      <button
        onClick={() => palette?.open()}
        className="flex h-9 w-full max-w-[380px] items-center gap-2.5 rounded-full border border-transparent bg-muted px-3.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground"
      >
        <Search className="size-[15px] shrink-0" strokeWidth={1.8} />
        <span className="flex-1 truncate">Search or jump to…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <LocationSwitcher />
        {can("pos.sell") && (
          <Button asChild size="sm" className="hidden rounded-full px-3.5 sm:inline-flex">
            <Link href="/pos">
              <Plus /> New sale
            </Link>
          </Button>
        )}
        <ThemeToggle />
        <div className="mx-0.5 hidden h-6 w-px bg-border sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
