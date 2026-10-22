import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Header right side */
  action?: React.ReactNode;
  footer?: React.ReactNode;
  /** Remove body padding (for tables/lists that go edge to edge) */
  flush?: boolean;
  className?: string;
  contentClassName?: string;
  children?: React.ReactNode;
}

/**
 * Card with a titled header. Use `flush` for edge-to-edge tables.
 *   <SectionCard title="Items" action={<Button size="sm">Add</Button>} flush><Table…/></SectionCard>
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  footer,
  flush,
  className,
  contentClassName,
  children,
}: SectionCardProps) {
  const hasHeader = title || description || action;
  return (
    <Card className={cn("overflow-hidden", className)}>
      {hasHeader && (
        <CardHeader className={cn(flush && "border-b border-border/70 pb-4")}>
          <div className="flex items-center gap-3">
            {Icon && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-muted text-primary">
                <Icon className="size-[17px]" strokeWidth={1.7} />
              </span>
            )}
            <div className="min-w-0">
              {title && <CardTitle className="font-display text-[17px] font-semibold tracking-[-0.01em]">{title}</CardTitle>}
              {description && <CardDescription className="mt-0.5 text-[13px] leading-relaxed">{description}</CardDescription>}
            </div>
          </div>
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn(flush && "p-0 [[data-slot=card-header]+&]:pt-0", contentClassName)}>{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}
