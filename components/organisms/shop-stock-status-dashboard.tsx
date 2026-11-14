"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Label, Pie, PieChart, Sector } from "recharts";

import {
  formatNumber,
  formatPercent,
} from "@/components/organisms/sales-budget-table-ui";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  summarizeShopStockDashboardCard,
  type ShopStockDashboardCard,
} from "@/lib/shop-stock-status/calc";
import {
  ONLINE_STOCK_COLUMNS,
  SHOP_STOCK_COLUMNS,
  shopStockBandOf,
  type ShopStockBand,
  type ShopStockStatus,
  type ShopStockTab,
} from "@/lib/shop-stock-status/config";
import { cn } from "@/lib/utils";

/** Doughnut segments, in order — the same colours as the SHOPS / ONLINE tables, plus purple. */
const SEGMENTS = [
  { key: "red", label: "Red · below 50%", short: "Red", color: "#f4a3b1" },
  {
    key: "yellow",
    label: "Yellow · 50–100%",
    short: "Yellow",
    color: "#f6d98b",
  },
  {
    key: "green",
    label: "Green · above 100%",
    short: "Green",
    color: "#9fdcbf",
  },
  {
    key: "purple",
    label: "Purple · No ROP - With Stock",
    short: "Purple",
    color: "#c3b4fb",
  },
] as const;
type SegmentKey = (typeof SEGMENTS)[number]["key"];

const BAND_TEXT: Record<ShopStockBand, string> = {
  fail: "text-rose-600 dark:text-rose-400",
  pass: "text-yellow-600 dark:text-yellow-400",
  full: "text-emerald-600 dark:text-emerald-400",
};

type DashboardCard = ShopStockDashboardCard & {
  key: string;
  label: string;
  tab: ShopStockTab;
};

/**
 * Shop Stock Status → Dashboard: one card per shop, then per online company (no combined
 * Online card). Built from the same rows as the SHOPS / ONLINE tables, so the numbers match.
 */
export function ShopStockStatusDashboard({
  data,
  loading,
  onOpenLocation,
}: {
  data: ShopStockStatus | null;
  loading: boolean;
  /** Card click: open that view (shops / online) filtered to that location. */
  onOpenLocation: (tab: ShopStockTab, columnKey: string) => void;
}) {
  const cards = useMemo<DashboardCard[]>(() => {
    if (!data) return [];
    return [
      ...SHOP_STOCK_COLUMNS.filter((c) => c.key !== "online").map((c) => ({
        key: c.key,
        label: c.label,
        tab: "shops" as const,
        ...summarizeShopStockDashboardCard(data.tabs.shops, c.key),
      })),
      ...ONLINE_STOCK_COLUMNS.map((c) => ({
        key: c.key,
        label: c.label,
        tab: "online" as const,
        ...summarizeShopStockDashboardCard(data.tabs.online, c.key),
      })),
    ];
  }, [data]);

  if (!data) {
    return (
      <div className="flex h-48 items-center justify-center">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <span className="text-sm text-muted-foreground">No data.</span>
        )}
      </div>
    );
  }

  const shops = cards.filter((c) => c.tab === "shops");
  const online = cards.filter((c) => c.tab === "online");
  return (
    <div className={cn("space-y-6", loading && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {SEGMENTS.map((s) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 text-muted-foreground"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            {s.label}
          </span>
        ))}
        <span className="text-muted-foreground">
          No ROP - No Stock items are not counted.
        </span>
      </div>
      <CardSection title="Shops" cards={shops} onOpen={onOpenLocation} />
      <CardSection title="Online" cards={online} onOpen={onOpenLocation} />
    </div>
  );
}

function CardSection({
  title,
  cards,
  onOpen,
}: {
  title: string;
  cards: DashboardCard[];
  onOpen: (tab: ShopStockTab, columnKey: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <LocationCard
            key={`${card.tab}-${card.key}`}
            card={card}
            onOpen={() => onOpen(card.tab, card.key)}
          />
        ))}
      </div>
    </section>
  );
}

