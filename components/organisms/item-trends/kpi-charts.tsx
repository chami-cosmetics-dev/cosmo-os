"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Props = {
  data: { priority: string; count: number }[];
};

const PRIORITY_COLORS: Record<string, string> = {
  "Top Priority": "var(--chart-1)",
  "Newly Added": "var(--chart-2)",
  "Non Priority": "var(--chart-3)",
  Discontinue: "var(--chart-4)",
};

const chartConfig = {
  count: { label: "Fast movers", color: "var(--chart-1)" },
} satisfies ChartConfig;

function barColor(priority: string, index: number): string {
  return PRIORITY_COLORS[priority] ?? `var(--chart-${(index % 5) + 1})`;
}

export function ItemTrendsKpiCharts({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No priority breakdown for this range.</p>
    );
  }

  const chartHeight = Math.max(140, data.length * 44 + 24);

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto w-full"
      style={{ height: chartHeight }}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 36, top: 4, bottom: 4 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
        <YAxis
          type="category"
          dataKey="priority"
          width={108}
          tickLine={false}
          axisLine={false}
          fontSize={11}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={22}>
          {data.map((entry, index) => (
            <Cell key={entry.priority} fill={barColor(entry.priority, index)} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            className="fill-foreground"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
