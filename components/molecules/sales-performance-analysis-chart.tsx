"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

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
import { NativeSelect } from "@/components/ui/native-select";

interface SalesPerformanceDatum {
  category: string;
  chamiTradingWeb: number;
  coolPlanetNugegoda: number;
  cosmeticsMaharagama: number;
  cosmeticsNewWeb: number;
  kiribathgodaShowroom: number;
  pepiliyanaShop: number;
  peviTradingWeb: number;
  spkTradingWeb: number;
}

interface SalesPerformanceAnalysisChartProps {
  data: SalesPerformanceDatum[];
}

type ChartMode = "column" | "area" | "line" | "bar" | "spline";

const chartConfig: ChartConfig = {
  chamiTradingWeb: { label: "Chami Trading Web", color: "#72a6d8" },
  coolPlanetNugegoda: { label: "Cool Planet - Nugegoda", color: "#474646" },
  cosmeticsMaharagama: { label: "Cosmetics.lk - Maharagama", color: "#8bdc6d" },
  cosmeticsNewWeb: { label: "Cosmetics.lk New Web", color: "#eda059" },
  kiribathgodaShowroom: { label: "Kiribathgoda Showroom", color: "#6b78d6" },
  pepiliyanaShop: { label: "Pepiliyana Shop", color: "#ec4f7f" },
  peviTradingWeb: { label: "Pevi Trading Web", color: "#d7cb50" },
  spkTradingWeb: { label: "SPK Trading Web", color: "#2f8f8e" },
};

const stackKeys = [
  "chamiTradingWeb",
  "coolPlanetNugegoda",
  "cosmeticsMaharagama",
  "cosmeticsNewWeb",
  "kiribathgodaShowroom",
  "pepiliyanaShop",
  "peviTradingWeb",
  "spkTradingWeb",
] as const;

const chartModes: Array<{ value: ChartMode; label: string }> = [
  { value: "column", label: "Column" },
  { value: "area", label: "Area" },
  { value: "line", label: "Line" },
  { value: "bar", label: "Bar" },
  { value: "spline", label: "Spline" },
];

function wrapTickLabel(value: string, maxLineLength = 12) {
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
        textAnchor="end"
        transform="rotate(-35)"
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

export function SalesPerformanceAnalysisChart({
  data,
}: SalesPerformanceAnalysisChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("column");
  const [selectedLocation, setSelectedLocation] = useState<string>("all");

  if (!data.length) {
    return null;
  }

  const visibleKeys =
    selectedLocation === "all"
      ? stackKeys
      : stackKeys.filter((key) => key === selectedLocation);

  function renderSeries() {
    if (chartMode === "area") {
      return (
        <AreaChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 88 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="category"
            tickLine={false}
            axisLine={false}
            interval={0}
            height={88}
            tick={<RenderWrappedTick />}
          />
          <YAxis tickLine={false} axisLine={false} width={56} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Legend />
          {visibleKeys.map((key) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              name={String(chartConfig[key]?.label ?? key)}
              stroke={`var(--color-${key})`}
              fill={`var(--color-${key})`}
              fillOpacity={0.3}
              stackId="sales"
            />
          ))}
        </AreaChart>
      );
    }

    if (chartMode === "line" || chartMode === "spline") {
      return (
        <LineChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 88 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="category"
            tickLine={false}
            axisLine={false}
            interval={0}
            height={88}
            tick={<RenderWrappedTick />}
          />
          <YAxis tickLine={false} axisLine={false} width={56} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Legend />
          {visibleKeys.map((key) => (
            <Line
              key={key}
              type={chartMode === "spline" ? "monotone" : "linear"}
              dataKey={key}
              name={String(chartConfig[key]?.label ?? key)}
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      );
    }

    if (chartMode === "bar") {
      return (
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 16, right: 16, left: 8, bottom: 16 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="category"
            tickLine={false}
            axisLine={false}
            width={120}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Legend />
          {visibleKeys.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              name={String(chartConfig[key]?.label ?? key)}
              fill={`var(--color-${key})`}
              stackId="sales"
            />
          ))}
        </BarChart>
      );
    }

    return (
      <BarChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 88 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="category"
          tickLine={false}
          axisLine={false}
          interval={0}
          height={88}
          tick={<RenderWrappedTick />}
        />
        <YAxis tickLine={false} axisLine={false} width={56} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Legend />
        {visibleKeys.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            name={String(chartConfig[key]?.label ?? key)}
            fill={`var(--color-${key})`}
            stackId="sales"
          />
        ))}
      </BarChart>
    );
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="gap-4">
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Chart Type</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {chartModes.map((mode) => (
                <label key={mode.value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sales-chart-mode"
                    value={mode.value}
                    checked={chartMode === mode.value}
                    onChange={() => setChartMode(mode.value)}
                    className="h-4 w-4"
                  />
                  <span>{mode.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="max-w-sm space-y-2">
            <label
              htmlFor="sales-location"
              className="block text-sm font-medium text-foreground"
            >
              Location
            </label>
            <NativeSelect
              id="sales-location"
              className="h-11 text-muted-foreground"
              value={selectedLocation}
              onChange={(event) => setSelectedLocation(event.target.value)}
            >
              <option value="all">All Locations</option>
              {stackKeys.map((key) => (
                <option key={key} value={key}>
                  {String(chartConfig[key]?.label ?? key)}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
            <div>
              Pending Cancellations: <span className="ml-1 font-medium">0 LKR</span>
            </div>
            <div className="md:text-center">
              Pending Processing: <span className="ml-1 font-medium">0 LKR</span>
            </div>
            <div className="md:text-right">
              Shipping Charges: <span className="ml-1 font-medium">9290.00 LKR</span>
            </div>
          </div>
        </div>

        <div className="text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Sales Performance Analysis
          </CardTitle>
          <CardDescription>
            Evaluation of sales data with a focus on order date and MRP.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[520px] w-full">
          {renderSeries()}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
