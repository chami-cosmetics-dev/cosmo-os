"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Gauge, Loader2, RefreshCw, X } from "lucide-react";

import { priorityLabelClass } from "@/components/organisms/item-trends/priority-label";
import { ShopStockStatusDashboard } from "@/components/organisms/shop-stock-status-dashboard";
import {
  downloadFile,
  formatNumber,
  formatPercent,
  HEAD_CLASS,
  SELECT_CLASS,
  TABLE_CLASS,
  TABLE_CONTAINER_CLASS,
} from "@/components/organisms/sales-budget-table-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import {
  SHOP_STOCK_BAND_LABELS,
  SHOP_STOCK_TAB_COLUMNS,
  SHOP_STOCK_TAB_LABELS,
  SHOP_STOCK_TABS,
  shopStockBandOf,
  type ShopStockBand,
  type ShopStockCell,
  type ShopStockColumn,
  type ShopStockRow,
  type ShopStockStatus,
  type ShopStockTab,
} from "@/lib/shop-stock-status/config";
import {
  STOCK_HEALTH_STATUSES,
  type StockHealthStatus,
} from "@/lib/stock-health/config";
import { cn } from "@/lib/utils";

const BAND_CLASS: Record<ShopStockBand, string> = {
  fail: "bg-rose-500/20 font-medium text-rose-700 dark:text-rose-300",
  pass: "bg-yellow-400/25 font-medium text-yellow-800 dark:text-yellow-200",
  full: "bg-emerald-500/20 font-medium text-emerald-700 dark:text-emerald-300",
};
const BANDS: ShopStockBand[] = ["fail", "pass", "full"];
const FILTER_SELECT_CLASS = cn(SELECT_CLASS, "min-w-[150px]");

/** What one tab shows: its filtered rows and the filters, for "Export filtered". */
type ShopStockView = { rows: ShopStockRow[]; filters: string };

/** The page's views: Dashboard (first, default), then the SHOPS and ONLINE tables. */
type PanelTab = "dashboard" | ShopStockTab;

/** A Dashboard card click: set that table's Location filter (nonce = a new click each time). */
type LocationRequest = { key: string; nonce: number };

function bandOf(cell: ShopStockCell | undefined): ShopStockBand | null {
  return cell?.percent == null ? null : shopStockBandOf(cell.percent);
}

function PercentCell({ cell }: { cell: ShopStockCell }) {
  const band = bandOf(cell);
  if (band === null) {
    return (
      <TableCell className="text-center text-muted-foreground">-</TableCell>
    );
  }
  return (
    <TableCell
      className={cn("text-right tabular-nums", BAND_CLASS[band])}
      title={`Stock ${formatNumber(cell.stock)} / ROP ${formatNumber(cell.rop)}`}
    >
      {formatPercent(cell.percent)}
    </TableCell>
  );
}

/**
 * One tab's table + filters. Location alone keeps SKUs with a ROP there; Colour alone keeps
 * SKUs with that colour in any column; both together = that colour in that location.
 */
