"use client";

import * as React from "react";
import { Cell, Label, Pie, PieChart, Sector } from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface DonutChartSegment {
  label: string;
  value: number;
  color: string;
}

interface ChartPieDonutTextProps {
  shopName: string;
  merchantName: string;
  merchantValue: number;
  segments: DonutChartSegment[];
  centerLabel?: string;
  totalValue?: number;
  size?: "default" | "large";
  variant?: "default" | "summary";
}

function formatNumber(value: number) {
  const hasFraction = !Number.isInteger(value);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: hasFraction ? 1 : 0,
    maximumFractionDigits: hasFraction ? 1 : 0,
  }).format(value);
}

export function ChartPieDonutText({
  shopName,
  merchantName,
  merchantValue,
  segments,
  centerLabel = "Orders",
  totalValue,
  size = "default",
  variant = "default",
}: ChartPieDonutTextProps) {
  const chartData = React.useMemo(() => {
    return segments
      .filter((segment) => segment.value > 0)
      .map((segment, index) => ({
        key: `segment${index + 1}`,
        label: segment.label,
        value: segment.value,
        fill: segment.color,
      }));
  }, [segments]);

  const chartConfig = React.useMemo(() => {
    return chartData.reduce<ChartConfig>((config, segment) => {
      config[segment.key] = {
        label: segment.label,
        color: segment.fill,
      };

      return config;
    }, {});
  }, [chartData]);

  const computedTotalValue = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.value, 0);
  }, [chartData]);

  const [activeIndex, setActiveIndex] = React.useState<number | undefined>();

  const renderActiveShape = React.useCallback(
    (props: {
      cx?: number;
      cy?: number;
      innerRadius?: number;
      outerRadius?: number;
      startAngle?: number;
      endAngle?: number;
      fill?: string;
    }) => {
      return (
        <g>
          <Sector
            cx={props.cx}
            cy={props.cy}
            innerRadius={props.innerRadius}
            outerRadius={(props.outerRadius ?? 0) + 8}
            startAngle={props.startAngle}
            endAngle={props.endAngle}
            fill={props.fill}
          />
        </g>
      );
    },
    [],
  );

  const chartSizeClass =
    size === "large"
      ? "mx-auto aspect-square max-h-[440px] w-full max-w-[28rem]"
      : "mx-auto aspect-square max-h-[320px] w-full max-w-80";

  const innerRadius = size === "large" ? 96 : 72;
  const outerRadius = size === "large" ? 138 : 104;
  const total = totalValue ?? computedTotalValue;
  const topShare = total > 0 ? Math.round((merchantValue / total) * 100) : 0;
  const isSummary = variant === "summary";

  return (
    <Card
      className={
        isSummary
          ? "border-sky-300 bg-sky-50/60 shadow-sm dark:border-sky-800 dark:bg-sky-950/20"
          : "border-border/70 bg-card/95 shadow-sm"
      }
    >
      <CardHeader className="items-center pb-1 text-center">
        <CardTitle className={isSummary ? "text-lg font-semibold" : "text-base font-semibold"}>
          {shopName}
        </CardTitle>
        <p className={isSummary ? "text-foreground text-3xl font-semibold" : "text-foreground text-2xl font-semibold"}>
          {formatNumber(total)}
        </p>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {centerLabel} total
        </p>
      </CardHeader>
      <CardContent className="pb-5">
        <ChartContainer
          config={chartConfig}
          className={chartSizeClass}
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="key"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={0.6}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
            >
              {chartData.map((segment) => (
                <Cell key={segment.key} fill={segment.fill} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) - 12}
                          className="fill-muted-foreground text-[11px] font-medium uppercase"
                        >
                          Top merchant
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy || 0}
                          className="fill-foreground text-sm font-semibold"
                        >
                          {merchantName}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 26}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {formatNumber(merchantValue)}
                        </tspan>
                      </text>
                    );
                  }

                  return null;
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-4 flex items-center justify-between rounded-md border border-border/70 bg-background/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Top share</span>
          <span className="font-medium">{topShare}%</span>
        </div>
      </CardContent>
    </Card>
  );
}
