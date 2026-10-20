import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-out select-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-ink-foreground bg-[linear-gradient(180deg,oklch(1_0_0/0.1),oklch(1_0_0/0)_60%)] shadow-[var(--shadow-primary)] hover:bg-[color-mix(in_oklch,var(--ink)_86%,var(--highlight))] dark:bg-[linear-gradient(180deg,oklch(0.93_0.05_90),oklch(0.8_0.09_80))] dark:hover:brightness-105",
        ink: "bg-ink text-ink-foreground shadow-[var(--shadow-primary)] hover:bg-ink/88",
        brand: "bg-primary text-primary-foreground shadow-[var(--shadow-primary)] hover:bg-primary/90",
        highlight:
          "bg-[linear-gradient(180deg,oklch(0.92_0.06_90),oklch(0.8_0.1_80))] text-highlight-foreground shadow-[var(--shadow-primary)] hover:brightness-105",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        outline:
          "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border),var(--shadow-xs)] hover:shadow-[inset_0_0_0_1px_var(--border-strong),var(--shadow-xs)] hover:bg-accent/60",
        ghost: "text-foreground/80 hover:bg-accent hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[var(--shadow-primary)] hover:bg-destructive/90 focus-visible:ring-destructive/30",
        success:
          "bg-success text-success-foreground shadow-[var(--shadow-primary)] hover:bg-success/90 focus-visible:ring-success/30",
        soft: "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70",
        link: "text-primary underline-offset-4 hover:underline h-auto! px-0! active:scale-100",
      },
      size: {
        xs: "h-7 rounded-lg px-2.5 text-xs gap-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 rounded-[9px] px-3 text-[13px] gap-1.5 [&_svg:not([class*='size-'])]:size-[15px]",
        default: "h-9.5 px-4",
        lg: "h-11 rounded-xl px-5 text-[15px]",
        xl: "h-14 rounded-2xl px-7 text-base font-semibold",
        icon: "size-9.5",
        "icon-sm": "size-8 rounded-[9px]",
        "icon-xs": "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {!asChild && loading ? (
        <>
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </span>
          <span className="invisible inline-flex items-center gap-[inherit]">{children}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
