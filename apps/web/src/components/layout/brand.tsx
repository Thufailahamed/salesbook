import * as React from "react";
import { cn } from "@/lib/utils";

/** App logo mark: champagne-gold tile with a geometric obsidian "S". */
export function BrandMark({ className }: { className?: string }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`gold-${id}`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="oklch(0.92 0.06 90)" />
          <stop offset="0.55" stopColor="oklch(0.8 0.1 82)" />
          <stop offset="1" stopColor="oklch(0.66 0.11 70)" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#gold-${id})`} />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" fill="none" stroke="white" strokeOpacity="0.35" />
      <path
        d="M27.5 12.5H16a3.75 3.75 0 0 0 0 7.5h8a3.75 3.75 0 0 1 0 7.5H12.5"
        fill="none"
        stroke="oklch(0.18 0.006 70)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Brand({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className="size-[30px]" />
      {!collapsed && (
        <span className="text-[16px] leading-none font-[650] tracking-[-0.02em] text-current [font-stretch:122%]">ShopBooks</span>
      )}
    </div>
  );
}
