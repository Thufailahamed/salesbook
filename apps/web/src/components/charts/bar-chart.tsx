"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipBox, CHART_COLORS } from "./chart-tooltip";

export interface BarSeries {
  key: string;
  name: string;
  color?: string;
}

export interface SimpleBarChartProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  series: BarSeries[];
  height?: number;
  /** horizontal bars with category labels on the left */
  layout?: "vertical" | "horizontal";
  xFormatter?: (v: string) => string;
  yFormatter?: (v: number) => string;
  valueFormatter?: (v: number) => string;
  stacked?: boolean;
  /** colour each bar differently (single series) */
  colorful?: boolean;
  categoryWidth?: number;
}

/** Bar chart (vertical columns or horizontal bars). */
export function SimpleBarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 260,
  layout = "horizontal",
  xFormatter,
  yFormatter,
  valueFormatter,
  stacked,
  colorful,
  categoryWidth = 110,
}: SimpleBarChartProps<T>) {
  const horizontalBars = layout === "vertical";
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          barCategoryGap={horizontalBars ? 6 : "22%"}
        >
          <CartesianGrid
            vertical={horizontalBars}
            horizontal={!horizontalBars}
            stroke="var(--chart-grid)"
            strokeDasharray="3 3"
          />
          {horizontalBars ? (
            <>
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11.5 }}
                tickFormatter={yFormatter}
              />
              <YAxis
                type="category"
                dataKey={xKey as never}
                tickLine={false}
                axisLine={false}
                width={categoryWidth}
                tick={{ fill: "var(--foreground)", fontSize: 12 }}
                tickFormatter={xFormatter}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey as never}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={12}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11.5 }}
                tickFormatter={xFormatter}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11.5 }}
                tickFormatter={yFormatter}
              />
            </>
          )}
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={(props) => (
              <ChartTooltipBox
                active={props.active}
                payload={props.payload as never}
                label={props.label as React.ReactNode}
                valueFormatter={valueFormatter ? (v) => valueFormatter(v) : undefined}
              />
            )}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color ?? CHART_COLORS[i % 6]}
              stackId={stacked ? "a" : undefined}
              radius={horizontalBars ? [0, 3, 3, 0] : [3, 3, 0, 0]}
              maxBarSize={horizontalBars ? 22 : 40}
            >
              {colorful && series.length === 1
                ? data.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % 6]} />)
                : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
