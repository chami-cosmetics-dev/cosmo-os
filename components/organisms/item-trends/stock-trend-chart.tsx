"use client";

import { useMemo } from "react";

import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis, type TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { StockTrendSeriesPoint } from "@/lib/item-trends/stock-trends";

const STOCKOUT_COLOR = "var(--destructive)";
const PARTIAL_STOCKOUT_COLOR = "#eda100"; // matches --series-4 — reserved here for the "some warehouses empty" state
/** Initial stock-in marker — teal, distinct from the line (chart-1), red stockout and amber partial. */
const INITIAL_STOCK_COLOR = "#14b8a6";
/**
 * Per-ERP lines — blue then pink, so they never clash with the total line
 * (chart-1 purple), the teal initial marker, or the red/amber stockout dots.
 */
const ERP_LINE_COLORS = ["var(--series-1, #2a78d6)", "var(--series-5, #e87ba4)", "var(--series-8, #a3ccf6)"];

/**
 * Fixed-order categorical palette (dataviz skill) — a variant always gets the
 * same slot, never reassigned by rank. Each var() carries its own light-mode
 * hex as a fallback: an SVG `stroke` with an unresolved custom property falls
 * back to the initial value `none` (invisible), so this keeps the line
 * visible even if a CSS var somehow isn't loaded yet.
 */
export const VARIANT_COLORS = [
  "var(--series-1, #2a78d6)",
  "var(--series-2, #fff700)",
  "var(--series-3, #1baf7a)",
  "var(--series-4, #eda100)",
  "var(--series-5, #e87ba4)",
  "var(--series-6, #008300)",
  "var(--series-7, #7b6ade)",
  "var(--series-8, #a3ccf6)",
];

const chartConfig = {
  totalBalance: { label: "Stock on hand", color: "var(--chart-1)" },
} satisfies ChartConfig;

/**
 * showDot = always draw this point's dot (a lone point has no line to show it).
 * erp_<i> = that ERP's total stock at this point, flattened for its own Line.
 * erpInit_<i> = that ERP's first stock-in level, only on the point it happened.
 */
type PlottedPoint = StockTrendSeriesPoint & {
  ts: number;
  showDot?: boolean;
  [erpKey: `erp_${number}`]: number;
  [erpInitKey: `erpInit_${number}`]: number | undefined;
};

/** Every ERP that appears anywhere in the series, in first-seen order (keeps colours stable). */
function erpNamesIn(points: StockTrendSeriesPoint[]): string[] {
  const names: string[] = [];
  for (const point of points) {
    for (const name of Object.keys(point.erpBalances ?? {})) if (!names.includes(name)) names.push(name);
  }
  return names;
}

type DotProps = {
  cx?: number;
  cy?: number;
  payload?: PlottedPoint;
  onPointClick?: (point: StockTrendSeriesPoint) => void;
};

const toTs = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getTime();

/**
 * A line needs two points, so an item with a single ledger entry would draw
 * nothing and read as "no stock" at a glance — that lone point always gets a dot.
 */
function toPlottedPoints(points: StockTrendSeriesPoint[], erpNames: string[]): PlottedPoint[] {
  return points.map((point) => {
    const plotted: PlottedPoint = { ...point, ts: toTs(point.date), showDot: points.length === 1 };
    // An ERP with no rows yet sits at 0 until its first stock arrives.
    erpNames.forEach((name, i) => {
      plotted[`erp_${i}`] = point.erpBalances?.[name] ?? 0;
      plotted[`erpInit_${i}`] = point.erpInitialStock?.[name];
    });
    return plotted;
  });
}

/**
 * Stockout/restock markers. A visible 5px dot plus an invisible 12px overlay
 * for the actual click hit target (dataviz guidance: hit targets bigger than
 * the mark) — only rendered for flagged points, so clicking elsewhere on the
 * line does nothing.
 */
function StockPointDot({ cx, cy, payload, onPointClick }: DotProps) {
  if (cx == null || cy == null || !payload) return <g />;

  let color: string | null = null;
  if (payload.isStockout) color = STOCKOUT_COLOR;
  else if (payload.isPartialStockout) color = PARTIAL_STOCKOUT_COLOR;
  else if (payload.showDot) color = "var(--chart-1)";
  if (!color) return <g />;

  const clickable = (payload.isStockout || payload.isPartialStockout) && Boolean(onPointClick);

  return (
    <g style={clickable ? { cursor: "pointer" } : undefined} onClick={clickable ? () => onPointClick?.(payload) : undefined}>
      {clickable ? <circle cx={cx} cy={cy} r={12} fill="transparent" /> : null}
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="var(--background)" strokeWidth={2} />
    </g>
  );
}

