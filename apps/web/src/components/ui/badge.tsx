import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-px text-[11.5px] leading-[1.45] font-medium tracking-[-0.003em] whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted/70 text-muted-foreground",
        primary: "border-primary/15 bg-primary-soft text-primary-soft-foreground",
        success: "border-success/18 bg-success-soft text-success-soft-foreground",
        warning: "border-warning/25 bg-warning-soft text-warning-soft-foreground",
        danger: "border-destructive/18 bg-destructive-soft text-destructive-soft-foreground",
        info: "border-info/18 bg-info-soft text-info-soft-foreground",
        outline: "border-border bg-card text-foreground",
        solid: "border-transparent bg-ink text-ink-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

const dotColors: Record<string, string> = {
  neutral: "bg-muted-foreground/60",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  outline: "bg-muted-foreground",
  solid: "bg-ink-foreground",
};

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

function Badge({
  className,
  variant,
  dot = false,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className={cn("size-1.5 rounded-full", dotColors[variant ?? "neutral"])} />}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
