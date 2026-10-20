"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipBox, CHART_COLORS } from "./chart-tooltip";

export interface AreaSeries {
  key: string;
  name: string;
  color?: string;
  /** dashed line without fill */
  dashed?: boolean;
}

export interface TrendAreaChartProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  series: AreaSeries[];
  height?: number;
  xFormatter?: (v: string) => string;
  yFormatter?: (v: number) => string;
  valueFormatter?: (v: number) => string;
  tooltipLabelFormatter?: (v: unknown) => React.ReactNode;
  showYAxis?: boolean;
}

/** Smooth gradient area chart for time series. */
export function TrendAreaChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 260,
  xFormatter,
  yFormatter,
  valueFormatter,
  tooltipLabelFormatter,
  showYAxis = true,
}: TrendAreaChartProps<T>) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: showYAxis ? 0 : 8, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`fill-${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? CHART_COLORS[i % 6]} stopOpacity={0.18} />
                <stop offset="95%" stopColor={s.color ?? CHART_COLORS[i % 6]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis
            dataKey={xKey as never}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={24}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11.5 }}
            tickFormatter={xFormatter}
          />
          {showYAxis && (
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tickMargin={6}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11.5 }}
              tickFormatter={yFormatter}
            />
          )}
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeDasharray: "4 4" }}
            content={(props) => (
              <ChartTooltipBox
                active={props.active}
                payload={props.payload as never}
                label={props.label as React.ReactNode}
                labelFormatter={tooltipLabelFormatter}
                valueFormatter={valueFormatter ? (v) => valueFormatter(v) : undefined}
              />
            )}
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? CHART_COLORS[i % 6]}
              strokeWidth={1.75}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              fill={s.dashed ? "transparent" : `url(#fill-${id}-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
