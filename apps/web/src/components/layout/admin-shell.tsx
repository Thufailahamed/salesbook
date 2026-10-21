"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, LayoutDashboard, LogOut, Receipt, Settings, Store, Tags } from "lucide-react";
import type { PlatformAdmin } from "@shopbooks/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FullPageLoader } from "@/components/loading";
import { Brand } from "./brand";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/shops", label: "Shops", icon: Store },
  { href: "/admin/plans", label: "Plans", icon: Tags },
  { href: "/admin/orders", label: "Payments", icon: Receipt },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

const AdminContext = React.createContext<PlatformAdmin | null>(null);
export const useAdmin = () => {
  const a = React.useContext(AdminContext);
  if (!a) throw new Error("useAdmin outside AdminShell");
  return a;
};

/** Auth guard + chrome for the platform admin portal. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery<{ admin: PlatformAdmin }, Error>({
    queryKey: ["/platform/auth/me", {}],
    queryFn: () => api.get("/platform/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const unauth = error instanceof ApiError && error.status === 401;
  React.useEffect(() => {
    if (unauth) router.replace("/admin/login");
  }, [unauth, router]);
  if (isLoading || unauth || !data) return <FullPageLoader />;

  const logout = async () => {
    await api.post("/platform/auth/logout").catch(() => {});
    qc.clear();
    router.replace("/admin/login");
  };

  return (
    <AdminContext.Provider value={data.admin}>
      <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-accent-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex h-16 items-center justify-between px-5">
            <Brand />
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">Admin</span>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible">
            {NAV.map((n) => {
              const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                    active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white",
                  )}
                >
                  <n.icon className="size-4" /> {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden border-t border-sidebar-border p-3 lg:block">
            <p className="truncate px-2 text-[13px] font-medium text-white">{data.admin.name}</p>
            <p className="truncate px-2 pb-2 text-xs text-white/55">{data.admin.email}</p>
            <Button variant="ghost" size="sm" className="w-full justify-start text-white/75 hover:bg-white/8 hover:text-white" onClick={logout}>
              <LogOut /> Sign out
            </Button>
          </div>
        </aside>
        <main className="min-w-0">
          <div className="mx-auto w-full max-w-[1300px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
            <div className="mb-4 flex justify-end lg:hidden">
              <Button variant="outline" size="sm" onClick={logout}><LogOut /> Sign out</Button>
            </div>
            {children}
          </div>
        </main>
      </div>
    </AdminContext.Provider>
  );
}
void CreditCard;
