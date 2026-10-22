"use client";

import * as React from "react";
import { Shuffle, TriangleAlert } from "lucide-react";
import type { SellableItem } from "@shopbooks/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiQuery } from "@/hooks/use-api";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

/** An in-store EAN-13: the "200" prefix is reserved for internal use, so it never clashes with a manufacturer code. */
export function generateEan13(): string {
  const digits = "200" + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
  const sum = digits.split("").reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return digits + ((10 - (sum % 10)) % 10);
}

/**
 * Barcode text box for product forms. A scanner types the code and presses Enter, which must not submit the form.
 * Warns as soon as the code belongs to another product, and can generate an in-store EAN-13.
 */
export function BarcodeInput({
  value,
  onChange,
  productId,
  id,
  className,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  /** The product being edited, so its own barcode isn't reported as a clash */
  productId?: string;
  id?: string;
  className?: string;
  compact?: boolean;
}) {
  const code = useDebounce(value.trim(), 350);
  const found = useApiQuery<SellableItem>(code ? "/products/lookup" : null, { code }, { staleTime: 10_000, retry: false });
  const clash = code && found.data && found.data.productId !== productId && (found.data.barcode ?? "").toUpperCase() === code.toUpperCase() ? found.data : null;

  return (
    <div className="min-w-0">
      <div className="flex gap-1.5">
        <Input
          id={id}
          value={value}
          placeholder={compact ? "Scan or type" : "Scan or type the code on the pack"}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          aria-invalid={!!clash}
          className={cn("font-mono", compact && "h-8 text-[12.5px]", className)}
        />
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "default"}
          className="shrink-0"
          title="Generate an in-store barcode"
          aria-label="Generate barcode"
          onClick={() => onChange(generateEan13())}
        >
          <Shuffle />
          {!compact && "Generate"}
        </Button>
      </div>
      {clash && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>Already used by {clash.displayName}. Each barcode can belong to one product.</span>
        </p>
      )}
    </div>
  );
}
