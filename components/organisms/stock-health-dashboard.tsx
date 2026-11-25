"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Label, Pie, PieChart, Sector } from "recharts";

import { priorityLabelClass, priorityLabelSlot } from "@/components/organisms/item-trends/priority-label";
import { formatNumber, formatPercent } from "@/components/organisms/sales-budget-table-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import type { StockHealthRopGroup } from "@/lib/stock-health/calc";
import {
  STOCK_HEALTH_ROP_PASS_PERCENT,
  type StockHealthRopCounts,
  type StockHealthRopStatus,
  type StockHealthRopTotals,
  type StockHealthStatus,
} from "@/lib/stock-health/config";
import { cn } from "@/lib/utils";

/** ROP group segments, in order (same colours as Shop Stock Status → Dashboard). */
const GROUP_SEGMENTS: Array<{ key: StockHealthRopGroup; label: string; rule: string; color: string }> = [
  { key: "fail", label: "Fail", rule: "stock 50% of ROP or below", color: "#f4a3b1" },
  { key: "noRopWithStock", label: "No ROP - With Stock", rule: "ROP 0, stock above 0", color: "#f6d98b" },
  { key: "pass", label: "Pass", rule: "stock above 50% of ROP", color: "#9fdcbf" },
  { key: "noRopNoStock", label: "No ROP - No Stock", rule: "ROP 0, stock 0", color: "#c3b4fb" },
];

/** How the numbers are coloured and grouped: doughnut groups, PASS / FAIL badge, Fulfilment colours. */
function DashboardLegend() {
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-medium text-foreground">Doughnut (each Common SKU, its stock ÷ ROP):</span>
        {GROUP_SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
            <span className="text-foreground">{s.label}</span> · {s.rule}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-medium text-foreground">PASS / FAIL (the card):</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-500/40 ring-inset dark:text-emerald-300">
            PASS
          </span>
          Fulfilment above 50%
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 ring-1 ring-rose-500/40 ring-inset dark:text-rose-300">
            FAIL
          </span>
          Fulfilment 50% or below
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-medium text-foreground">Fulfilment colour (Total Stock ÷ Total ROP):</span>
        <span className="font-semibold text-rose-600 dark:text-rose-400">Red · 50% or below</span>
        <span className="font-semibold text-yellow-600 dark:text-yellow-400">Yellow · above 50%, below 100%</span>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Green · 100%</span>
      </div>
      <div className="text-muted-foreground">
        Total Stock counts each Common SKU&apos;s stock up to its ROP; stock above ROP is shown as
        Additional.
      </div>
    </div>
  );
}

/** Doughnut colours per priority label slot (pink, cyan, orange, indigo, fuchsia, teal). */
const PRIORITY_SLOT_COLORS = ["#f472b6", "#22d3ee", "#fb923c", "#818cf8", "#e879f9", "#2dd4bf"];

/** `hint`: extra text after the count in the hover (e.g. a split). */
export type Segment = { key: string; label: string; value: number; fill: string; hint?: string };

/**
 * Fulfilment text colour. Stock is capped at ROP per Common SKU, so Fulfilment is at most 100%:
 * FAIL (≤ 50%) red, above 50% up to (not including) 100% yellow, 100% green. The small tolerance
 * keeps decimal ROPs that sum to 99.9999…% green.
 */
function fulfilmentClass(fulfilment: number): string {
  if (fulfilment <= STOCK_HEALTH_ROP_PASS_PERCENT) return "text-rose-600 dark:text-rose-400";
  return fulfilment >= 100 - 1e-9
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-yellow-600 dark:text-yellow-400";
}

/**
 * Stock Health → Dashboard: ROP Status as cards — one per priority status (+ Grand Total) with
 * Total ROP, Total Stock, Fulfilment and its ROP groups, and a 0' Stock card by priority.
 * Same data as the ROP Status table, so the numbers match.
 */
