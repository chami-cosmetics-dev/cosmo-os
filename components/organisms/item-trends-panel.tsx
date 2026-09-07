"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";

import { CoverPanel } from "@/components/organisms/item-trends/cover-panel";
import { DistrictsTabContent } from "@/components/organisms/item-trends/districts-panel";
import { LocationComparePanel } from "@/components/organisms/item-trends/location-compare-panel";
import { MovementTable } from "@/components/organisms/item-trends/movement-table";
import { RopPanel } from "@/components/organisms/item-trends/rop-panel";
import { ItemTrendsSectionFilters } from "@/components/organisms/item-trends/section-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { filterRowsByBrand, type SkuGrain } from "@/lib/item-trends/sku-group";
import { yesterdaySnapshotDate } from "@/lib/item-trends/snapshot-date";
import type { ErpStockScope } from "@/lib/item-trends/erp-scope";
import type {
  CoverRow,
  DistrictDemandRow,
  ExpansionOpportunityRow,
  ItemMovementRow,
  ItemTrendFilterLocation,
  RopSuggestionRow,
} from "@/lib/item-trends/types";

type Props = {
  canManageRop: boolean;
};

function defaultFromTo() {
  const today = formatAppIsoDate(new Date());
  return { from: today, to: today };
}

const PRIORITY_OPTIONS = ["all", "Top Priority", "Newly Added", "Non Priority", "Vat"];

