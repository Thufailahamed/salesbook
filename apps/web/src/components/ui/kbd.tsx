import * as React from "react";
import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-[5px] border border-border bg-card px-1 font-sans text-[10.5px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)] select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
