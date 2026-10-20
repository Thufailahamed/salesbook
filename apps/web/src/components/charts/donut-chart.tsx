"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipBox, CHART_COLORS } from "./chart-tooltip";
import { cn } from "@/lib/utils";

export interface DonutDatum {
  name: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutDatum[];
  height?: number;
  valueFormatter?: (v: number) => string;
  /** Text in the middle */
  centerLabel?: React.ReactNode;
  centerValue?: React.ReactNode;
  /** Show legend list below/next to the chart */
  legend?: boolean;
  className?: string;
}

/** Donut chart with an optional centre label and legend with percentages. */
export function DonutChart({ data, height = 200, valueFormatter, centerLabel, centerValue, legend = true, className }: DonutChartProps) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="relative w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={(props) => (
                <ChartTooltipBox
                  active={props.active}
                  payload={(props.payload as never) ?? []}
                  valueFormatter={valueFormatter ? (v) => valueFormatter(v) : undefined}
                />
              )}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="96%"
              paddingAngle={data.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke="none"
              isAnimationActive
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={d.color ?? CHART_COLORS[i % 6]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {centerValue && <span className="font-display text-[22px] font-semibold tracking-[-0.03em] num">{centerValue}</span>}
            {centerLabel && <span className="text-[11.5px] text-muted-foreground">{centerLabel}</span>}
          </div>
        )}
      </div>
      {legend && data.length > 0 && (
        <ul className="grid gap-2">
          {data.map((d, i) => (
            <li key={d.name} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: d.color ?? CHART_COLORS[i % 6] }} />
                <span className="truncate text-foreground/90">{d.name}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="num font-medium">{valueFormatter ? valueFormatter(d.value) : d.value}</span>
                <span className="num w-10 text-right text-xs text-muted-foreground">
                  {total > 0 ? `${Math.round((d.value / total) * 100)}%` : "—"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
