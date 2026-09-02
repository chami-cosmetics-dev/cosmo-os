"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";

import { DistrictsTabContent } from "@/components/organisms/item-trends/districts-panel";
import { FocusListPanel, useFocusList } from "@/components/organisms/item-trends/focus-list";
import { PatternsPanel } from "@/components/organisms/item-trends/patterns-panel";
import { ItemTrendsKpiCharts } from "@/components/organisms/item-trends/kpi-charts";
import { MovementTable } from "@/components/organisms/item-trends/movement-table";
import { NewItemsPanel } from "@/components/organisms/item-trends/new-items-panel";
import { OutletsPanel } from "@/components/organisms/item-trends/outlets-panel";
import { RopPanel } from "@/components/organisms/item-trends/rop-panel";
import { SlowdownPanel } from "@/components/organisms/item-trends/slowdown-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import type {
  DistrictDemandRow,
  ExpansionOpportunityRow,
  ItemMovementRow,
  ItemTrendKpiSummary,
  OutletBalanceRow,
  RopSuggestionRow,
  TransferCandidate,
  PatternAnnotation,
} from "@/lib/item-trends/types";

type Props = {
  canManageRop: boolean;
};

function defaultFromTo() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return {
    from: formatAppIsoDate(from),
    to: formatAppIsoDate(to),
  };
}

const PRIORITY_OPTIONS = ["Top Priority", "Newly Added", "Non Priority", "all"];