function ShopStockTable({
  tab,
  rows,
  columns,
  loading,
  onViewChange,
  locationRequest,
}: {
  tab: ShopStockTab;
  rows: ShopStockRow[] | null;
  columns: ShopStockColumn[];
  loading: boolean;
  /** Reports the rows shown + filters (must be a stable callback). */
  onViewChange: (tab: ShopStockTab, view: ShopStockView) => void;
  /** From a Dashboard card: show just that location (other filters cleared). */
  locationRequest?: LocationRequest | null;
}) {
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<StockHealthStatus | "all">("all");
  const [location, setLocation] = useState<string>("all");
  const [colour, setColour] = useState<ShopStockBand | "all">("all");
  const filtered =
    search.trim() !== "" ||
    priority !== "all" ||
    location !== "all" ||
    colour !== "all";

  const priorities = useMemo(
    () =>
      STOCK_HEALTH_STATUSES.filter(
        (status) =>
          status !== "Blank" ||
          (rows ?? []).some((row) => row.priority === "Blank"),
      ),
    [rows],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inScope = location === "all" ? columns.map((c) => c.key) : [location];
    return (rows ?? []).filter((row) => {
      if (
        q &&
        !row.commonSku.toLowerCase().includes(q) &&
        !(row.itemName ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (priority !== "all" && row.priority !== priority) return false;
      if (colour !== "all")
        return inScope.some((key) => bandOf(row.cells[key]) === colour);
      if (location !== "all") return bandOf(row.cells[location]) !== null;
      return true;
    });
  }, [rows, columns, search, priority, location, colour]);

  const filterText = useMemo(() => {
    const parts: string[] = [];
    if (search.trim()) parts.push(`SKU / item contains "${search.trim()}"`);
    if (priority !== "all") parts.push(`Priority = ${priority}`);
    if (location !== "all") {
      parts.push(
        `Location = ${columns.find((c) => c.key === location)?.label ?? location}`,
      );
    }
    if (colour !== "all")
      parts.push(`Colour = ${SHOP_STOCK_BAND_LABELS[colour]}`);
    return parts.join(" · ");
  }, [search, priority, location, colour, columns]);

  useEffect(() => {
    onViewChange(tab, { rows: shown, filters: filterText });
  }, [onViewChange, tab, shown, filterText]);

  // A new Dashboard card click (new request object): show just that location.
  const [seenRequest, setSeenRequest] = useState(locationRequest);
  if (locationRequest !== seenRequest) {
    setSeenRequest(locationRequest);
    if (locationRequest) {
      setSearch("");
      setPriority("all");
      setColour("all");
      setLocation(locationRequest.key);
    }
  }

  const clear = () => {
    setSearch("");
    setPriority("all");
    setLocation("all");
    setColour("all");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          SKU / item
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-9 w-48 font-normal text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Priority
          <select
            className={cn(FILTER_SELECT_CLASS, "font-normal text-foreground")}
            value={priority}
            onChange={(e) =>
              setPriority(e.target.value as StockHealthStatus | "all")
            }
          >
            <option value="all">All</option>
            {priorities.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Location
          <select
            className={cn(FILTER_SELECT_CLASS, "font-normal text-foreground")}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="all">All</option>
            {columns.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Colour
          <select
            className={cn(FILTER_SELECT_CLASS, "font-normal text-foreground")}
            value={colour}
            onChange={(e) => setColour(e.target.value as ShopStockBand | "all")}
          >
            <option value="all">All</option>
            {BANDS.map((band) => (
              <option key={band} value={band}>
                {SHOP_STOCK_BAND_LABELS[band]}
              </option>
            ))}
          </select>
        </label>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        ) : null}
        <p className="ml-auto text-xs text-muted-foreground">
          {rows
            ? `${formatNumber(shown.length)} of ${formatNumber(rows.length)} Common SKUs`
            : ""}
        </p>
      </div>

      <Table
        containerClassName={cn(
          TABLE_CONTAINER_CLASS,
          loading && rows && "opacity-60",
        )}
        className={TABLE_CLASS}
      >
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(HEAD_CLASS, "min-w-[220px] text-left")}>
              Item / Priority
            </TableHead>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(HEAD_CLASS, "w-[84px]")}
              >
                {column.label}
              </TableHead>
            ))}
            <TableHead className={cn(HEAD_CLASS, "w-[120px]")}>
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + 2}
                className="h-32 text-center"
              >
                {loading ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {rows ? "No matches." : "No data."}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ) : (
            shown.map((row) => (
              <TableRow key={row.commonSku}>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{row.commonSku}</span>
                    <span
                      className={cn(
                        "inline-flex select-none items-center rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset",
                        priorityLabelClass(row.priority),
                      )}
                    >
                      {row.priority}
                    </span>
                  </div>
                  {row.itemName ? (
                    <div className="text-xs text-muted-foreground">
                      {row.itemName}
                    </div>
                  ) : null}
                </TableCell>
                {columns.map((column) => (
                  <PercentCell key={column.key} cell={row.cells[column.key]} />
                ))}
                <TableCell className="whitespace-nowrap text-xs tabular-nums">
                  <span className="text-rose-700 dark:text-rose-300">
                    Fail: {row.fail}
                  </span>
                  {" | "}
                  <span className="text-emerald-700 dark:text-emerald-300">
                    Pass: {row.pass}
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Per Common SKU: stock / ROP per shop and Online (Shops tab), and Online per company
 * (Online tab). Same live ERP data, Excluded SKUs and OSF ROP as Stock Health → ROP Status.
 */
export function ShopStockStatusPanel() {
  const [data, setData] = useState<ShopStockStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PanelTab>("dashboard");
  const [locationRequests, setLocationRequests] = useState<
    Partial<Record<ShopStockTab, LocationRequest>>
  >({});
  const openLocation = useCallback((t: ShopStockTab, key: string) => {
    setLocationRequests((prev) => ({
      ...prev,
      [t]: { key, nonce: (prev[t]?.nonce ?? 0) + 1 },
    }));
    setTab(t);
  }, []);
  const [exporting, setExporting] = useState(false);
  const [exportingFiltered, setExportingFiltered] = useState(false);
  const [views, setViews] = useState<
    Partial<Record<ShopStockTab, ShopStockView>>
  >({});
  const reportView = useCallback((t: ShopStockTab, view: ShopStockView) => {
    setViews((prev) => ({ ...prev, [t]: view }));
  }, []);
  const activeView = tab === "dashboard" ? undefined : views[tab];

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/store/shop-stock-status${refresh ? "?refresh=1" : ""}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(body.error || "Failed to load Shop Stock Status");
      setData(body as ShopStockStatus);
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : "Failed to load Shop Stock Status",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const exportSheets = async () => {
    setExporting(true);
    try {
      await downloadFile(
        "/api/admin/store/shop-stock-status/export",
        "shop-stock-status.xlsx",
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  /** This tab only, the rows on screen (filters applied) — the main export is unchanged. */
  const exportFiltered = async () => {
    if (!data || !activeView) return;
    setExportingFiltered(true);
    try {
      await downloadFile(
        "/api/admin/store/shop-stock-status/export/filtered",
        "shop-stock-status-filtered.xlsx",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tab,
            rows: activeView.rows,
            filters: activeView.filters,
            fetchedAt: data.fetchedAt,
          }),
        },
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExportingFiltered(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Gauge className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Shop Stock Status
          </h1>
          <p className="text-sm text-muted-foreground">
            Stock as % of ROP per shop and Online, for every Common SKU.
          </p>
        </div>
        {/* Outside the tabs: one file with both sheets (SHOP + ONLINE), all Common SKUs. */}
        <Button
          variant="outline"
          className="ml-auto"
          onClick={() => void exportSheets()}
          disabled={exporting || loading}
        >
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {exporting ? "Preparing…" : "Export (SHOP + ONLINE)"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as PanelTab)}>
        <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
          <TabsTrigger value="dashboard">DASHBOARD</TabsTrigger>
          {SHOP_STOCK_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {SHOP_STOCK_TAB_LABELS[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        <Card className="mt-4">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">
                {tab === "dashboard"
                  ? "Dashboard"
                  : tab === "shops"
                    ? "Shops + Online"
                    : "Online by company"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {!data
                  ? "Common SKUs by stock against ROP."
                  : tab === "dashboard"
                    ? `Live ERP stock (website drafts with no stock left out) as of ${formatAppIsoDateTime(data.fetchedAt)}. Per location: Total ROP and Total Stock of the Common SKUs with a ROP there; Fulfilment = Total Stock ÷ Total ROP. Click a card to open its table.`
                    : `Live ERP stock (website drafts with no stock left out) as of ${formatAppIsoDateTime(data.fetchedAt)}. Hover a % for its stock and ROP; - = no ROP (not counted).`}
              </p>
              {/* Colour rules for the % cells (stock ÷ ROP × 100); the Dashboard has its own legend. */}
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 pt-1 text-xs",
                  tab === "dashboard" && "hidden",
                )}
              >
                <span className="text-muted-foreground">
                  Colours (stock as % of ROP):
                </span>
                {BANDS.map((band) => (
                  <span
                    key={band}
                    className={cn("rounded px-2 py-0.5", BAND_CLASS[band])}
                  >
                    {SHOP_STOCK_BAND_LABELS[band]}
                  </span>
                ))}
                <span className="text-muted-foreground">
                  Status: Fail = red cells, Pass = yellow + green cells.
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {tab !== "dashboard" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void exportFiltered()}
                  disabled={
                    exportingFiltered ||
                    loading ||
                    !activeView ||
                    activeView.rows.length === 0
                  }
                  title={
                    activeView?.filters
                      ? `This tab, filtered: ${activeView.filters}`
                      : "This tab, all Common SKUs (no filters applied)"
                  }
                >
                  {exportingFiltered ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {exportingFiltered
                    ? "Preparing…"
                    : `Export filtered (${formatNumber(activeView?.rows.length ?? 0)})`}
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load(true)}
                disabled={loading}
              >
                <RefreshCw
                  className={cn("mr-2 h-4 w-4", loading && "animate-spin")}
                />
                {loading ? "Loading ERP stock…" : "Refresh"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="dashboard" className="mt-0">
              <ShopStockStatusDashboard
                data={data}
                loading={loading}
                onOpenLocation={openLocation}
              />
            </TabsContent>
            {/* forceMount keeps each tab's filters when switching; hidden while inactive. */}
            {SHOP_STOCK_TABS.map((t) => (
              <TabsContent
                key={t}
                value={t}
                forceMount
                className="mt-0 data-[state=inactive]:hidden"
              >
                <ShopStockTable
                  tab={t}
                  rows={data?.tabs[t] ?? null}
                  columns={SHOP_STOCK_TAB_COLUMNS[t]}
                  loading={loading}
                  onViewChange={reportView}
                  locationRequest={locationRequests[t] ?? null}
                />
              </TabsContent>
            ))}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
