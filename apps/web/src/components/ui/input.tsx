import * as React from "react";
import { cn } from "@/lib/utils";

export const inputBaseClass =
  "flex h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm hover:border-border-strong text-foreground shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground/70 selection:bg-primary/20 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 aria-invalid:border-destructive aria-invalid:ring-destructive/15 dark:bg-input/20";

const groupClass =
  "flex h-9 w-full min-w-0 items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-sm shadow-xs hover:border-border-strong transition-[color,box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20 has-[input:disabled]:opacity-50 has-[input:disabled]:bg-muted/50 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-destructive/15 dark:bg-input/20";

export interface InputProps extends Omit<React.ComponentProps<"input">, "prefix"> {
  /** Icon rendered inside the field on the left (e.g. <Search />). */
  icon?: React.ReactNode;
  /** Addon on the left (e.g. currency symbol). */
  prefix?: React.ReactNode;
  /** Addon on the right (e.g. unit, %, a clear button). */
  suffix?: React.ReactNode;
  /** Classes for the wrapper when icon/prefix/suffix are used (sizing, width). */
  wrapperClassName?: string;
}

function Input({ className, type, icon, prefix, suffix, wrapperClassName, ...props }: InputProps) {
  if (!icon && !prefix && !suffix) {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(inputBaseClass, type === "number" && "num", className)}
        {...props}
      />
    );
  }
  return (
    <div data-slot="input-group" className={cn(groupClass, wrapperClassName)}>
      {icon && <span className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-4">{icon}</span>}
      {prefix && <span className="shrink-0 text-sm text-muted-foreground select-none">{prefix}</span>}
      <input
        type={type}
        data-slot="input"
        className={cn(
          "h-full w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed",
          type === "number" && "num",
          className,
        )}
        {...props}
      />
      {suffix && (
        <span className="flex shrink-0 items-center text-sm text-muted-foreground select-none">{suffix}</span>
      )}
    </div>
  );
}

export { Input };
