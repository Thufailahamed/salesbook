"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface ComboboxOption<T = unknown> {
  value: string;
  label: string;
  /** secondary text (right side or below) */
  description?: React.ReactNode;
  /** custom row content */
  render?: React.ReactNode;
  group?: string;
  keywords?: string[];
  disabled?: boolean;
  data?: T;
}

export interface ComboboxProps<T = unknown> {
  value: string | null | undefined;
  onChange: (value: string | null, option: ComboboxOption<T> | null) => void;
  options: ComboboxOption<T>[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Text shown in the trigger for the selected value (if the option isn't in `options`) */
  selectedLabel?: React.ReactNode;
  /** Server-side search: receives the query; filtering is then disabled */
  onSearch?: (q: string) => void;
  loading?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  /** Extra items below the list (e.g. "+ Create new") */
  footer?: (close: () => void, query: string) => React.ReactNode;
  /** Leading icon in trigger */
  icon?: React.ReactNode;
  size?: "sm" | "default" | "lg";
  invalid?: boolean;
  id?: string;
}

/** Searchable select (popover + command). Works with static options or server search via `onSearch`. */
export function Combobox<T = unknown>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results",
  selectedLabel,
  onSearch,
  loading,
  clearable,
  disabled,
  className,
  contentClassName,
  footer,
  icon,
  size = "default",
  invalid,
  id,
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((o) => o.value === value);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const groups = React.useMemo(() => {
    const map = new Map<string, ComboboxOption<T>[]>();
    for (const o of options) {
      const g = o.group ?? "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return [...map.entries()];
  }, [options]);

  const close = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/20",
            size === "sm" && "h-8",
            size === "default" && "h-9",
            size === "lg" && "h-11",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {icon && <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>}
            {selected || (value && selectedLabel) ? (
              <span className="truncate">{selected?.label ?? selectedLabel}</span>
            ) : (
              <span className="truncate text-muted-foreground/80">{placeholder}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && value && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange(null, null);
                }}
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-(--radix-popover-trigger-width) min-w-[280px] p-0", contentClassName)}
      >
        <Command shouldFilter={!onSearch} loop>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={(q) => {
              setQuery(q);
              onSearch?.(q);
            }}
            wrapperClassName="h-11"
            right={loading ? <Spinner size={14} className="text-muted-foreground" /> : null}
          />
          <CommandList>
            {loading && options.length === 0 ? <CommandLoading>Searching…</CommandLoading> : <CommandEmpty>{emptyText}</CommandEmpty>}
            {groups.map(([group, items]) => (
              <CommandGroup key={group || "_"} heading={group || undefined}>
                {items.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    keywords={o.keywords}
                    disabled={o.disabled}
                    onSelect={() => {
                      onChange(o.value, o);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("size-4 shrink-0", o.value === value ? "text-primary opacity-100" : "opacity-0")} />
                    {o.render ?? (
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <span className="truncate">{o.label}</span>
                        {o.description && <span className="shrink-0 text-xs text-muted-foreground">{o.description}</span>}
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          {footer && <div className="border-t p-1.5">{footer(close, query)}</div>}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
