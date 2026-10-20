"use client";

import * as React from "react";
import { CalendarDays, ChevronDown, Search, X } from "lucide-react";
import { addDays, addMonths, endOfMonth, startOfMonth } from "@shopbooks/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/use-debounce";
import { useOptionalSession } from "@/hooks/use-session";
import { cn, formatDate, todayISO } from "@/lib/utils";

// ---------------------------------------------------------------- search

export interface SearchInputProps {
  value?: string;
  /** Called with the debounced value */
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
  autoFocus?: boolean;
}

/** Debounced search box. <SearchInput value={q} onChange={setQ} placeholder="Search invoices…" /> */
export function SearchInput({ value = "", onChange, placeholder = "Search…", delay = 300, className, autoFocus }: SearchInputProps) {
  const [text, setText] = React.useState(value);
  const debounced = useDebounce(text, delay);
  const onChangeRef = React.useRef(onChange);
  const lastEmitted = React.useRef(value);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  React.useEffect(() => {
    if (debounced !== lastEmitted.current) {
      lastEmitted.current = debounced;
      onChangeRef.current(debounced);
    }
  }, [debounced]);
  // external reset (e.g. "clear filters")
  React.useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(value);
    }
  }, [value]);

  return (
    <Input
      icon={<Search />}
      value={text}
      autoFocus={autoFocus}
      onChange={(e) => setText(e.target.value)}
      placeholder={placeholder}
      wrapperClassName={cn("sm:w-72", className)}
      suffix={
        text ? (
          <button
            type="button"
            className="pointer-events-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setText("")}
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------- date range

export interface DateRange {
  from?: string;
  to?: string;
}

interface Preset {
  key: string;
  label: string;
  range: (today: string) => DateRange;
}

export const DATE_PRESETS: Preset[] = [
  { key: "today", label: "Today", range: (t) => ({ from: t, to: t }) },
  { key: "yesterday", label: "Yesterday", range: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }) },
  { key: "7d", label: "Last 7 days", range: (t) => ({ from: addDays(t, -6), to: t }) },
  { key: "30d", label: "Last 30 days", range: (t) => ({ from: addDays(t, -29), to: t }) },
  { key: "month", label: "This month", range: (t) => ({ from: startOfMonth(t), to: t }) },
  {
    key: "lastMonth",
    label: "Last month",
    range: (t) => {
      const s = startOfMonth(addMonths(startOfMonth(t), -1));
      return { from: s, to: endOfMonth(s) };
    },
  },
  { key: "quarter", label: "Last 90 days", range: (t) => ({ from: addDays(t, -89), to: t }) },
  { key: "year", label: "This year", range: (t) => ({ from: `${t.slice(0, 4)}-01-01`, to: t }) },
  {
    key: "lastYear",
    label: "Last year",
    range: (t) => {
      const y = Number(t.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    },
  },
];

/** Today in the business timezone (falls back to browser tz). */
export function useBusinessToday(): string {
  const session = useOptionalSession();
  return todayISO(session?.business.timezone);
}

/** Resolve a preset key to a range, e.g. presetRange("month", today). */
export function presetRange(key: string, today: string): DateRange {
  return DATE_PRESETS.find((p) => p.key === key)?.range(today) ?? {};
}

function describe(range: DateRange, today: string): string {
  if (!range.from && !range.to) return "All time";
  const preset = DATE_PRESETS.find((p) => {
    const r = p.range(today);
    return r.from === range.from && r.to === range.to;
  });
  if (preset) return preset.label;
  if (range.from && range.to && range.from === range.to) return formatDate(range.from);
  const f = range.from ? formatDate(range.from, { month: "short", day: "numeric", year: "numeric" }) : "…";
  const t = range.to ? formatDate(range.to, { month: "short", day: "numeric", year: "numeric" }) : "…";
  return `${f} – ${t}`;
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Show "All time" option (clears the range) */
  allowAll?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
}

/** Popover with presets + custom from/to. Values are YYYY-MM-DD. */
export function DateRangePicker({ value, onChange, allowAll = true, className, align = "start" }: DateRangePickerProps) {
  const today = useBusinessToday();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange>(value);
  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-between gap-2 font-normal", className)}>
          <span className="flex items-center gap-2">
            <CalendarDays className="text-muted-foreground" />
            <span className="text-foreground">{describe(value, today)}</span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(92vw,460px)] p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="grid grid-cols-2 gap-0.5 border-b p-2 sm:w-40 sm:grid-cols-1 sm:border-r sm:border-b-0">
            {allowAll && (
              <PresetButton
                active={!value.from && !value.to}
                onClick={() => {
                  onChange({});
                  setOpen(false);
                }}
              >
                All time
              </PresetButton>
            )}
            {DATE_PRESETS.map((p) => {
              const r = p.range(today);
              return (
                <PresetButton
                  key={p.key}
                  active={r.from === value.from && r.to === value.to}
                  onClick={() => {
                    onChange(r);
                    setOpen(false);
                  }}
                >
                  {p.label}
                </PresetButton>
              );
            })}
          </div>
          <div className="flex-1 space-y-3 p-4">
            <p className="label-caps">Custom range</p>
            <div className="grid gap-1.5">
              <Label htmlFor="dr-from">From</Label>
              <Input
                id="dr-from"
                type="date"
                value={draft.from ?? ""}
                max={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || undefined }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dr-to">To</Label>
              <Input
                id="dr-to"
                type="date"
                value={draft.to ?? ""}
                min={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || undefined }))}
              />
            </div>
            <Button
              className="w-full"
              size="sm"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PresetButton({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
        active ? "bg-primary-soft font-medium text-primary-soft-foreground" : "text-foreground/80 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- select filter

export interface FilterOption {
  value: string;
  label: React.ReactNode;
}

const ALL = "__all__";

export interface FilterSelectProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: FilterOption[];
  /** Label of the "all" option (also the placeholder) */
  allLabel?: string;
  /** Hide the "all" option */
  required?: boolean;
  className?: string;
  size?: "sm" | "default";
  icon?: React.ReactNode;
}

/** Compact select for list filters. undefined = all. */
export function FilterSelect({ value, onChange, options, allLabel = "All", required, className, size = "default", icon }: FilterSelectProps) {
  return (
    <Select value={value ?? (required ? undefined : ALL)} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger size={size} className={cn("w-full sm:w-44", className)}>
        {icon}
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        {!required && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
