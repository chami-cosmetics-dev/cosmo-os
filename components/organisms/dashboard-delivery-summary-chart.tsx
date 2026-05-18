"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";

// ─── Types ────────────────────────────────────────────────────────────────────

type DeliveryCourierRow = {
  name: string;
  completedCount: number;
  pendingCount: number;
  completedValue: number;
  pendingValue: number;
};

type ApiResponse = {
  couriers: DeliveryCourierRow[];
  invalidRange: boolean;
  error?: string;
};

type DisplayMode = "count" | "value";

type ChartRow = {
  name: string;
  Completed: number;
  Pending: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_COMPLETED = "#3b82f6"; // blue-500
const COLOR_PENDING = "#f59e0b"; // amber-400

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `Rs ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `Rs ${(value / 1_000).toFixed(1)}k`;
  return `Rs ${value.toFixed(0)}`;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function DeliveryTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  mode: DisplayMode;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">
            {mode === "count" ? p.value : formatCurrency(p.value)}
          </span>
        </div>
      ))}
      <div className="mt-1 border-t border-border/50 pt-1 text-muted-foreground">
        Total:{" "}
        <span className="font-semibold text-foreground">
          {mode === "count" ? total : formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DashboardDeliverySummaryChart() {
  const { fromDate, toDate, filterInfo, hasInvalidRange } = useDashboardOverview();

  const [mode, setMode] = useState<DisplayMode>("count");
  const [data, setData] = useState<DeliveryCourierRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIdRef = useRef(0);

  const loadData = useCallback(async () => {
    if (hasInvalidRange) {
      setData([]);
      setError(null);
      return;
    }
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const res = await fetch(`/api/admin/dashboard/delivery-summary?${params.toString()}`);
      const body = (await res.json()) as ApiResponse;
      if (id !== fetchIdRef.current) return;
      if (!res.ok) throw new Error(body.error ?? "Failed to load delivery summary");
      setData(body.couriers ?? []);
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load delivery summary");
      setData([]);
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [fromDate, hasInvalidRange, toDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const chartRows: ChartRow[] = data.map((row) => ({
    name: row.name,
    Completed: mode === "count" ? row.completedCount : row.completedValue,
    Pending: mode === "count" ? row.pendingCount : row.pendingValue,
  }));

  const yAxisFormatter = mode === "count" ? (v: number) => String(v) : formatCurrency;
  const barLabelFormatter =
    mode === "count"
      ? (v: number) => (v === 0 ? "" : String(v))
      : (v: number) => (v === 0 ? "" : formatValue(v));

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="pb-3">
        {/* Count / Value toggle */}
        <div className="mb-1 flex items-center gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="delivery-summary-mode"
              value="count"
              checked={mode === "count"}
              onChange={() => setMode("count")}
              className="accent-primary"
            />
            <span>Count</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="delivery-summary-mode"
              value="value"
              checked={mode === "value"}
              onChange={() => setMode("value")}
              className="accent-primary"
            />
            <span>Value</span>
          </label>
        </div>

        <CardTitle className="text-center text-sm font-semibold text-foreground">
          Delivery Summary (Completed / Pending) [Dispatch On Date Only]
        </CardTitle>
        <CardDescription className="text-center text-xs">{filterInfo}</CardDescription>
      </CardHeader>

      <CardContent className="pb-4">
        {error ? (
          <p className="py-8 text-center text-sm text-red-500">{error}</p>
        ) : loading ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Loading delivery summary…
          </p>
        ) : chartRows.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No dispatched orders found for this period.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={chartRows}
              margin={{ top: 20, right: 24, left: 8, bottom: 60 }}
              barGap={2}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.4} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={72}
              />
              <YAxis
                tickFormatter={yAxisFormatter}
                tick={{ fontSize: 11 }}
                label={{
                  value: mode === "count" ? "Orders" : "Value (Rs)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11 },
                  offset: 8,
                }}
              />
              <Tooltip content={<DeliveryTooltip mode={mode} />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
              <Bar dataKey="Completed" fill={COLOR_COMPLETED} maxBarSize={48} radius={[3, 3, 0, 0]}>
                <LabelList
                  dataKey="Completed"
                  position="top"
                  formatter={barLabelFormatter}
                  style={{ fontSize: 10, fill: "currentColor" }}
                />
              </Bar>
              <Bar dataKey="Pending" fill={COLOR_PENDING} maxBarSize={48} radius={[3, 3, 0, 0]}>
                <LabelList
                  dataKey="Pending"
                  position="top"
                  formatter={barLabelFormatter}
                  style={{ fontSize: 10, fill: "currentColor" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        <p className="mt-2 text-right text-[10px] text-muted-foreground">Cosmetics.lk</p>
      </CardContent>
    </Card>
  );
}
