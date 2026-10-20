"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { Hint } from "@/components/ui/tooltip";
import { cn, initials } from "@/lib/utils";
import { Brand } from "./brand";
import { NAV, activeNavHref } from "./nav";

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useSession();
  const active = activeNavHref(pathname);

  return (
    <nav className={cn("flex flex-col gap-6 py-3", collapsed ? "px-3" : "px-3.5")}>
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.permission || can(i.permission));
        if (items.length === 0) return null;
        return (
          <div key={group.label} className="flex flex-col gap-px">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-5 bg-sidebar-border first:hidden" />
            ) : (
              <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-sidebar-muted uppercase [font-stretch:118%]">
                {group.label}
              </p>
            )}
            {items.map((item) => {
              const isActive = active === item.href;
              const Icon = item.icon;
              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-[450] transition-[background-color,color] duration-150",
                    collapsed && "justify-center px-0",
                    isActive
                      ? "bg-sidebar-active text-sidebar-active-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06),0_1px_2px_0_oklch(0_0_0/0.3)]"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[17px] shrink-0 transition-colors",
                      isActive ? "text-highlight" : "text-sidebar-muted group-hover:text-sidebar-accent-foreground",
                    )}
                    strokeWidth={1.7}
                  />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {isActive && !collapsed && <span className="size-1.5 rounded-full bg-highlight shadow-[0_0_8px_var(--highlight)]" />}
                </Link>
              );
              return collapsed ? (
                <Hint key={item.href} label={item.label} side="right">
                  {link}
                </Hint>
              ) : (
                link
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { business } = useSession();
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col bg-sidebar text-sidebar-accent-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-[72px]" : "w-[252px]",
      )}
    >
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center px-2" : "px-6")}>
        <Link href="/" className="min-w-0">
          <Brand collapsed={collapsed} />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none">
        <SidebarNav collapsed={collapsed} />
      </div>

      <div className={cn("shrink-0 p-3", collapsed && "flex flex-col items-center gap-2")}>
        {collapsed ? (
          <>
            <Hint label={business.name} side="right">
              <span className="metal flex size-9 items-center justify-center rounded-[10px] text-[11px] font-semibold [font-stretch:115%]">
                <span className="text-gold">{initials(business.name)}</span>
              </span>
            </Hint>
            <Hint label="Expand sidebar" side="right">
              <button
                onClick={onToggle}
                className="rounded-lg p-2 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Expand sidebar"
              >
                <ChevronsRight className="size-4" />
              </button>
            </Hint>
          </>
        ) : (
          <div className="metal relative overflow-hidden rounded-[14px] p-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[9.5px] font-semibold tracking-[0.18em] text-white/45 uppercase [font-stretch:120%]">
                Workspace
              </span>
              <button
                onClick={onToggle}
                className="-mt-1 -mr-1 rounded-md p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Collapse sidebar"
              >
                <ChevronsLeft className="size-3.5" />
              </button>
            </div>
            <p className="mt-3 truncate text-[14px] font-semibold tracking-[-0.01em] [font-stretch:110%]">{business.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10.5px] text-white/50">
              <span className="text-gold font-semibold">{business.currency}</span>
              <span className="text-white/25">/</span>
              {business.timezone.replace(/_/g, " ")}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
