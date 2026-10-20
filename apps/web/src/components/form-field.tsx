import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label?: React.ReactNode;
  /** id of the control (links the label) */
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null | false;
  required?: boolean;
  className?: string;
  /** Right side of the label row (e.g. a small link) */
  labelAside?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Label + control + hint/error.
 *   <Field label="Name" htmlFor="name" required error={errors.name}><Input id="name" … /></Field>
 */
export function Field({ label, htmlFor, hint, error, required, className, labelAside, children }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)} data-invalid={error ? true : undefined}>
      {(label || labelAside) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <Label htmlFor={htmlFor}>
              {label}
              {required && <span className="-ml-1 text-destructive">*</span>}
            </Label>
          )}
          {labelAside}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-[12px] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Responsive grid for form fields. cols = 1 | 2 | 3 | 4 */
export function FieldGrid({ cols = 2, className, children }: { cols?: 1 | 2 | 3 | 4; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A labelled switch/checkbox row: title + description on the left, control on the right. */
export function ToggleRow({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-6 py-3", className)}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
