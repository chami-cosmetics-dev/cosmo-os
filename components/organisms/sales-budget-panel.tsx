"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Target,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListPager } from "@/components/organisms/item-trends/list-pager";
import { priorityLabelClass } from "@/components/organisms/item-trends/priority-label";
import { useBudgetQtyEdits } from "@/components/organisms/sales-budget-qty-edits";
import { SavedBudgetsPanel } from "@/components/organisms/sales-budget-saved-panel";
import {
  COLUMN_COUNT,
  formatNumber,
  formatPercent,
  formatPrice,
  HEAD_CLASS,
  NUM_HEAD_CLASS,
  SELECT_CLASS,
  TABLE_CLASS,
  TABLE_CONTAINER_CLASS,
  TargetChip,
  withSelected,
} from "@/components/organisms/sales-budget-table-ui";
import { formatAppIsoDateTime } from "@/lib/format-datetime";
import {
  formatBudgetMonth,
  formatSavedAt,
} from "@/lib/sales-budget/budget-month";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  SALES_BUDGET_ALL_ENTITIES,
  SALES_BUDGET_ALL_OPTION,
  SALES_BUDGET_ENTITY_CONFIG,
  SALES_BUDGET_NO_PRIORITY,
  SALES_BUDGET_PAGE_SIZE,
  SALES_BUDGET_SHOP_CHANNEL_LABELS,
  SALES_BUDGET_SHOP_CHANNELS,
  SALES_BUDGET_TAB_LABELS,
  SALES_BUDGET_TABS,
  SALES_BUDGET_VAT_FILTERS,
  SALES_BUDGET_VAT_LABELS,
  type SalesBudgetExportMessage,
  type SalesBudgetPageData,
  type SalesBudgetShopChannel,
  type SalesBudgetTab,
  type SalesBudgetVatFilter,
} from "@/lib/sales-budget/config";

type TabFilters = {
  /** SHOP tab sub-tab only; ignored on ONLINE. */
  channel: SalesBudgetShopChannel;
  vat: SalesBudgetVatFilter;
  entity: string;
  brand: string;
  priority: string;
  /** Search box text (applied after a short debounce). */
  query: string;
  page: number;
};

const INITIAL_FILTERS: TabFilters = {
  channel: "all",
  vat: "all",
  entity: SALES_BUDGET_ALL_ENTITIES,
  brand: SALES_BUDGET_ALL_OPTION,
  priority: SALES_BUDGET_ALL_OPTION,
  query: "",
  page: 1,
};

const EXPORT_TOAST_ID = "sales-budget-export";

/** Export progress bar (same look as the Dump downloads); pulses until the first percent. */
function ExportProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label="Sales Budget export"
    >
      {percent > 0 ? (
        <div
          className="h-full rounded-full bg-sky-500 transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      ) : (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500" />
      )}
    </div>
  );
}

/** Bottom-of-screen card while the export builds, like the Dump downloads. */
function ExportProgressCard({ percent }: { percent: number }) {
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-sky-500" aria-hidden />
          <p className="font-medium text-foreground">Preparing Sales Budget export</p>
          <span className="ml-auto text-sm font-semibold tabular-nums text-sky-600">
            {percent > 0 ? `${percent}%` : "…"}
          </span>
        </div>
        <div className="mt-3">
          <ExportProgressBar percent={percent} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Third tab: the saved monthly budgets (read-only). */
const SAVED_TAB = "saved";

/**
 * Editable Budgeted Qty cell: whole numbers ≥ 0. Changes apply as you type; an emptied box
 * snaps back on blur. Shows a revert button while the value is unsaved.
 */
function BudgetQtyInput({
  value,
  dirty,
  savedEdit,
  onChange,
  onRevert,
}: {
  value: number | null;
  dirty: boolean;
  /** A saved value that differs from the calculated one. */
  savedEdit: boolean;
  onChange: (qty: number) => void;
  onRevert: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="flex items-center justify-end gap-1">
      {dirty ? (
        <button
          type="button"
          onClick={onRevert}
          title="Revert to the saved value"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : savedEdit ? (
        <span
          title="Saved value (edited)"
          className="h-1.5 w-1.5 rounded-full bg-primary"
        />
      ) : null}
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        aria-label="Budgeted Qty"
        value={text ?? (value == null ? "" : String(value))}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const qty = Number(raw);
          if (raw !== "" && Number.isInteger(qty) && qty >= 0) onChange(qty);
        }}
        onBlur={() => setText(null)}
        className={cn(
          "h-7 w-16 rounded border bg-background px-1.5 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring",
          dirty ? "border-amber-500" : "border-input",
        )}
      />
    </div>
  );
}

