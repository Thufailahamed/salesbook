import * as React from "react";
import { cn } from "@/lib/utils";

export interface KeyValueItem {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Hide when value is null/undefined/"" */
  hideEmpty?: boolean;
  className?: string;
}

/**
 * Definition list for detail pages.
 *   <KeyValue items={[{ label: "Customer", value: inv.customerName }, …]} columns={2} />
 */
export function KeyValue({
  items,
  columns = 1,
  className,
  layout = "stacked",
}: {
  items: KeyValueItem[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  /** stacked = label above value; inline = label left, value right */
  layout?: "stacked" | "inline";
}) {
  const visible = items.filter((i) => !(i.hideEmpty && (i.value === null || i.value === undefined || i.value === "")));
  if (layout === "inline") {
    return (
      <dl className={cn("divide-y divide-border/70", className)}>
        {visible.map((item, idx) => (
          <div key={idx} className={cn("flex items-center justify-between gap-4 py-2.5 text-sm", item.className)}>
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="text-right font-medium text-foreground">{item.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {visible.map((item, idx) => (
        <div key={idx} className={cn("min-w-0", item.className)}>
          <dt className="label-caps">{item.label}</dt>
          <dd className="mt-1 text-sm break-words text-foreground">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