export function StockHealthDashboardCard({
  reloadKey = 0,
  onRefreshed,
  onOpenRopDetails,
  onOpenOutOfStock,
}: {
  reloadKey?: number;
  /** Called after Refresh rebuilt the ERP data (the other tabs use the same data). */
  onRefreshed?: () => void;
  /** Card / group click: ROP Details filtered to it (null = all). */
  onOpenRopDetails: (status: StockHealthStatus | null, group: StockHealthRopGroup | null) => void;
  /** 0' Stock card: Out of Stock filtered to that priority (null = all). */
  onOpenOutOfStock: (status: StockHealthStatus | null) => void;
}) {
  const [data, setData] = useState<StockHealthRopStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/purchasing/stock-health/rop-status${refresh ? "?refresh=1" : ""}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load ROP status");
      setData(body as StockHealthRopStatus);
      return true;
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to load ROP status");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load, reloadKey]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Dashboard</CardTitle>
          <p className="text-xs text-muted-foreground">
            {data
              ? `Live ERP stock vs OSF ROP (website drafts with no stock left out) as of ${formatAppIsoDateTime(data.fetchedAt)}. Per priority status: Total ROP and Total Stock of the Common SKUs with a ROP (No ROP items are not in these totals). Click a card or a count to open ROP Details.`
              : "Common SKUs by stock against ROP, per priority status."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true).then((ok) => ok && onRefreshed?.())}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          {loading ? "Loading ERP stock…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {!data ? (
          <div className="flex h-48 items-center justify-center">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-sm text-muted-foreground">No data.</span>
            )}
          </div>
        ) : (
          <DashboardBody
            data={data}
            loading={loading}
            onOpenRopDetails={onOpenRopDetails}
            onOpenOutOfStock={onOpenOutOfStock}
          />
        )}
      </CardContent>
    </Card>
  );
}

function DashboardBody({
  data,
  loading,
  onOpenRopDetails,
  onOpenOutOfStock,
}: {
  data: StockHealthRopStatus;
  loading: boolean;
  onOpenRopDetails: (status: StockHealthStatus | null, group: StockHealthRopGroup | null) => void;
  onOpenOutOfStock: (status: StockHealthStatus | null) => void;
}) {
  const empty: StockHealthRopTotals = { totalRop: 0, totalStock: 0, totalAdditionalStock: 0 };
  const zeroSegments: Segment[] = data.rows.map((row) => ({
    key: row.status,
    label: row.status,
    value: row.zeroStock,
    fill: PRIORITY_SLOT_COLORS[priorityLabelSlot(row.status)],
  }));

  return (
    <div className={cn("space-y-6", loading && "opacity-60")}>
      <DashboardLegend />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Priority status
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.rows.map((row) => (
            <RopCard
              key={row.status}
              status={row.status}
              counts={row}
              totals={data.ropTotals.byStatus[row.status] ?? empty}
              onOpen={(group) => onOpenRopDetails(row.status, group)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Overall
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RopCard
            status={null}
            counts={data.grandTotal}
            totals={data.ropTotals.grandTotal}
            onOpen={(group) => onOpenRopDetails(null, group)}
          />
          <ZeroStockCard
            segments={zeroSegments}
            total={data.grandTotal.zeroStock}
            onOpen={(status) => onOpenOutOfStock(status)}
          />
        </div>
      </section>
    </div>
  );
}

/** Click / Enter / Space on a card (counts inside stop propagation for their own filter). */
function clickableProps(onOpen: () => void, title: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    title,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

const CARD_CLASS =
  "relative cursor-pointer gap-0 overflow-visible py-0 rounded-2xl border border-border/70 bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none";
const CARD_HEAD_CLASS =
  "space-y-1 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_90%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] pt-3 pb-3 text-center [.border-b]:pb-3";
const CARD_BODY_CLASS =
  "bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--secondary)_6%,transparent))] pt-3 pb-3";

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ring-inset",
        priorityLabelClass(status),
      )}
    >
      {status}
    </span>
  );
}