function StockTrendTooltip({ active, payload, erpNames = [] }: TooltipProps<ValueType, NameType> & { erpNames?: string[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as PlottedPoint | undefined;
  if (!point) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-popover-foreground">{point.date}</div>
      {erpNames.length === 0 && point.initialStock !== undefined ? (
        <div className="font-medium" style={{ color: INITIAL_STOCK_COLOR }}>
          Initial stock-in: {point.initialStock}
        </div>
      ) : null}
      {erpNames
        .filter((name) => point.erpInitialStock?.[name] !== undefined)
        .map((name) => (
          <div key={`init-${name}`} className="font-medium" style={{ color: INITIAL_STOCK_COLOR }}>
            {name} first stock-in: {point.erpInitialStock?.[name]}
          </div>
        ))}
      <div className="text-muted-foreground">
        {erpNames.length > 0 ? "Total stock" : "Stock"}: {point.totalBalance}
      </div>
      {erpNames.map((name, i) => (
        <div key={name} className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: ERP_LINE_COLORS[i % ERP_LINE_COLORS.length] }}
            aria-hidden
          />
          {name}: {point.erpBalances?.[name] ?? 0}
        </div>
      ))}
      {point.isStockout ? (
        <div className="mt-1 font-medium" style={{ color: STOCKOUT_COLOR }}>
          Stocked out (all warehouses) — click dot for details
        </div>
      ) : point.isPartialStockout ? (
        <div className="mt-1 font-medium" style={{ color: PARTIAL_STOCKOUT_COLOR }}>
          Stocked out in some warehouses — click dot for details
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  points: StockTrendSeriesPoint[];
  onPointClick?: (point: StockTrendSeriesPoint) => void;
};

/** Single-SKU chart — one series, no legend needed (the title above already names it). */
export function StockTrendChart({ points, onPointClick }: Props) {
  const erpNames = useMemo(() => erpNamesIn(points), [points]);
  const plotted = useMemo(() => toPlottedPoints(points, erpNames), [points, erpNames]);

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No stock ledger history for this item yet.
      </p>
    );
  }

  return (
    <div>
      <ChartContainer config={chartConfig} className="aspect-auto h-[340px] w-full">
        <LineChart data={plotted} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ts: number) => new Date(ts).toISOString().slice(0, 10)}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            minTickGap={24}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={40} />
          <ChartTooltip content={<StockTrendTooltip erpNames={erpNames} />} />
          {/* Per-ERP lines drawn first, so the thicker total line sits on top where they overlap. */}
          {erpNames.map((name, i) => (
            <Line
              key={name}
              type="stepAfter"
              dataKey={`erp_${i}`}
              name={name}
              stroke={ERP_LINE_COLORS[i % ERP_LINE_COLORS.length]}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          ))}
          <Line
            type="stepAfter"
            dataKey="totalBalance"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={<StockPointDot onPointClick={onPointClick} />}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          {erpNames.length > 0 ? (
            /* Markers only (no line): each ERP's own first stock-in, on that ERP's line — teal fill, ERP-coloured ring. */
            erpNames.map((name, i) => (
              <Line
                key={`init-${name}`}
                dataKey={`erpInit_${i}`}
                stroke="none"
                dot={{ r: 6, fill: INITIAL_STOCK_COLOR, stroke: ERP_LINE_COLORS[i % ERP_LINE_COLORS.length], strokeWidth: 2.5 }}
                activeDot={false}
                legendType="none"
                isAnimationActive={false}
              />
            ))
          ) : (
            /* No per-ERP data: fall back to one marker for the combined first stock-in. */
            <Line
              dataKey="initialStock"
              stroke="none"
              dot={{ r: 5, fill: INITIAL_STOCK_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {erpNames.length > 0 ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: "var(--chart-1)" }} aria-hidden />
              Total stock
            </span>
            {erpNames.map((name, i) => (
              <span key={name} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-4 border-t-2 border-dashed"
                  style={{ borderColor: ERP_LINE_COLORS[i % ERP_LINE_COLORS.length] }}
                  aria-hidden
                />
                {name}
              </span>
            ))}
          </>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: INITIAL_STOCK_COLOR }} aria-hidden />
          {erpNames.length > 0 ? "First stock-in per ERP (ring = ERP colour)" : "Initial stock-in"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: STOCKOUT_COLOR }} aria-hidden />
          Stocked out (all warehouses)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: PARTIAL_STOCKOUT_COLOR }}
            aria-hidden
          />
          Stocked out in some warehouses
        </span>
      </div>
    </div>
  );
}

export type VariantSeriesLine = {
  sku: string;
  label: string;
  color: string;
};

export type MultiRow = { ts: number; date: string; total: number; [variantSku: string]: number | string | undefined };

type MultiProps = {
  data: MultiRow[];
  lines: VariantSeriesLine[];
};

function MultiTooltip({ active, payload }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as MultiRow | undefined;
  if (!row) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-popover-foreground">{row.date}</div>
      <div className="space-y-0.5">
        {payload
          .filter((entry) => entry.value != null)
          .map((entry) => (
            <div key={String(entry.dataKey)} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
                {entry.name}
              </span>
              <span className="font-medium text-popover-foreground">{entry.value}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

/**
 * Multi-variant chart for a base SKU — one colored line per variant plus a
 * dashed "Total" line. 4+ lines need a legend since color alone can't carry
 * identity at that count (per the app's existing accessibility pattern), so
 * this always renders one.
 */
export function StockTrendMultiChart({ data, lines }: MultiProps) {
  const multiConfig = useMemo(
    () =>
      Object.fromEntries(
        lines.map((line) => [line.sku, { label: line.label, color: line.color }]),
      ) satisfies ChartConfig,
    [lines],
  );

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No stock ledger history for these variants yet.
      </p>
    );
  }

  return (
    <ChartContainer config={multiConfig} className="aspect-auto h-[400px] w-full">
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(ts: number) => new Date(ts).toISOString().slice(0, 10)}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          minTickGap={24}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={40} />
        <ChartTooltip content={<MultiTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((line) => (
          <Line
            key={line.sku}
            type="stepAfter"
            dataKey={line.sku}
            name={line.label}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
        <Line
          type="stepAfter"
          dataKey="total"
          name="Total"
          stroke="var(--foreground)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
