"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
  }
>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("Chart components must be used inside ChartContainer.");
  }

  return context;
}

function ChartContainer({
  config,
  className,
  children,
}: Omit<React.ComponentProps<"div">, "children"> & {
  config: ChartConfig;
  children: React.ReactElement;
}) {
  const style = Object.entries(config).reduce<
    React.CSSProperties & Record<`--${string}`, string>
  >(
    (acc, [key, value]) => {
      if (value.color) {
        acc[`--color-${key}`] = value.color;
      }

      return acc;
    },
    {},
  );

  return (
    <ChartContext.Provider value={{ config }}>
      <div className={cn("flex items-center justify-center", className)} style={style}>
        <RechartsPrimitive.ResponsiveContainer width="100%" height="100%">
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  hideLabel = false,
}: RechartsPrimitive.TooltipProps<number, string> & {
  hideLabel?: boolean;
}) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="text-foreground px-2 py-1 text-sm">
      {payload.map((item) => {
        const key = String(item.name ?? item.dataKey ?? "");
        const itemConfig = config[key];
        const color = item.color ?? item.payload?.fill ?? itemConfig?.color;

        return (
          <div key={key} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-muted-foreground">
              {hideLabel ? itemConfig?.label ?? key : itemConfig?.label ?? key}
            </span>
            <span className="ml-auto font-medium text-foreground">
              {Number(item.value ?? 0).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
