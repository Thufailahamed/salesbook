import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand";

/** Centered spinner for a section/page. */
export function PageLoader({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
      <Spinner size={22} className="text-primary" />
      <p className="text-[13px]">{label}</p>
    </div>
  );
}

/** Branded full-screen loader (auth bootstrap). */
export function FullPageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background">
      <div className="relative">
        <div className="absolute inset-0 -m-4 animate-pulse rounded-full bg-primary/15 blur-xl" />
        <BrandMark className="relative size-12" />
      </div>
      <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[loader_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
      <style>{`@keyframes loader{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}

/** Skeleton for a detail page: header + cards. */
export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

/** Error box with retry. */
export function ErrorState({
  message,
  onRetry,
  title = "Something went wrong",
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/30 bg-destructive-soft/40 px-6 py-12 text-center">
      <p className="font-medium text-destructive-soft-foreground">{title}</p>
      <p className="max-w-md text-[13px] text-muted-foreground">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-[13px] font-medium text-primary hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}
