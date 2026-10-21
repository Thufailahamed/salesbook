"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { CommandPaletteProvider } from "./command-palette";
import { Sidebar, SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";

/** Sidebar + top bar + content area. Content is centered with a max width. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useLocalStorage("sb.sidebar.collapsed", false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { can } = useSession();

  React.useEffect(() => setMobileOpen(false), [pathname]);
  useHotkeys("f2", () => can("pos.sell") && router.push("/pos"));

  return (
    <CommandPaletteProvider>
      <div className="min-h-dvh bg-background lg:bg-frame">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] border-sidebar-border bg-sidebar p-0 text-sidebar-accent-foreground" hideClose>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-16 items-center px-5">
              <Link href="/dashboard">
                <Brand />
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        {/* the floating panel: on desktop the page scrolls inside it, the obsidian frame stays put */}
        <div
          className={cn(
            "transition-[padding] duration-200 lg:h-dvh lg:py-2 lg:pr-2",
            collapsed ? "lg:pl-[72px]" : "lg:pl-[252px]",
          )}
        >
          <div
            data-scroll-root
            className="flex min-h-dvh flex-col bg-background lg:h-full lg:min-h-0 lg:overflow-y-auto lg:rounded-[18px] lg:shadow-[0_0_0_1px_oklch(1_0_0/0.06),0_20px_50px_-20px_oklch(0_0_0/0.6)] lg:scrollbar-thin"
          >
            <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
            <main className="flex-1">
              <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