export function ItemTrendsPanel({ canManageRop }: Props) {
  const defaults = defaultFromTo();
  const { isPinned, togglePin, pinned, unpin, exportCsv } = useFocusList();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [priority, setPriority] = useState("Top Priority");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("movement");

  const [kpis, setKpis] = useState<ItemTrendKpiSummary | null>(null);
  const [movement, setMovement] = useState<ItemMovementRow[]>([]);
  const [newItems, setNewItems] = useState<ItemMovementRow[]>([]);
  const [slowdowns, setSlowdowns] = useState<ItemMovementRow[]>([]);
  const [patterns, setPatterns] = useState<PatternAnnotation[]>([]);
  const [patternsAvailable, setPatternsAvailable] = useState(false);
  const [intelligentEngine, setIntelligentEngine] = useState<
    "disabled" | "active" | "degraded"
  >("disabled");
  const [companyWide, setCompanyWide] = useState(true);

  const [districts, setDistricts] = useState<DistrictDemandRow[]>([]);
  const [districtItems, setDistrictItems] = useState<ItemMovementRow[]>([]);
  const [expansion, setExpansion] = useState<ExpansionOpportunityRow[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [districtsLoading, setDistrictsLoading] = useState(false);

  const [outlets, setOutlets] = useState<OutletBalanceRow[]>([]);
  const [transfers, setTransfers] = useState<TransferCandidate[]>([]);
  const [outletsLoading, setOutletsLoading] = useState(false);

  const [ropRows, setRopRows] = useState<RopSuggestionRow[]>([]);
  const [ropWindowLabel, setRopWindowLabel] = useState("");
  const [ropWindow, setRopWindow] = useState<"3m" | "2m" | "custom">("3m");
  const [ropLoading, setRopLoading] = useState(false);

  const loadMain = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, priority, limit: "100" });
      const res = await fetch(`/api/admin/purchasing/item-trends/page-data?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to load trends");
        setKpis(null);
        setMovement([]);
        setNewItems([]);
        setSlowdowns([]);
        return;
      }
      setKpis(data.kpis ?? null);
      setMovement(Array.isArray(data.movement) ? data.movement : []);
      setNewItems(Array.isArray(data.newItems) ? data.newItems : []);
      setSlowdowns(Array.isArray(data.slowdowns) ? data.slowdowns : []);
      setPatterns(Array.isArray(data.patterns) ? data.patterns : []);
      setPatternsAvailable(Boolean(data.meta?.patternsAvailable));
      setIntelligentEngine(data.meta?.intelligentEngine ?? "disabled");
      setCompanyWide(!data.meta?.scopedLocationId);
    } catch {
      notify.error("Failed to load trends");
    } finally {
      setLoading(false);
    }
  }, [from, to, priority]);

  const loadOutlets = useCallback(async () => {
    setOutletsLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/admin/purchasing/item-trends/outlets?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to load outlets");
        setOutlets([]);
        setTransfers([]);
        return;
      }
      setOutlets(Array.isArray(data.outlets) ? data.outlets : []);
      setTransfers(Array.isArray(data.transfers) ? data.transfers : []);
    } catch {
      notify.error("Failed to load outlets");
    } finally {
      setOutletsLoading(false);
    }
  }, [from, to]);

  const loadRop = useCallback(async () => {
    setRopLoading(true);
    try {
      const params = new URLSearchParams({
        from,
        to,
        ropWindow,
        limit: "50",
      });
      const res = await fetch(`/api/admin/purchasing/item-trends/rop?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to load ROP");
        setRopRows([]);
        return;
      }
      setRopRows(Array.isArray(data.rows) ? data.rows : []);
      setRopWindowLabel(typeof data.windowLabel === "string" ? data.windowLabel : "");
    } catch {
      notify.error("Failed to load ROP");
    } finally {
      setRopLoading(false);
    }
  }, [from, to, ropWindow]);

  const loadDistricts = useCallback(async () => {
    setDistrictsLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (selectedDistrict) params.set("district", selectedDistrict);
      const res = await fetch(`/api/admin/purchasing/item-trends/districts?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status !== 403) {
          notify.error(typeof data.error === "string" ? data.error : "Failed to load districts");
        }
        setDistricts([]);
        setDistrictItems([]);
        setExpansion([]);
        return;
      }
      setDistricts(Array.isArray(data.districts) ? data.districts : []);
      setDistrictItems(Array.isArray(data.items) ? data.items : []);
      setExpansion(Array.isArray(data.expansion) ? data.expansion : []);
    } catch {
      notify.error("Failed to load districts");
    } finally {
      setDistrictsLoading(false);
    }
  }, [from, to, selectedDistrict]);

  useEffect(() => {
    void loadMain();
  }, [loadMain]);

  useEffect(() => {
    if (tab === "outlets") void loadOutlets();
  }, [tab, loadOutlets]);

  useEffect(() => {
    if (tab === "rop") void loadRop();
  }, [tab, loadRop]);

  useEffect(() => {
    if (tab === "districts" && companyWide) void loadDistricts();
  }, [tab, companyWide, loadDistricts]);

  const priorityChartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of movement) {
      counts.set(row.priority, (counts.get(row.priority) ?? 0) + 1);
    }
    return [...counts.entries()].map(([priority, count]) => ({ priority, count }));
  }, [movement]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <TrendingUp className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Item Trends</h1>
          <p className="text-sm text-muted-foreground">
            Movement, outlet balance, and ROP suggestions for purchasing and stores
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Asia/Colombo calendar days — default last 7 vs prior 7</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Priority</label>
            <select
              className="flex h-9 w-[160px] rounded-md border border-input bg-background px-3 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={() => void loadMain()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Loading
              </>
            ) : (
              "Refresh"
            )}
          </Button>
        </CardContent>
      </Card>

      {intelligentEngine === "degraded" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
          Intelligent trend engine unavailable — showing rule-based signals only.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fast movers</CardDescription>
            <CardTitle className="text-2xl">{kpis?.fastMoverCount ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>New item signals</CardDescription>
            <CardTitle className="text-2xl">{kpis?.newItemSignalCount ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Slowdown alerts</CardDescription>
            <CardTitle className="text-2xl">{kpis?.slowdownCount ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total units</CardDescription>
            <CardTitle className="text-2xl">{kpis?.totalUnitsTracked ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Top district</CardDescription>
            <CardTitle className="text-lg">{kpis?.topDistrict ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Priority breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemTrendsKpiCharts data={priorityChartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Focus list</CardTitle>
          <CardDescription>Pin SKUs for weekly review and CSV export</CardDescription>
        </CardHeader>
        <CardContent>
          <FocusListPanel
            pinned={pinned}
            compareRows={movement}
            compareLabel="Current units"
            onUnpin={unpin}
            onExport={exportCsv}
          />
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="movement">Movement</TabsTrigger>
          <TabsTrigger value="outlets">Outlets</TabsTrigger>
          <TabsTrigger value="rop">ROP</TabsTrigger>
          {companyWide ? (
            <TabsTrigger value="districts">Districts</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="movement" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fast movers</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading movement…
                </div>
              ) : (
                <MovementTable
                  rows={movement}
                  pinContext="movement"
                  isPinned={isPinned}
                  onTogglePin={togglePin}
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Newly Added</CardTitle>
              </CardHeader>
              <CardContent>
                <NewItemsPanel rows={newItems} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Priority slowdowns</CardTitle>
                <CardDescription>Red = severe drop; amber = ≥25% decline</CardDescription>
              </CardHeader>
              <CardContent>
                <SlowdownPanel rows={slowdowns} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekday patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <PatternsPanel patterns={patterns} available={patternsAvailable} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outlets" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outlet balance & transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {outletsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading outlets…
                </div>
              ) : (
                <OutletsPanel outlets={outlets} transfers={transfers} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rop" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ROP suggestions (window sales × 2)</CardTitle>
              <CardDescription>
                Review and apply via OSF — never saves without explicit Apply
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ropLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading ROP…
                </div>
              ) : (
                <RopPanel
                  rows={ropRows}
                  windowLabel={ropWindowLabel}
                  ropWindow={ropWindow}
                  onWindowChange={(w) => {
                    setRopWindow(w);
                  }}
                  canManageRop={canManageRop}
                  onRefresh={() => void loadRop()}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {companyWide ? (
          <TabsContent value="districts" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">District demand & expansion</CardTitle>
                <CardDescription>
                  Shipping-address geography — 25 Sri Lanka districts + Unmapped
                </CardDescription>
              </CardHeader>
              <CardContent>
                {districtsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading districts…
                  </div>
                ) : (
                  <DistrictsTabContent
                    districts={districts}
                    items={districtItems}
                    expansion={expansion}
                    selectedDistrict={selectedDistrict}
                    onSelectDistrict={setSelectedDistrict}
                    loading={districtsLoading}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
