import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** compact = less padding (inside cards / tables) */
  compact?: boolean;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-6 py-10" : "gap-3 px-6 py-16",
        className,
      )}
    >
      <div className="relative mb-2 flex size-20 items-center justify-center rounded-full bg-[radial-gradient(circle,var(--muted)_0%,transparent_70%)]">
        <div className="absolute inset-0 rounded-full border border-border/60" />
        <div className="absolute inset-2.5 rounded-full border border-border" />
        <div className="relative flex size-11 items-center justify-center rounded-full bg-card text-foreground shadow-card">
          <Icon className="size-[18px]" strokeWidth={1.6} />
        </div>
      </div>
      <div className="space-y-1">
        <p className="font-display text-[16px] font-semibold tracking-[-0.03em] text-foreground">{title}</p>
        {description && <p className="mx-auto max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
