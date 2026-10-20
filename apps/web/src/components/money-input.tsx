"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { useMoney } from "@/hooks/use-money";
import { cn } from "@/lib/utils";

type BaseProps = Omit<InputProps, "value" | "onChange" | "type" | "prefix" | "defaultValue">;

export interface MoneyInputProps extends BaseProps {
  /** Amount in minor units (null = empty) */
  value: number | null | undefined;
  /** Emits minor units (0 when cleared) */
  onChange: (minor: number) => void;
  allowNegative?: boolean;
  /** Hide the currency symbol prefix */
  hideSymbol?: boolean;
}

/**
 * Currency input that shows major units and emits integer minor units.
 *   <MoneyInput value={price} onChange={setPrice} />
 */
export function MoneyInput({ value, onChange, allowNegative = false, hideSymbol, onBlur, className, ...props }: MoneyInputProps) {
  const { symbol, toMajor, toMinor, decimals } = useMoney();
  const fmt = React.useCallback(
    (minor: number | null | undefined) => (minor === null || minor === undefined ? "" : toMajor(minor).toFixed(decimals)),
    [toMajor, decimals],
  );
  const [text, setText] = React.useState(() => fmt(value));
  const lastEmitted = React.useRef<number | null | undefined>(value);

  React.useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(fmt(value));
    }
  }, [value, fmt]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      prefix={hideSymbol ? undefined : symbol}
      className={cn("num", className)}
      value={text}
      onChange={(e) => {
        let raw = e.target.value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
        if (!allowNegative) raw = raw.replace(/-/g, "");
        const firstDot = raw.indexOf(".");
        if (firstDot !== -1) raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
        setText(raw);
        const n = Number.parseFloat(raw);
        const minor = Number.isFinite(n) ? toMinor(n) : 0;
        lastEmitted.current = minor;
        onChange(minor);
      }}
      onBlur={(e) => {
        if (text !== "") setText(fmt(lastEmitted.current ?? 0));
        onBlur?.(e);
      }}
      onFocus={(e) => {
        e.currentTarget.select();
        props.onFocus?.(e);
      }}
    />
  );
}

export interface QtyInputProps extends Omit<BaseProps, "min" | "max" | "step" | "size"> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Allow fractional quantities (metres, kg…) */
  allowDecimal?: boolean;
  /** Show −/+ stepper buttons */
  steppers?: boolean;
  size?: "sm" | "default";
}

/** Quantity input with optional steppers. <QtyInput value={qty} onChange={setQty} steppers /> */
export function QtyInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  allowDecimal = false,
  steppers = false,
  size = "default",
  className,
  wrapperClassName,
  ...props
}: QtyInputProps) {
  const [text, setText] = React.useState(String(value ?? ""));
  const last = React.useRef(value);
  React.useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(String(value ?? ""));
    }
  }, [value]);

  const clamp = (n: number) => {
    let v = allowDecimal ? Math.round(n * 1000) / 1000 : Math.round(n);
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  const emit = (n: number) => {
    const v = clamp(n);
    last.current = v;
    setText(String(v));
    onChange(v);
  };

  const input = (
    <Input
      {...props}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      autoComplete="off"
      className={cn("num text-center", size === "sm" && "h-8", !steppers && "text-right", className)}
      wrapperClassName={wrapperClassName}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, "");
        setText(raw);
        const n = Number.parseFloat(raw);
        if (Number.isFinite(n)) {
          last.current = n;
          onChange(n);
        }
      }}
      onBlur={() => {
        const n = Number.parseFloat(text);
        emit(Number.isFinite(n) ? n : min);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          emit((value || 0) + step);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          emit((value || 0) - step);
        }
        props.onKeyDown?.(e);
      }}
    />
  );
  if (!steppers) return input;
  const btn =
    "inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-card transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40";
  return (
    <div className={cn("flex items-center gap-1", wrapperClassName)}>
      <button
        type="button"
        className={cn(btn, size === "sm" ? "size-8" : "size-9")}
        onClick={() => emit((value || 0) - step)}
        disabled={props.disabled || (min !== undefined && value <= min)}
        aria-label="Decrease"
      >
        <Minus className="size-3.5" />
      </button>
      <div className={cn(size === "sm" ? "w-14" : "w-16")}>{input}</div>
      <button
        type="button"
        className={cn(btn, size === "sm" ? "size-8" : "size-9")}
        onClick={() => emit((value || 0) + step)}
        disabled={props.disabled || (max !== undefined && value >= max)}
        aria-label="Increase"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export interface PercentInputProps extends BaseProps {
  value: number | null | undefined;
  onChange: (value: number) => void;
  max?: number;
}

/** 0–100 percentage input with a % suffix. */
export function PercentInput({ value, onChange, max = 100, className, ...props }: PercentInputProps) {
  const [text, setText] = React.useState(value === null || value === undefined ? "" : String(value));
  const last = React.useRef(value);
  React.useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === null || value === undefined ? "" : String(value));
    }
  }, [value]);
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      suffix="%"
      className={cn("num", className)}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        setText(raw);
        const n = Number.parseFloat(raw);
        const v = Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
        last.current = v;
        onChange(v);
      }}
    />
  );
}