export function SalesBudgetPanel() {
  const [tab, setTab] = useState<SalesBudgetTab>("online");
  const [showSaved, setShowSaved] = useState(false);
  const [filtersByTab, setFiltersByTab] = useState<
    Record<SalesBudgetTab, TabFilters>
  >({
    online: INITIAL_FILTERS,
    shop: INITIAL_FILTERS,
  });
  const [appliedQueryByTab, setAppliedQueryByTab] = useState<
    Record<SalesBudgetTab, string>
  >({
    online: "",
    shop: "",
  });
  const [data, setData] = useState<SalesBudgetPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  /** Refresh button: the next fetch regenerates the ERP stock report + tax status. */
  const refreshNext = useRef(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /** Export progress (0–100) while it builds; null when idle. */
  const [exportPercent, setExportPercent] = useState<number | null>(null);
  const exporting = exportPercent !== null;
  /** Bumped after a save: reloads the view (saved values) without rebuilding ERP data. */
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const filters = filtersByTab[tab];
  const appliedQuery = appliedQueryByTab[tab];
  const entityConfig = SALES_BUDGET_ENTITY_CONFIG[tab];

  // Budgeted Qty edits: only for a specific merchant / shop (not the "All" views).
  const qtyEdits = useBudgetQtyEdits({
    tab,
    shopChannel: tab === "shop" ? filters.channel : null,
    entity:
      filters.entity === SALES_BUDGET_ALL_ENTITIES ? null : filters.entity,
    vat: filters.vat,
    data,
    onSaved: reload,
  });
  const savedStatus = qtyEdits.budgetFile?.lastUpdatedAt
    ? `Last saved ${formatSavedAt(qtyEdits.budgetFile.lastUpdatedAt)}`
    : "Not saved yet";

  const updateFilters = (patch: Partial<TabFilters>) => {
    setFiltersByTab((prev) => ({ ...prev, [tab]: { ...prev[tab], ...patch } }));
  };

  // Debounce search per tab.
  useEffect(() => {
    const next = filters.query.trim();
    if (next === appliedQuery) return;
    const timer = setTimeout(() => {
      setAppliedQueryByTab((prev) => ({ ...prev, [tab]: next }));
      setFiltersByTab((prev) => ({
        ...prev,
        [tab]: { ...prev[tab], page: 1 },
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [tab, filters.query, appliedQuery]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);

    const params = new URLSearchParams();
    params.set("tab", tab);
    if (tab === "shop") params.set("channel", filters.channel);
    params.set("vat", filters.vat);
    params.set("entity", filters.entity);
    params.set("brand", filters.brand);
    params.set("priority", filters.priority);
    params.set("page", String(filters.page));
    params.set("limit", String(SALES_BUDGET_PAGE_SIZE));
    if (appliedQuery) params.set("q", appliedQuery);
    if (refreshNext.current) {
      params.set("refresh", "1");
      refreshNext.current = false;
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/purchasing/sales-budget/page-data?${params}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load sales budget");
        }
        const next: SalesBudgetPageData = await res.json();
        if (id === requestId.current) setData(next);
      } catch (err) {
        if (id === requestId.current) {
          notify.error(
            err instanceof Error ? err.message : "Error loading data",
          );
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
  }, [
    tab,
    filters.channel,
    filters.vat,
    filters.entity,
    filters.brand,
    filters.priority,
    filters.page,
    appliedQuery,
    refreshTick,
    reloadTick,
  ]);

  const hasActiveFilters =
    filters.channel !== INITIAL_FILTERS.channel ||
    filters.vat !== INITIAL_FILTERS.vat ||
    filters.entity !== INITIAL_FILTERS.entity ||
    filters.brand !== INITIAL_FILTERS.brand ||
    filters.priority !== INITIAL_FILTERS.priority ||
    filters.query !== "";

  /** Resets the current tab's filters + search (the other tab keeps its own). */
  const clearFilters = () => {
    setFiltersByTab((prev) => ({ ...prev, [tab]: INITIAL_FILTERS }));
    setAppliedQueryByTab((prev) => ({ ...prev, [tab]: "" }));
  };

  /**
   * Builds the zip (Excel + sales history) with a progress bar fed by the server's progress
   * lines, then downloads it.
   */
  const exportWorkbook = async () => {
    if (exporting) return;
    setExportPercent(0);
    try {
      const res = await fetch("/api/admin/purchasing/sales-budget/export");
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Export failed");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffered = "";
      let result: { name: string; file: string } | null = null;
      while (!result) {
        const { done, value } = await reader.read();
        if (value) buffered += value;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const message = JSON.parse(line) as SalesBudgetExportMessage;
          if ("error" in message) throw new Error(message.error);
          if ("percent" in message) setExportPercent(message.percent);
          else result = message;
        }
        if (done) break;
      }
      if (!result) throw new Error("Export failed");
      setExportPercent(100);
      const bytes = Uint8Array.from(atob(result.file), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const name = result.name;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify.success("Sales Budget exported.", EXPORT_TOAST_ID);
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Export failed",
        EXPORT_TOAST_ID,
      );
    } finally {
      setExportPercent(null);
    }
  };

  const refresh = () => {
    refreshNext.current = true;
    setRefreshing(true);
    setRefreshTick((n) => n + 1);
  };

  const total = data?.total ?? 0;
  const page = data?.page ?? filters.page;
  const pageCount = Math.max(1, Math.ceil(total / SALES_BUDGET_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * SALES_BUDGET_PAGE_SIZE + 1;
  const to = Math.min(page * SALES_BUDGET_PAGE_SIZE, total);
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Target className="h-8 w-8 text-primary" aria-hidden />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Sales Budget
            </h1>
            <p className="text-sm text-muted-foreground">
              Budget by Common SKU. ONLINE by merchant, SHOP by shop. All =
              combined totals.
            </p>
          </div>
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            // Live data actions; the saved view reads saved snapshots only.
            showSaved && "hidden",
          )}
        >
          {data?.erpFetchedAt ? (
            <span className="text-xs text-muted-foreground">
              ERP stock as of {formatAppIsoDateTime(data.erpFetchedAt)}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Rebuilding ERP report…" : "Refresh"}
          </Button>
          {/* Exports everything (both tabs, all filters as columns), not the current view. */}
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={exportWorkbook}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exporting
                ? exportPercent > 0
                  ? `Exporting ${exportPercent}%`
                  : "Preparing…"
                : "Export"}
            </Button>
            {exporting ? <ExportProgressBar percent={exportPercent} /> : null}
          </div>
          {exporting ? <ExportProgressCard percent={exportPercent} /> : null}
        </div>
      </div>

      <Tabs
        value={showSaved ? SAVED_TAB : tab}
        onValueChange={(value) => {
          setShowSaved(value === SAVED_TAB);
          if (value !== SAVED_TAB) setTab(value as SalesBudgetTab);
        }}
      >
        <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
          {SALES_BUDGET_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {SALES_BUDGET_TAB_LABELS[t]}
            </TabsTrigger>
          ))}
          <TabsTrigger value={SAVED_TAB}>SAVED BUDGETS</TabsTrigger>
        </TabsList>
      </Tabs>

      {showSaved ? (
        <SavedBudgetsPanel />
      ) : (
        <>
          <Card className="py-4">
            <CardContent className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  VAT
                </label>
                <select
                  className={SELECT_CLASS}
                  value={filters.vat}
                  onChange={(e) =>
                    updateFilters({
                      vat: e.target.value as SalesBudgetVatFilter,
                      page: 1,
                    })
                  }
                >
                  {SALES_BUDGET_VAT_FILTERS.map((v) => (
                    <option key={v} value={v}>
                      {SALES_BUDGET_VAT_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {entityConfig.label}
                </label>
                <select
                  className={SELECT_CLASS}
                  value={filters.entity}
                  onChange={(e) =>
                    updateFilters({ entity: e.target.value, page: 1 })
                  }
                >
                  <option value={SALES_BUDGET_ALL_ENTITIES}>
                    {entityConfig.allLabel}
                  </option>
                  {(tab === "online"
                    ? withSelected(data?.merchants ?? [], filters.entity)
                    : entityConfig.options
                  ).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              {tab === "shop" ? (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Channel
                  </label>
                  <select
                    className={SELECT_CLASS}
                    value={filters.channel}
                    onChange={(e) =>
                      updateFilters({
                        channel: e.target.value as SalesBudgetShopChannel,
                        page: 1,
                      })
                    }
                  >
                    {SALES_BUDGET_SHOP_CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {SALES_BUDGET_SHOP_CHANNEL_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Brand
                </label>
                <select
                  className={SELECT_CLASS}
                  value={filters.brand}
                  onChange={(e) =>
                    updateFilters({ brand: e.target.value, page: 1 })
                  }
                >
                  <option value={SALES_BUDGET_ALL_OPTION}>All brands</option>
                  {withSelected(data?.brands ?? [], filters.brand).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Priority
                </label>
                <select
                  className={SELECT_CLASS}
                  value={filters.priority}
                  onChange={(e) =>
                    updateFilters({ priority: e.target.value, page: 1 })
                  }
                >
                  <option value={SALES_BUDGET_ALL_OPTION}>
                    All priorities
                  </option>
                  {withSelected(data?.priorities ?? [], filters.priority).map(
                    (p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ),
                  )}
                  <option value={SALES_BUDGET_NO_PRIORITY}>No priority</option>
                </select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                <X className="mr-2 h-4 w-4" />
                Clear filters
              </Button>
              {qtyEdits.budgetFile ? (
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={() => void qtyEdits.save()}
                    disabled={!qtyEdits.canSave}
                    title={
                      qtyEdits.blockedReason ??
                      `Save the ${formatBudgetMonth(qtyEdits.budgetFile.targetMonth)} budget (every merchant / shop) with this view's Budgeted Qty edits.`
                    }
                  >
                    {qtyEdits.saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save{" "}
                    {formatBudgetMonth(
                      qtyEdits.budgetFile.targetMonth,
                      "short",
                    )}{" "}
                    budget
                    {qtyEdits.draftCount > 0
                      ? ` (${qtyEdits.draftCount} edit${qtyEdits.draftCount === 1 ? "" : "s"})`
                      : ""}
                  </Button>
                  <span
                    className={cn(
                      "text-[11px]",
                      qtyEdits.blockedReason
                        ? "font-medium text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {qtyEdits.blockedReason ?? savedStatus}
                  </span>
                </div>
              ) : null}
              {data?.target ? (
                <div className="ml-auto flex flex-wrap items-end gap-2">
                  <TargetChip
                    label={data.target.totalLabel}
                    value={data.target.total}
                  />
                  {data.target.selectedLabel ? (
                    <TargetChip
                      label={data.target.selectedLabel}
                      value={data.target.selected}
                    />
                  ) : null}
                  {/* Sum over every row matching the current filters, not just this page. */}
                  <TargetChip
                    label="Budgeted Revenue"
                    value={qtyEdits.totalRevenue}
                    allowZero
                    highlight
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="py-4">
            <CardContent>
              <ListPager
                query={filters.query}
                onQueryChange={(value) => updateFilters({ query: value })}
                page={page}
                pageCount={pageCount}
                total={total}
                from={from}
                to={to}
                onPage={(next) => updateFilters({ page: next })}
                searchPlaceholder="Search SKU or title…"
              />
              {qtyEdits.budgetFile ? (
                <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-xs">
                  <span className="mr-auto text-muted-foreground">
                    {qtyEdits.editable ? (
                      <>
                        Budgeted Qty is editable for{" "}
                        <span className="font-medium text-foreground">
                          {filters.entity}
                        </span>
                        . Unsaved changes are discarded when you switch
                        view.{" "}
                      </>
                    ) : (
                      "Read-only view: pick a merchant / shop (and a single channel) to edit Budgeted Qty. "
                    )}
                    <span className="font-medium text-foreground">
                      {formatBudgetMonth(qtyEdits.budgetFile.targetMonth)}{" "}
                      budget
                    </span>
                    : {savedStatus}
                    {qtyEdits.budgetFile.lastSavedBy
                      ? ` by ${qtyEdits.budgetFile.lastSavedBy}`
                      : ""}
                    .
                  </span>
                  {qtyEdits.draftCount > 0 ? (
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {qtyEdits.draftCount} unsaved change
                      {qtyEdits.draftCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {qtyEdits.editable ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={qtyEdits.discardAll}
                      disabled={qtyEdits.draftCount === 0 || qtyEdits.saving}
                    >
                      <Undo2 className="mr-2 h-4 w-4" />
                      Discard changes
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <Table
                containerClassName={TABLE_CONTAINER_CLASS}
                className={TABLE_CLASS}
              >
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={HEAD_CLASS}>Common SKU</TableHead>
                    <TableHead className={HEAD_CLASS}>Brand</TableHead>
                    <TableHead className={HEAD_CLASS}>Product Title</TableHead>
                    <TableHead className={NUM_HEAD_CLASS}>
                      Highest Sale Qty
                    </TableHead>
                    <TableHead className={NUM_HEAD_CLASS}>Target %</TableHead>
                    <TableHead className={NUM_HEAD_CLASS}>
                      Budgeted Qty
                    </TableHead>
                    <TableHead className={NUM_HEAD_CLASS}>
                      Current Stock
                    </TableHead>
                    <TableHead className={NUM_HEAD_CLASS}>
                      Current ROP
                    </TableHead>
                    <TableHead className={NUM_HEAD_CLASS}>
                      Selling Price
                    </TableHead>
                    <TableHead className={NUM_HEAD_CLASS}>
                      Compare at Price
                    </TableHead>
                    <TableHead className={NUM_HEAD_CLASS}>
                      Budgeted Revenue
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={COLUMN_COUNT}
                        className="h-32 text-center"
                      >
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={COLUMN_COUNT}
                        className="h-32 text-center text-sm text-muted-foreground"
                      >
                        No rows for these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow
                        key={row.commonSku}
                        className={loading ? "opacity-60" : undefined}
                      >
                        <TableCell className="font-mono text-xs font-semibold">
                          {row.commonSku}
                        </TableCell>
                        <TableCell className="whitespace-normal text-xs">
                          {row.brand || "-"}
                        </TableCell>
                        <TableCell className="whitespace-normal text-xs">
                          {row.productTitle || "-"}
                          {row.priority ? (
                            <span
                              className={cn(
                                "ml-2 inline-flex select-none items-center rounded-full px-2 py-0.5 font-sans text-xs font-semibold ring-1 ring-inset",
                                priorityLabelClass(row.priority),
                              )}
                            >
                              {row.priority}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatNumber(row.highestSaleQty)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatPercent(row.targetPercent)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs tabular-nums",
                            qtyEdits.isDirty(row.commonSku)
                              ? "bg-amber-500/15"
                              : row.savedEdit && "bg-primary/10",
                          )}
                        >
                          {qtyEdits.editable ? (
                            <BudgetQtyInput
                              value={qtyEdits.effectiveQty(row)}
                              dirty={qtyEdits.isDirty(row.commonSku)}
                              savedEdit={row.savedEdit === true}
                              onChange={(qty) => qtyEdits.setQty(row, qty)}
                              onRevert={() => qtyEdits.revertRow(row.commonSku)}
                            />
                          ) : (
                            formatNumber(row.budgetedQty)
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatNumber(row.currentStock)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatNumber(row.currentRop)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums whitespace-nowrap">
                          {formatPrice(
                            row.sellingPriceMin,
                            row.sellingPriceMax,
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums whitespace-nowrap">
                          {formatPrice(
                            row.compareAtPriceMin,
                            row.compareAtPriceMax,
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs tabular-nums",
                            qtyEdits.isDirty(row.commonSku) &&
                              "bg-amber-500/15",
                          )}
                        >
                          {formatNumber(qtyEdits.effectiveRevenue(row))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={qtyEdits.priceQuestion != null}
        onOpenChange={(open) => {
          if (!open) void qtyEdits.answerPriceQuestion(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Prices have changed</DialogTitle>
            <DialogDescription>
              Prices have changed for {qtyEdits.priceQuestion?.count ?? 0} items
              since this budget was saved. Do you want to update the prices too?
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-right text-xs">Old price</TableHead>
                <TableHead className="text-right text-xs">New price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(qtyEdits.priceQuestion?.preview ?? []).map((change) => (
                <TableRow key={`${change.vat}|${change.commonSku}`}>
                  <TableCell className="font-mono text-xs">
                    {change.commonSku}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {priceText(
                      change.oldSellingPrice,
                      change.oldCompareAtPrice,
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {priceText(
                      change.newSellingPrice,
                      change.newCompareAtPrice,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => void qtyEdits.answerPriceQuestion(null)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => void qtyEdits.answerPriceQuestion("keep")}
            >
              Only update quantities
            </Button>
            <Button onClick={() => void qtyEdits.answerPriceQuestion("update")}>
              Update prices too
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Selling price, with the compare-at price when there is one ("4,830 (was 6,900)"). */
function priceText(selling: string | number, compareAt: string | number) {
  const fmt = (v: string | number) =>
    typeof v === "number" ? v.toLocaleString("en-US") : v || "-";
  const was =
    compareAt === "" || compareAt === 0 ? "" : ` (was ${fmt(compareAt)})`;
  return `${fmt(selling)}${was}`;
}
