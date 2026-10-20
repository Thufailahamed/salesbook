"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/charts/sparkline";
import { cn, formatPercent } from "@/lib/utils";

/** Icons stay monochrome; only "danger" (e.g. a loss) is allowed to colour the glyph. */
const tones = {
  primary: "text-foreground/75",
  success: "text-foreground/75",
  warning: "text-foreground/75",
  danger: "text-destructive",
  info: "text-foreground/75",
  neutral: "text-muted-foreground",
} as const;

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof tones;
  /** Percentage change (e.g. 12.5 = +12.5%). null hides the chip. */
  delta?: number | null;
  /** "vs yesterday" */
  deltaLabel?: string;
  /** When true a decrease is good (e.g. expenses) */
  invertDelta?: boolean;
  sublabel?: React.ReactNode;
  sparkline?: number[];
  sparklineColor?: string;
  loading?: boolean;
  href?: string;
  className?: string;
  size?: "default" | "sm";
  /** "feature" = the headline KPI: brushed-obsidian "black card" with champagne figures. Once per row at most. */
  variant?: "default" | "feature";
}

/**
 * KPI card: icon + label, expanded tabular figure, delta chip, optional sparkline.
 *   <StatCard label="Today's sales" value={money.format(d.today.netSales)} icon={Wallet} delta={12.4} deltaLabel="vs yesterday" />
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  delta,
  deltaLabel,
  invertDelta,
  sublabel,
  sparkline,
  sparklineColor,
  loading,
  href,
  className,
  size = "default",
  variant = "default",
}: StatCardProps) {
  const up = (delta ?? 0) >= 0;
  const good = invertDelta ? !up : up;
  const feature = variant === "feature";
  const hasDelta = delta !== undefined && delta !== null;
  const hasSpark = !!sparkline && sparkline.length > 1;
  const sm = size === "sm";

  const content = (
    <Card
      data-variant={variant}
      className={cn(
        "group relative h-full gap-0 overflow-hidden",
        sm ? "p-4" : "p-5",
        hasSpark && "pb-0",
        feature && "metal dark:shadow-none",
        href && "transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5",
        href && !feature && "hover:shadow-raised",
        className,
      )}
    >
      <div className="relative flex items-center gap-2.5">
        {Icon && (
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full",
              sm ? "size-7" : "size-8",
              feature ? "bg-white/8 ring-1 ring-white/10" : "bg-muted",
            )}
          >
            <Icon className={cn(sm ? "size-3.5" : "size-4", feature ? "text-highlight" : tones[tone])} strokeWidth={1.8} />
          </span>
        )}
        <p className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", feature ? "text-white/60" : "text-muted-foreground")}>
          {label}
        </p>
        {href && (
          <ArrowUpRight
            className={cn(
              "size-4 shrink-0 transition-colors duration-200",
              feature ? "text-white/30 group-hover:text-highlight" : "text-border-strong group-hover:text-foreground",
            )}
          />
        )}
      </div>

      {loading ? (
        <div className={cn("relative space-y-2", sm ? "mt-3" : "mt-5", hasSpark && "pb-5")}>
          <Skeleton className={cn(sm ? "h-7 w-24" : "h-9 w-40", feature && "opacity-25")} />
          <Skeleton className={cn("h-3.5 w-24", feature && "opacity-25")} />
        </div>
      ) : (
        <>
          <div
            className={cn(
              "figure relative w-fit",
              sm ? "mt-3 text-[22px] leading-7" : "mt-5 text-[32px] leading-[1.1]",
              feature ? "text-gold" : "text-foreground",
            )}
          >
            {value}
          </div>
          {hasDelta || sublabel ? (
            <div
              className={cn(
                "relative mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]",
                feature ? "text-white/55" : "text-muted-foreground",
              )}
            >
              {hasDelta && (
                <span
                  className={cn(
                    "num inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[11.5px] font-semibold",
                    feature
                      ? good
                        ? "bg-highlight/15 text-highlight"
                        : "bg-white/10 text-white/80"
                      : good
                        ? "bg-success-soft text-success-soft-foreground"
                        : "bg-destructive-soft text-destructive-soft-foreground",
                  )}
                >
                  {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {formatPercent(Math.abs(delta!))}
                </span>
              )}
              {deltaLabel && hasDelta && <span>{deltaLabel}</span>}
              {sublabel && <span>{sublabel}</span>}
            </div>
          ) : null}
          {hasSpark && (
            <div className={cn("relative mt-4", sm ? "-mx-4" : "-mx-5")}>
              <Sparkline
                data={sparkline!}
                height={sm ? 32 : 44}
                color={sparklineColor ?? (feature ? "oklch(0.84 0.09 84)" : "var(--chart-1)")}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-2xl focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none">
      {content}
    </Link>
  ) : (
    content
  );
}
