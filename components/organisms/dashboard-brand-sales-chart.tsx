"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";

// ─── Types ────────────────────────────────────────────────────────────────────

type BrandMerchantRow = {
  merchantId: string | null;
  merchantName: string;
  total: number;
};

type BrandSalesRow = {
  brand: string;
  total: number;
  merchants: BrandMerchantRow[];
};

type BrandConfig = {
  id: string;
  name: string;
  isSelected: boolean;
  sortOrder: number;
};

type BrandSalesApiResponse = {
  brands: BrandSalesRow[];
  otherBrands: BrandSalesRow;
  brandConfigs: BrandConfig[];
  invalidRange: boolean;
};

type ChartRow = {
  brand: string;
  total: number;
  [segKey: string]: string | number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DM_GENERAL = "DM General";
const OTHER_BRANDS_LABEL = "Other Brands";
const MAX_MERCHANT_SEGS = 10;

const CHART_COLORS = [
  "#f97316", // orange
  "#6366f1", // indigo
  "#ec4899", // pink
  "#eab308", // yellow
  "#14b8a6", // teal
  "#ef4444", // red
  "#a3e635", // lime
  "#3b82f6", // blue
  "#d946ef", // fuchsia
  "#22c55e", // green
  "#f59e0b", // amber
];

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function CustomLegend({
  payload,
  hidden,
  onToggle,
  colorMap,
}: {
  payload?: Array<{ dataKey?: unknown; color?: string; value?: unknown }>;
  hidden: Set<string>;
  onToggle: (key: string) => void;
  colorMap: Map<string, string>;
}) {
  if (!payload?.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
      {payload.map((item) => {
        const key = String(item.dataKey ?? "");
        const label = String(item.value ?? key);
        const color = colorMap.get(key) ?? item.color ?? "#888";
        const isHidden = hidden.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs transition-colors",
              "hover:bg-muted/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              isHidden ? "text-muted-foreground line-through opacity-50" : "text-foreground",
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-md text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload
        .filter((p) => Number(p.value ?? 0) > 0)
        .map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-[2px] shrink-0"
              style={{ backgroundColor: p.color ?? "#888" }}
            />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium tabular-nums">{formatCompact(Number(p.value ?? 0))}</span>
          </div>
        ))}
      <div className="mt-1 border-t border-border pt-1 font-semibold">
        Total: {formatCompact(total)}
      </div>
    </div>
  );
}

// ─── Brand Config Editor ──────────────────────────────────────────────────────

function BrandConfigEditor({
  configs,
  onAdd,
  onToggle,
  onDelete,
  saving,
}: {
  configs: BrandConfig[];
  onAdd: (name: string) => Promise<void>;
  onToggle: (id: string, isSelected: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
}) {
  const [newName, setNewName] = useState("");

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await onAdd(trimmed);
    setNewName("");
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">Manage Brands in Chart</p>
      <p className="text-xs text-muted-foreground">
        Add brand names to track. Tick/untick to show or hide in the chart — unchecked brands
        roll into the &quot;Other Brands&quot; bar. Brand matching is case-insensitive and checks
        if the brand name appears anywhere in the product title.
      </p>

      {/* Existing brands */}
      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
        {configs.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No brands configured yet.</p>
        )}
        {configs.map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-sm"
          >
            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={b.isSelected}
                disabled={saving}
                onChange={() => void onToggle(b.id, !b.isSelected)}
                className="h-4 w-4 rounded border-border"
              />
              <span className={cn("truncate", !b.isSelected && "text-muted-foreground line-through")}>
                {b.name}
              </span>
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void onDelete(b.id)}
              className="text-destructive hover:text-destructive/80 text-xs px-1.5 py-0.5 rounded hover:bg-destructive/10 transition-colors"
              aria-label={`Remove ${b.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add new brand */}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Brand name (e.g. Cerave)"
          className="h-8 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
          disabled={saving}
        />
        <Button
          size="sm"
          variant="default"
          onClick={() => void handleAdd()}
          disabled={saving || !newName.trim()}
          className="h-8 text-xs"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DashboardBrandSalesChartProps {
  canEditDashboard: boolean;
}

export function DashboardBrandSalesChart({ canEditDashboard }: DashboardBrandSalesChartProps) {
  const { fromDate, toDate, dateType, salesLocations, filterInfo } = useDashboardOverview();

  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [data, setData] = useState<BrandSalesApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenMerchants, setHiddenMerchants] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchIdRef = useRef(0);

  // ── Fetch brand sales data ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        date_type: dateType,
      });
      if (selectedLocationId !== "all") {
        params.set("location_id", selectedLocationId);
      }
      const res = await fetch(`/api/admin/dashboard/brand-sales?${params.toString()}`);
      const body = (await res.json()) as BrandSalesApiResponse & { error?: string };
      if (id !== fetchIdRef.current) return;
      if (!res.ok) throw new Error(body.error ?? "Failed to load brand sales");
      setData(body);
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load brand sales");
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [fromDate, toDate, dateType, selectedLocationId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Build chart data ──────────────────────────────────────────────────────
  const { chartRows, segmentKeys, colorMap, legendPayload } = useMemo(() => {
    if (!data) return { chartRows: [], segmentKeys: [], colorMap: new Map(), legendPayload: [] };

    // Determine which brands appear (selected ones + other brands if has data)
    const selectedConfigs = data.brandConfigs.filter((b) => b.isSelected);
    const selectedNames = new Set(selectedConfigs.map((b) => b.name));

    // Collect all merchants across all relevant brands
    const globalMerchantTotals = new Map<string, number>();
    const accumulateMerchants = (row: BrandSalesRow) => {
      for (const m of row.merchants) {
        globalMerchantTotals.set(
          m.merchantName,
          (globalMerchantTotals.get(m.merchantName) ?? 0) + m.total,
        );
      }
    };

    // Only selected brands + other brands for merchant collection
    for (const b of data.brands) {
      if (selectedNames.has(b.brand)) accumulateMerchants(b);
    }
    accumulateMerchants(data.otherBrands);

    // Sort merchants by global total, cap at MAX_MERCHANT_SEGS
    const sortedMerchants = [...globalMerchantTotals.entries()].sort((a, b) => b[1] - a[1]);
    const topMerchants = sortedMerchants.slice(0, MAX_MERCHANT_SEGS).map(([n]) => n);
    const restMerchants = new Set(
      sortedMerchants.slice(MAX_MERCHANT_SEGS).map(([n]) => n),
    );
    const hasRest = restMerchants.size > 0;
    const otherMerchantsKey = "__other_merchants";

    // Segment keys
    const keys: string[] = topMerchants.map((_, i) => `m_${i}`);
    if (hasRest) keys.push(otherMerchantsKey);

    // Color map
    const cMap = new Map<string, string>();
    topMerchants.forEach((name, i) => {
      cMap.set(`m_${i}`, CHART_COLORS[i % CHART_COLORS.length]!);
    });
    if (hasRest) cMap.set(otherMerchantsKey, "#94a3b8");

    // Build rows for selected brands
    const buildRow = (brandRow: BrandSalesRow): ChartRow => {
      const row: ChartRow = { brand: brandRow.brand, total: brandRow.total };
      for (const key of keys) row[key] = 0;

      for (const m of brandRow.merchants) {
        if (restMerchants.has(m.merchantName)) {
          row[otherMerchantsKey] = (row[otherMerchantsKey] as number) + m.total;
        } else {
          const idx = topMerchants.indexOf(m.merchantName);
          if (idx >= 0) {
            const k = `m_${idx}`;
            row[k] = (row[k] as number) + m.total;
          } else {
            if (hasRest) row[otherMerchantsKey] = (row[otherMerchantsKey] as number) + m.total;
          }
        }
      }
      return row;
    };

    const rows: ChartRow[] = [
      ...data.brands.filter((b) => selectedNames.has(b.brand)).map(buildRow),
    ];

    // Always append "Other Brands" if there's data for it
    if (data.otherBrands.total > 0) {
      rows.push(buildRow(data.otherBrands));
    }

    // Legend payload
    const lp = topMerchants.map((name, i) => ({
      dataKey: `m_${i}`,
      value: name,
      color: CHART_COLORS[i % CHART_COLORS.length]!,
    }));
    if (hasRest) lp.push({ dataKey: otherMerchantsKey, value: "Other Merchants", color: "#94a3b8" });

    return { chartRows: rows, segmentKeys: keys, colorMap: cMap, legendPayload: lp };
  }, [data]);

  // ── Brand config mutations ─────────────────────────────────────────────────
  const handleAddBrand = useCallback(async (name: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/dashboard/brand-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json()) as { error?: string; config?: BrandConfig };
      if (!res.ok) throw new Error(body.error ?? "Failed to add brand");
      // Refresh data
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, [fetchData]);

  const handleToggleBrand = useCallback(async (id: string, isSelected: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/dashboard/brand-config/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSelected }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to update brand");
      }
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, [fetchData]);

  const handleDeleteBrand = useCallback(async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/dashboard/brand-config/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to delete brand");
      }
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, [fetchData]);

  const toggleMerchantSegment = useCallback((key: string) => {
    setHiddenMerchants((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const visibleSegmentKeys = useMemo(
    () => segmentKeys.filter((k) => !hiddenMerchants.has(k)),
    [segmentKeys, hiddenMerchants],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  const locationOptions = salesLocations;

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Sales Performance Analysis</CardTitle>
            <CardDescription>
              Evaluation of Sales Data with a Focus on Order Date and MRP
            </CardDescription>
            <p className="text-muted-foreground text-xs">{filterInfo}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Location filter */}
            <div className="w-52">
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Please Select a Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locationOptions.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canEditDashboard && (
              <Button
                type="button"
                size="sm"
                variant={isEditing ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setIsEditing((v) => !v)}
              >
                {isEditing ? "Done Editing" : "Edit Brands"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Brand config editor */}
        {isEditing && data && (
          <BrandConfigEditor
            configs={data.brandConfigs}
            onAdd={handleAddBrand}
            onToggle={handleToggleBrand}
            onDelete={handleDeleteBrand}
            saving={saving}
          />
        )}

        {/* Loading / Error / Empty */}
        {loading && (
          <div className="text-muted-foreground py-12 text-center text-sm">
            Loading brand sales…
          </div>
        )}

        {!loading && error && (
          <div className="py-8 text-center text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && chartRows.length === 0 && (
          <div className="text-muted-foreground py-12 text-center text-sm">
            {data?.brandConfigs.length === 0
              ? canEditDashboard
                ? 'No brands configured. Click "Edit Brands" to add brands to the chart.'
                : "No brands configured for this chart."
              : "No sales data found for the selected filters."}
          </div>
        )}

        {/* Chart */}
        {!loading && !error && chartRows.length > 0 && (
          <div style={{ height: Math.max(340, chartRows.length * 60) }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartRows}
                margin={{ top: 24, right: 60, left: 20, bottom: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="brand"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  tickLine={false}
                  height={70}
                />
                <YAxis
                  tickFormatter={formatCompact}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.05)" }} />
                <Legend
                  content={(props) => (
                    <CustomLegend
                      payload={(props.payload ?? []) as Array<{ dataKey?: unknown; color?: string; value?: unknown }>}
                      hidden={hiddenMerchants}
                      onToggle={toggleMerchantSegment}
                      colorMap={colorMap}
                    />
                  )}
                  wrapperStyle={{ paddingTop: 8 }}
                />
                {segmentKeys.map((key, idx) => {
                  const isHidden = hiddenMerchants.has(key);
                  const visIdx = visibleSegmentKeys.indexOf(key);
                  const isLast = !isHidden && visIdx === visibleSegmentKeys.length - 1;

                  return (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="brand"
                      hide={isHidden}
                      fill={colorMap.get(key) ?? CHART_COLORS[idx % CHART_COLORS.length]!}
                      name={legendPayload.find((p) => p.dataKey === key)?.value ?? key}
                      radius={isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={60}
                    >
                      {isLast && (
                        <LabelList
                          content={(props) => {
                            const { x, y, width, value, payload } = props as {
                              x?: number | string;
                              y?: number | string;
                              width?: number | string;
                              value?: number;
                              payload?: ChartRow;
                            };
                            if (!payload) return null;
                            const total = visibleSegmentKeys.reduce(
                              (s, k) => s + Number(payload[k] ?? 0),
                              0,
                            );
                            return (
                              <text
                                x={Number(x ?? 0) + Number(width ?? 0) / 2}
                                y={Number(y ?? 0) - 6}
                                textAnchor="middle"
                                className="fill-foreground"
                                fontSize={11}
                                fontWeight={500}
                              >
                                {formatCompact(total)}
                              </text>
                            );
                          }}
                        />
                      )}
                    </Bar>
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