function LocationCard({
  card,
  onOpen,
}: {
  card: DashboardCard;
  onOpen: () => void;
}) {
  const band =
    card.fulfilment === null ? null : shopStockBandOf(card.fulfilment);
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      title={`Open ${card.tab === "shops" ? "SHOPS" : "ONLINE"} filtered to ${card.label}`}
      className="relative cursor-pointer gap-0 overflow-visible py-0 rounded-2xl border border-border/70 bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      {band ? (
        <span
          className={cn(
            "absolute top-2.5 left-2.5 z-10 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ring-1 ring-inset",
            band === "fail"
              ? "bg-rose-500/15 text-rose-600 ring-rose-500/40 dark:text-rose-300"
              : "bg-emerald-500/15 text-emerald-600 ring-emerald-500/40 dark:text-emerald-300",
          )}
          title="Fulfilment below 50% = FAIL, otherwise PASS"
        >
          {band === "fail" ? "FAIL" : "PASS"}
        </span>
      ) : null}
      <CardHeader className="space-y-1 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_90%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] pt-3 pb-3 text-center [.border-b]:pb-3">
        <p className="text-base leading-6 font-semibold tracking-tight">
          {card.label}
        </p>
        <div className="grid grid-cols-3 gap-1 text-center">
          <Stat label="Total ROP" value={formatNumber(card.totalRop)} />
          <Stat label="Total Stock" value={formatNumber(card.totalStock)} />
          <Stat
            label="Fulfilment"
            value={
              card.fulfilment === null ? "-" : formatPercent(card.fulfilment)
            }
            className={band ? BAND_TEXT[band] : undefined}
          />
        </div>
      </CardHeader>
      <CardContent className="bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--secondary)_6%,transparent))] pt-3 pb-3">
        <Donut card={card} />
        <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[11px]">
          {SEGMENTS.map((s) => (
            <div
              key={s.key}
              title={s.label}
              className="rounded-lg border border-border/60 bg-background/70 px-1 py-1.5"
            >
              <div
                className="mx-auto mb-1 h-1.5 w-8 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <p className="font-medium tabular-nums">
                {formatNumber(card[s.key])}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className={cn("text-lg font-semibold tabular-nums", className)}>
        {value}
      </p>
    </div>
  );
}

/** Doughnut of Common SKU counts; centre = the location's total Common SKUs (all four colours). */
function Donut({ card }: { card: DashboardCard }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const segments = SEGMENTS.map((s) => ({
    key: s.key,
    label: s.label,
    short: s.short,
    value: card[s.key as SegmentKey],
    fill: s.color,
  }));
  const chartData = segments.filter((s) => s.value > 0);
  const totalItems = segments.reduce((sum, s) => sum + s.value, 0);
  const chartConfig = segments.reduce<ChartConfig>((config, s) => {
    config[s.key] = { label: s.label, color: s.fill };
    return config;
  }, {});

  return (
    <div className="mx-auto h-40 w-40 max-w-full">
      <ChartContainer
        id={`shop-stock-donut-${card.tab}-${card.key}`}
        config={chartConfig}
        className="mx-auto aspect-square h-full w-full"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, _name, item) => {
                  const payload = item.payload as { label: string };
                  return (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span>{payload.label}</span>
                      <span className="font-medium tabular-nums">
                        {formatNumber(Number(value))}
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
                : [
                    {
                      key: "none",
                      label: "No items",
                      value: 1,
                      fill: "var(--muted)",
                    },
                  ]
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
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox))
                  return null;
                const cx = viewBox.cx ?? 0;
                const cy = viewBox.cy ?? 0;
                return (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={cx}
                      y={cy - 4}
                      className="fill-foreground text-2xl font-bold"
                    >
                      {formatNumber(totalItems)}
                    </tspan>
                    <tspan
                      x={cx}
                      y={cy + 18}
                      className="fill-muted-foreground text-[10px]"
                    >
                      Common SKUs
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
  const {
    cx = 0,
    cy = 0,
    innerRadius = 46,
    outerRadius = 66,
    startAngle = 0,
    endAngle = 0,
    fill,
  } = props;
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
