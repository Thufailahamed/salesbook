"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { MeResponse } from "@shopbooks/shared";
import { api, ApiError, errorMessage } from "@/lib/api";
import { SessionProvider } from "@/providers/session-provider";
import { FullPageLoader } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./brand";

/** Query used for the current session; key matches the useApiQuery convention. */
export function useMeQuery() {
  return useQuery<MeResponse, Error>({
    queryKey: ["/auth/me", {}],
    queryFn: () => api.get<MeResponse>("/auth/me"),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Loads /auth/me, redirects to /login when signed out, and provides the SessionContext. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, error, isLoading, refetch, isFetching } = useMeQuery();
  const unauthorized = error instanceof ApiError && error.status === 401;

  React.useEffect(() => {
    if (unauthorized) {
      const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
      router.replace(next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login");
    }
  }, [unauthorized, router]);

  if (isLoading || unauthorized) return <FullPageLoader />;

  if (error || !data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <BrandMark className="size-11" />
        <div className="space-y-1">
          <h1 className="font-display text-lg font-semibold">We couldn&apos;t load your workspace</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{errorMessage(error)}</p>
        </div>
        <Button onClick={() => refetch()} loading={isFetching}>
          Try again
        </Button>
      </div>
    );
  }

  return <SessionProvider me={data}>{children}</SessionProvider>;
}