export function ItemTrendsPanel({ canManageRop }: Props) {
  const defaults = defaultFromTo();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [priority, setPriority] = useState("all");
  const [tab, setTab] = useState("location");
  const [loading, setLoading] = useState(false);
  const [companyWide, setCompanyWide] = useState(true);

  const [movement, setMovement] = useState<ItemMovementRow[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [filterLocations, setFilterLocations] = useState<ItemTrendFilterLocation[]>([]);
  const [erpScope, setErpScope] = useState<ErpStockScope>("both");
  const [erpScopes, setErpScopes] = useState<Array<{ value: ErpStockScope; label: string; instanceId: string | null }>>([
    { value: "both", label: "Both ERPs", instanceId: null },
  ]);
  const [grain, setGrain] = useState<SkuGrain>("common");
  const [brand, setBrand] = useState("");
  const [skuQuery, setSkuQuery] = useState("");
  const [columnKeys, setColumnKeys] = useState<string[]>([]);
  const [oosOnly, setOosOnly] = useState(false);
  const [sendOnly, setSendOnly] = useState(false);

  const [snapshotDate, setSnapshotDate] = useState(yesterdaySnapshotDate());
  const [snapshotDates, setSnapshotDates] = useState<Array<{ snapshotDate: string; capturedAt: string }>>([]);
  const [usedFallback, setUsedFallback] = useState(false);

  const [coverRows, setCoverRows] = useState<CoverRow[]>([]);
  const [coverSnapshotDate, setCoverSnapshotDate] = useState<string | null>(null);
  const [coverCapturedAt, setCoverCapturedAt] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const [itemSku, setItemSku] = useState<string | null>(null);
  const [itemCommonKey, setItemCommonKey] = useState<string | null>(null);

  const [districts, setDistricts] = useState<DistrictDemandRow[]>([]);
  const [districtItems, setDistrictItems] = useState<ItemMovementRow[]>([]);
  const [expansion, setExpansion] = useState<ExpansionOpportunityRow[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [districtsLoading, setDistrictsLoading] = useState(false);

  const [ropRows, setRopRows] = useState<RopSuggestionRow[]>([]);
  const [ropWindowLabel, setRopWindowLabel] = useState("");
  const [ropWindow, setRopWindow] = useState<"3m" | "2m" | "custom">("3m");
  const [ropLoading, setRopLoading] = useState(false);

  const mainGen = useRef(0);
  const coverGen = useRef(0);
  const ropGen = useRef(0);
  const districtsGen = useRef(0);

  const openItem = useCallback((sku: string, commonSkuKey: string | null) => {
    setItemSku(sku);
    setItemCommonKey(grain === "common" ? commonSkuKey : null);
    setTab("item");
  }, [grain]);

  const loadSnapshotDates = useCallback(async () => {
    const res = await fetch("/api/admin/purchasing/item-trends/stock-snapshot");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const dates = Array.isArray(data.dates) ? data.dates : [];
    setSnapshotDates(dates);
    const defaultDate = typeof data.defaultDate === "string" ? data.defaultDate : "";
    if (defaultDate) {
      setSnapshotDate((current) =>
        dates.some((d: { snapshotDate: string }) => d.snapshotDate === current)
          ? current
          : defaultDate,
      );
    }
  }, []);

  const loadMain = useCallback(async () => {
    const gen = ++mainGen.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, priority });
      if (brand) params.set("brand", brand);
      const res = await fetch(`/api/admin/purchasing/item-trends/page-data?${params}`);
      const data = await res.json().catch(() => ({}));
      if (gen !== mainGen.current) return;
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to load items");
        return;
      }
      setMovement(Array.isArray(data.movement) ? data.movement : []);
      setCompanyWide(data.meta?.scopedLocationId == null);
    } catch {
      if (gen !== mainGen.current) return;
      notify.error("Failed to load items");
    } finally {
      if (gen === mainGen.current) setLoading(false);
    }
  }, [from, to, priority, brand]);

  const loadCover = useCallback(async () => {
    const gen = ++coverGen.current;
    setCoverLoading(true);
    try {
      const params = new URLSearchParams({ from, to, priority });
      if (brand) params.set("brand", brand);
      if (snapshotDate) params.set("snapshotDate", snapshotDate);
      if (erpScope !== "both") params.set("erpScope", erpScope);
      const itemMode = tab === "item" && itemSku;
      if (itemMode) {
        params.set("sku", itemSku);
        if (itemCommonKey) params.set("commonSkuKey", itemCommonKey);
      } else {
        if (skuQuery.trim()) params.set("sku", skuQuery.trim());
        if (columnKeys.length) params.set("columnKeys", columnKeys.join(","));
        if (oosOnly) params.set("oosOnly", "true");
        if (sendOnly) params.set("sendOnly", "true");
      }
      const res = await fetch(`/api/admin/purchasing/item-trends/cover?${params}`);
      const data = await res.json().catch(() => ({}));
      if (gen !== coverGen.current) return;
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to load stock cover");
        setCoverRows([]);
        return;
      }
      setCoverRows(Array.isArray(data.rows) ? data.rows : []);
      setCoverSnapshotDate(typeof data.snapshotDate === "string" ? data.snapshotDate : null);
      setCoverCapturedAt(typeof data.capturedAt === "string" ? data.capturedAt : null);
      setUsedFallback(Boolean(data.usedFallback));
    } catch {
      if (gen !== coverGen.current) return;
      notify.error("Failed to load stock cover");
    } finally {
      if (gen === coverGen.current) setCoverLoading(false);
    }
  }, [from, to, priority, brand, snapshotDate, erpScope, skuQuery, columnKeys, oosOnly, sendOnly, tab, itemSku, itemCommonKey]);

  const loadRop = useCallback(async () => {
    const gen = ++ropGen.current;
    setRopLoading(true);
    try {
      const params = new URLSearchParams({ from, to, priority, ropWindow });
      if (brand) params.set("brand", brand);
      const res = await fetch(`/api/admin/purchasing/item-trends/rop?${params}`);
      const data = await res.json().catch(() => ({}));
      if (gen !== ropGen.current) return;
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to load ROP");
        setRopRows([]);
        return;
      }
      setRopRows(Array.isArray(data.rows) ? data.rows : []);
      setRopWindowLabel(typeof data.windowLabel === "string" ? data.windowLabel : "");
    } catch {
      if (gen !== ropGen.current) return;
      notify.error("Failed to load ROP");
    } finally {
      if (gen === ropGen.current) setRopLoading(false);
    }
  }, [from, to, priority, ropWindow, brand]);

  const loadDistricts = useCallback(async () => {
    const gen = ++districtsGen.current;
    setDistrictsLoading(true);
    try {
      const params = new URLSearchParams({ from, to, priority });
      if (selectedDistrict) params.set("district", selectedDistrict);
      const res = await fetch(`/api/admin/purchasing/item-trends/districts?${params}`);
      const data = await res.json().catch(() => ({}));
      if (gen !== districtsGen.current) return;
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
      if (gen !== districtsGen.current) return;
      notify.error("Failed to load districts");
    } finally {
      if (gen === districtsGen.current) setDistrictsLoading(false);
    }
  }, [from, to, priority, selectedDistrict]);

  const captureSnapshot = useCallback(async () => {
    setCapturing(true);
    try {
      const res = await fetch("/api/admin/purchasing/item-trends/stock-snapshot", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to capture snapshot");
        return;
      }
      notify.success(`Snapshot saved (${typeof data.rowCount === "number" ? data.rowCount : 0} bins)`);
      await loadSnapshotDates();
      if (typeof data.snapshotDate === "string") setSnapshotDate(data.snapshotDate);
      await loadCover();
    } catch {
      notify.error("Failed to capture snapshot");
    } finally {
      setCapturing(false);
    }
  }, [loadCover, loadSnapshotDates]);

  useEffect(() => {
    void fetch("/api/admin/purchasing/item-trends/filter-options")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.brands)) setBrands(data.brands);
        if (Array.isArray(data.locations)) setFilterLocations(data.locations);
        if (Array.isArray(data.erpScopes) && data.erpScopes.length) setErpScopes(data.erpScopes);
      })
      .catch(() => undefined);
    void loadSnapshotDates();
  }, [loadSnapshotDates]);

  useEffect(() => {
    if (tab === "item") void loadMain();
  }, [tab, loadMain]);

  useEffect(() => {
    if (tab === "location" || (tab === "item" && itemSku)) void loadCover();
  }, [tab, itemSku, loadCover]);

  useEffect(() => {
    if (tab === "rop") void loadRop();
  }, [tab, loadRop]);

  useEffect(() => {
    if (tab === "districts" && companyWide) void loadDistricts();
  }, [tab, companyWide, loadDistricts]);

  const districtItemsView = useMemo(
    () => filterRowsByBrand(districtItems, brand),
    [districtItems, brand],
  );

  const scopedLocations = useMemo(() => {
    if (erpScope === "both") return filterLocations;
    const instanceId = erpScopes.find((s) => s.value === erpScope)?.instanceId;
    if (!instanceId) return [];
    return filterLocations.filter((loc) => loc.erpnextInstanceId === instanceId);
  }, [erpScope, erpScopes, filterLocations]);

  function onErpScopeChange(value: ErpStockScope) {
    setErpScope(value);
    setColumnKeys([]);
  }

  const itemLabel =
    coverRows[0]?.commonSkuTitle ?? coverRows[0]?.title ?? itemSku ?? "";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <TrendingUp className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Item Trends</h1>
          <p className="text-sm text-muted-foreground">
            Location, item, districts. Stock is an overnight snapshot (pick a date; default yesterday).
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Priority</label>
            <select
              className="flex h-9 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Stock night</label>
            <select
              className="flex h-9 min-w-[150px] rounded-md border border-input bg-background px-3 text-sm"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
            >
              {snapshotDates.length === 0 ? (
                <option value={snapshotDate}>{snapshotDate || "No snapshots"}</option>
              ) : (
                snapshotDates.map((d) => (
                  <option key={d.snapshotDate} value={d.snapshotDate}>
                    {d.snapshotDate}
                  </option>
                ))
              )}
            </select>
          </div>
          <Button
            type="button"
            onClick={() => {
              if (tab === "location" || (tab === "item" && itemSku)) void loadCover();
              if (tab === "item") void loadMain();
              if (tab === "rop") void loadRop();
              if (tab === "districts") void loadDistricts();
            }}
            disabled={loading || coverLoading}
          >
            {loading || coverLoading ? (
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

      {usedFallback && coverSnapshotDate && coverSnapshotDate !== snapshotDate ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          No snapshot for {snapshotDate}. Showing {coverSnapshotDate}.
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="item">Item</TabsTrigger>
          {companyWide ? <TabsTrigger value="districts">Districts</TabsTrigger> : null}
          <TabsTrigger value="rop">ROP</TabsTrigger>
        </TabsList>

        <TabsContent value="location" className="mt-4 space-y-4">
          <ItemTrendsSectionFilters
            brands={brands}
            brand={brand}
            onBrandChange={setBrand}
            grain={grain}
            onGrainChange={setGrain}
            locations={scopedLocations}
            selectedColumnKeys={columnKeys}
            onColumnKeysChange={setColumnKeys}
            erpScope={erpScope}
            erpScopes={erpScopes}
            onErpScopeChange={onErpScopeChange}
            oosOnly={oosOnly}
            onOosOnlyChange={setOosOnly}
            sendOnly={sendOnly}
            onSendOnlyChange={setSendOnly}
            sku={skuQuery}
            onSkuChange={setSkuQuery}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sale vs stock</CardTitle>
              <CardDescription>
                Shop send = stock below 50% of next-week need. OOS = sold in range and snapshot 0.
                One name per warehouse. Item opens warehouses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CoverPanel
                rows={coverRows}
                grain={grain}
                snapshotDate={coverSnapshotDate}
                capturedAt={coverCapturedAt}
                loading={coverLoading}
                canCapture={canManageRop}
                capturing={capturing}
                onCapture={() => void captureSnapshot()}
                onOpenItem={openItem}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="item" className="mt-4 space-y-4">
          <ItemTrendsSectionFilters
            brands={brands}
            brand={brand}
            onBrandChange={setBrand}
            grain={grain}
            onGrainChange={setGrain}
            erpScope={erpScope}
            erpScopes={erpScopes}
            onErpScopeChange={onErpScopeChange}
            sku={skuQuery}
            onSkuChange={setSkuQuery}
          />
          {itemSku ? (
            coverLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading warehouses…
              </div>
            ) : (
              <LocationComparePanel
                key={`${itemSku}:${itemCommonKey ?? ""}:${coverSnapshotDate ?? ""}`}
                itemLabel={itemLabel || itemSku}
                rows={coverRows}
                onClose={() => {
                  setItemSku(null);
                  setItemCommonKey(null);
                }}
              />
            )
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pick an item</CardTitle>
                <CardDescription>
                  Search common SKU (ORD04) or a variant (ORD04_1). Then see stock vs sale by warehouse.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading items…
                  </div>
                ) : (
                  <MovementTable
                    rows={
                      skuQuery.trim()
                        ? movement.filter(
                            (row) =>
                              row.sku.toLowerCase().includes(skuQuery.trim().toLowerCase()) ||
                              (row.commonSkuKey ?? "").toLowerCase().includes(skuQuery.trim().toLowerCase()),
                          )
                        : movement
                    }
                    grain={grain}
                    onCompareLocations={openItem}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {companyWide ? (
          <TabsContent value="districts" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">District demand</CardTitle>
                <CardDescription>
                  Order district if marked; else shipping address. Unmapped if neither.
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
                    items={districtItemsView}
                    expansion={expansion}
                    selectedDistrict={selectedDistrict}
                    onSelectDistrict={setSelectedDistrict}
                    loading={districtsLoading}
                    grain={grain}
                    onCompareLocations={openItem}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="rop" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ROP suggestions (peak month × 2)</CardTitle>
              <CardDescription>Total ROP = sum of saved OSF columns. Export CSV.</CardDescription>
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
                  onWindowChange={setRopWindow}
                  canManageRop={canManageRop}
                  onRefresh={() => void loadRop()}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