/** One priority status (or the Grand Total, status null). */
function RopCard({
  status,
  counts,
  totals,
  onOpen,
}: {
  status: StockHealthStatus | null;
  counts: StockHealthRopCounts;
  totals: StockHealthRopTotals;
  onOpen: (group: StockHealthRopGroup | null) => void;
}) {
  const fulfilment = totals.totalRop > 0 ? (totals.totalStock / totals.totalRop) * 100 : null;
  const pass = fulfilment !== null && fulfilment > STOCK_HEALTH_ROP_PASS_PERCENT;
  const segments: Segment[] = GROUP_SEGMENTS.map((s) => ({
    key: s.key,
    label: s.label,
    value: counts[s.key],
    fill: s.color,
  }));
  return (
    <Card
      {...clickableProps(() => onOpen(null), `Open ROP Details: ${status ?? "all priorities"}`)}
      className={CARD_CLASS}
    >
      {fulfilment !== null ? (
        <span
          className={cn(
            "absolute top-2.5 left-2.5 z-10 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ring-1 ring-inset",
            pass
              ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/40 dark:text-emerald-300"
              : "bg-rose-500/15 text-rose-600 ring-rose-500/40 dark:text-rose-300",
          )}
          title="Fulfilment above 50% = PASS, otherwise FAIL"
        >
          {pass ? "PASS" : "FAIL"}
        </span>
      ) : null}
      <CardHeader className={CARD_HEAD_CLASS}>
        <div className="flex h-7 items-center justify-center">
          {status ? (
            <StatusChip status={status} />
          ) : (
            <p className="text-base leading-6 font-semibold tracking-tight">Grand Total</p>
          )}
        </div>
        <div className="-mx-5 grid grid-cols-4 gap-1 text-center">
          <Stat
            label="Total ROP"
            title="Sum of ROP of the Common SKUs with a ROP"
            value={formatNumber(totals.totalRop)}
          />
          <Stat
            label="Total Stock"
            title="Per Common SKU, stock up to its ROP (stock above ROP is in Additional)"
            value={formatNumber(totals.totalStock)}
          />
          <Stat
            label="Additional Stock"
            title="Additional stock: per Common SKU, stock above its ROP"
            value={formatNumber(totals.totalAdditionalStock)}
          />
          <Stat
            label="Fulfilment"
            title="Total Stock / Total ROP × 100"
            value={fulfilment === null ? "-" : formatPercent(fulfilment)}
            className={fulfilment === null ? undefined : fulfilmentClass(fulfilment)}
          />
        </div>
      </CardHeader>
      <CardContent className={CARD_BODY_CLASS}>
        <Donut id={`stock-health-donut-${status ?? "total"}`} segments={segments} centreLabel="Common SKUs" />
        <CountTiles
          segments={segments}
          onOpen={(key) => onOpen(key as StockHealthRopGroup)}
          title={(label) => `Open ROP Details: ${status ?? "all priorities"}, ${label}`}
        />
      </CardContent>
    </Card>
  );
}

/** 0' Stock: Common SKUs with no stock, split by priority status (no ROP / fulfilment). */
function ZeroStockCard({
  segments,
  total,
  onOpen,
}: {
  segments: Segment[];
  total: number;
  onOpen: (status: StockHealthStatus | null) => void;
}) {
  return (
    <Card {...clickableProps(() => onOpen(null), "Open Out of Stock")} className={CARD_CLASS}>
      <CardHeader className={CARD_HEAD_CLASS}>
        <div className="flex h-7 items-center justify-center">
          <p className="text-base leading-6 font-semibold tracking-tight">0&apos; Stock</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {formatNumber(total)} Common SKUs with no stock, by priority status.
        </p>
      </CardHeader>
      <CardContent className={CARD_BODY_CLASS}>
        <Donut id="stock-health-donut-zero-stock" segments={segments} centreLabel="0' Stock" />
        <CountTiles
          segments={segments}
          onOpen={(key) => onOpen(key as StockHealthStatus)}
          title={(label) => `Open Out of Stock: ${label}`}
          showLabels
        />
      </CardContent>
    </Card>
  );
}

