"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type RiderPerformanceRow = {
  riderId: string;
  name: string | null;
  knownName: string | null;
  completedCount: number;
  incentiveTotal: string;
};

function todayInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function RiderPerformancePanel() {
  const [from, setFrom] = useState(todayInputValue);
  const [to, setTo] = useState(todayInputValue);
  const [rows, setRows] = useState<RiderPerformanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Send calendar days (YYYY-MM-DD); API interprets them as Asia/Colombo bounds.
      const res = await fetch(
        `/api/admin/riders/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to load performance");
        setRows([]);
        return;
      }
      setRows(Array.isArray(data.riders) ? data.riders : []);
    } catch {
      notify.error("Failed to load performance");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Rider performance</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Completed deliveries and incentive (order shipping cost) for the selected dates.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/20 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Rider</th>
                <th className="px-3 py-2 font-medium">Completed</th>
                <th className="px-3 py-2 font-medium">Incentive</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted-foreground px-3 py-6 text-center">
                    {loading ? "Loading…" : "No completed deliveries in this range."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.riderId} className="border-t">
                    <td className="px-3 py-2">
                      {row.knownName || row.name || row.riderId}
                    </td>
                    <td className="px-3 py-2">{row.completedCount}</td>
                    <td className="px-3 py-2">{row.incentiveTotal}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
