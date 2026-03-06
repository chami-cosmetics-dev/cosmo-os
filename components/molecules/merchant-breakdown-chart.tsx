"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface MerchantBreakdownDatum {
  merchant: string;
  invoiceValue: number;
  invoiceCount: number;
}

interface MerchantBreakdownChartProps {
  data: MerchantBreakdownDatum[];
  title?: string;
  description?: string;
  compact?: boolean;
}

const chartConfig: ChartConfig = {
  invoiceValue: {
    label: "Invoice Value",
    color: "#7cb5ec",
  },
  invoiceCount: {
    label: "Invoice Count",
    color: "#434348",
  },
};

function wrapTickLabel(value: string, maxLineLength = 16) {
  const words = value.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxLineLength) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
}

function RenderWrappedTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const lines = wrapTickLabel(props.payload?.value ?? "");

  return (
    <g transform={`translate(${props.x ?? 0},${props.y ?? 0})`}>
      <text
        x={0}
        y={0}
        dy={16}
        textAnchor="middle"
        fill="currentColor"
        className="fill-muted-foreground text-xs"
      >
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 0 : 14}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export function MerchantBreakdownChart({
  data,
  title = "Merchant Breakdown",
  description = "Compare invoice value and order count for each merchant.",
  compact = false,
}: MerchantBreakdownChartProps) {
  if (!data.length) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className={compact ? "h-[340px] w-full" : "h-[420px] w-full"}>
          <BarChart
            data={data}
            margin={{ top: 16, right: 16, left: 8, bottom: 56 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="merchant"
              tickLine={false}
              axisLine={false}
              interval={0}
              height={72}
              tick={<RenderWrappedTick />}
            />
            <YAxis tickLine={false} axisLine={false} width={44} />
            <ChartTooltip
              cursor={false}
              shared={false}
              content={<ChartTooltipContent />}
            />
            <Legend />
            <Bar
              dataKey="invoiceValue"
              name="Invoice Value"
              fill="var(--color-invoiceValue)"
              radius={[6, 6, 0, 0]}
            />
            <Bar
              dataKey="invoiceCount"
              name="Invoice Count"
              fill="var(--color-invoiceCount)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