function CountTiles({
  segments,
  onOpen,
  title,
  showLabels = false,
}: {
  segments: Segment[];
  onOpen: (key: string) => void;
  title: (label: string) => string;
  /** Show the segment name under its colour (the 0' Stock card's priorities). */
  showLabels?: boolean;
}) {
  return (
    <div
      className="mt-1 grid gap-1 text-center text-[11px]"
      style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
    >
      {segments.map((s) => (
        <button
          key={s.key}
          type="button"
          title={title(s.label)}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(s.key);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="rounded-lg border border-border/60 bg-background/70 px-1 py-1.5 transition-colors hover:bg-muted"
        >
          <div className="mx-auto mb-1 h-1.5 w-8 max-w-full rounded-full" style={{ backgroundColor: s.fill }} />
          {showLabels ? (
            <p className="truncate text-[10px] text-muted-foreground">{s.label}</p>
          ) : null}
          <p className="font-medium tabular-nums">{formatNumber(s.value)}</p>
        </button>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  title,
  className,
}: {
  label: string;
  value: string;
  title?: string;
  className?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-between" title={title}>
      <p className="text-muted-foreground min-h-[2.5em] text-[10px] leading-tight font-medium tracking-normal uppercase">
        {/* One word per line, so every label reads in full and the four line up. */}
        {label.split(" ").map((word) => (
          <span key={word} className="block whitespace-nowrap">
            {word}
          </span>
        ))}
      </p>
      <p className={cn("truncate text-[15px] font-semibold tabular-nums", className)}>{value}</p>
    </div>
  );
}

/** Doughnut of Common SKU counts; centre = their total. */
export function Donut({
  id,
  segments,
  centreLabel,
  onSegmentClick,
}: {
  id: string;
  segments: Segment[];
  centreLabel: string;
  /** Optional: a segment click (Item Drafting dashboard opens its tab). */
  onSegmentClick?: (key: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartData = segments.filter((s) => s.value > 0);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const chartConfig = segments.reduce<ChartConfig>((config, s) => {
    config[s.key] = { label: s.label, color: s.fill };
    return config;
  }, {});

  return (
    <div className="mx-auto h-40 w-40 max-w-full">
      <ChartContainer id={id} config={chartConfig} className="mx-auto aspect-square h-full w-full">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, _name, item) => {
                  const payload = item.payload as { label: string; hint?: string };
                  return (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span>{payload.label}</span>
                      <span className="font-medium tabular-nums">
                        {formatNumber(Number(value))}
                        {payload.hint ? ` (${payload.hint})` : ""}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          <Pie
            data={
              chartData.length
                ? chartData
                : [{ key: "none", label: "No items", value: 1, fill: "var(--muted)" }]
            }
            dataKey="value"
            nameKey="key"
            cx="50%"
            cy="50%"
            innerRadius={46}
            outerRadius={66}
            paddingAngle={chartData.length > 1 ? 2 : 0}
            strokeWidth={0}
            activeIndex={activeIndex ?? undefined}
            activeShape={renderActiveShape}
            isAnimationActive
            animationDuration={260}
            onClick={onSegmentClick ? (entry) => onSegmentClick(String((entry as { key?: string }).key ?? "")) : undefined}
            className={onSegmentClick ? "cursor-pointer" : undefined}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                const cx = viewBox.cx ?? 0;
                const cy = viewBox.cy ?? 0;
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={cx} y={cy - 4} className="fill-foreground text-2xl font-bold">
                      {formatNumber(total)}
                    </tspan>
                    <tspan x={cx} y={cy + 18} className="fill-muted-foreground text-[10px]">
                      {centreLabel}
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
    </div>
  );
}

function renderActiveShape(props: {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
}) {
  const { cx = 0, cy = 0, innerRadius = 46, outerRadius = 66, startAngle = 0, endAngle = 0, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 4}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 9}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.3}
      />
    </g>
  );
}
