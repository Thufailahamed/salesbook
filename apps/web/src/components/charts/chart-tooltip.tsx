"use client";

import * as React from "react";

export interface ChartTooltipItem {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipBoxProps {
  active?: boolean;
  payload?: ReadonlyArray<ChartTooltipItem>;
  label?: React.ReactNode;
  labelFormatter?: (label: unknown) => React.ReactNode;
  valueFormatter?: (value: number, name: string) => React.ReactNode;
  /** Map dataKey → display name */
  names?: Record<string, string>;
}

/** Shared tooltip look for all charts. Pass as `content={<ChartTooltipBox valueFormatter={…} />}` */
export function ChartTooltipBox({ active, payload, label, labelFormatter, valueFormatter, names }: ChartTooltipBoxProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-[var(--shadow-overlay)] backdrop-blur">
      {label !== undefined && label !== null && label !== "" && (
        <p className="mb-1.5 font-medium text-foreground">{labelFormatter ? labelFormatter(label) : String(label)}</p>
      )}
      <div className="grid gap-1">
        {payload.map((p, i) => {
          const key = String(p.dataKey ?? p.name ?? i);
          const name = names?.[key] ?? String(p.name ?? key);
          const raw = Array.isArray(p.value) ? p.value[0] : p.value;
          const num = typeof raw === "number" ? raw : Number(raw ?? 0);
          return (
            <div key={key + i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-[3px]" style={{ background: p.color }} />
                {name}
              </span>
              <span className="num font-medium text-foreground">{valueFormatter ? valueFormatter(num, name) : num}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];
