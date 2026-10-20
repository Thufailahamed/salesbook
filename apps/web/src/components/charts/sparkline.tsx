"use client";

import * as React from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

/** Tiny trend line for stat cards. */
export function Sparkline({ data, color = "var(--chart-1)", height = 36 }: { data: number[]; color?: string; height?: number }) {
  const id = React.useId().replace(/:/g, "");
  const points = data.map((v, i) => ({ i, v }));
  if (points.length < 2) return null;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 3 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spark-${id})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
