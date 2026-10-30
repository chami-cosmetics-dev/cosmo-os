"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Loader2, Lock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  COLUMN_COUNT,
  formatNumber,
  formatPercent,
  HEAD_CLASS,
  NUM_HEAD_CLASS,
  SELECT_CLASS,
  TABLE_CLASS,
  TABLE_CONTAINER_CLASS,
  TargetChip,
  downloadFile,
  withSelected,
} from "@/components/organisms/sales-budget-table-ui";
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
  SALES_BUDGET_TAB_LABELS,
  SALES_BUDGET_TABS,
  SALES_BUDGET_VAT_FILTERS,
  SALES_BUDGET_VAT_LABELS,
  type SalesBudgetTab,
  type SalesBudgetVatFilter,
  type SavedBudgetListItem,
  type SavedBudgetViewData,
} from "@/lib/sales-budget/config";

/** The saved budget has a SHOP-SHOP and a SHOP-ONLINE sheet; no combined channel. */
const SAVED_SHOP_CHANNELS = ["shop", "online"] as const;
type SavedShopChannel = (typeof SAVED_SHOP_CHANNELS)[number];

type ViewFilters = {
  channel: SavedShopChannel;
  vat: SalesBudgetVatFilter;
  entity: string;
  brand: string;
  priority: string;
  query: string;
  page: number;
};

const INITIAL_FILTERS: ViewFilters = {
  channel: "shop",
  vat: "all",
  entity: SALES_BUDGET_ALL_ENTITIES,
  brand: SALES_BUDGET_ALL_OPTION,
  priority: SALES_BUDGET_ALL_OPTION,
  query: "",
  page: 1,
};

/** As saved: a number gets thousands separators, a range text ("7,600 – 7,950") stays. */
function formatSavedPrice(value: number | string | null): string {
  if (value == null) return "-";
  return typeof value === "number" ? formatNumber(value) : value;
}

/**
 * Downloads the month's saved budget (Open or Locked): a zip with the Excel (from its snapshot)
 * + the sales history CSV.
 */
function DownloadBudgetButton({ targetMonth }: { targetMonth: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async (e) => {
        // In the list the row itself opens the budget.
        e.stopPropagation();
        setBusy(true);
        try {
          await downloadFile(
            `/api/admin/purchasing/sales-budget/saved/${targetMonth}/download`,
            `Sales_Budget_${targetMonth}.zip`,
          );
        } catch (err) {
          notify.error(
            err instanceof Error
              ? err.message
              : "The saved file could not be found",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      {busy ? "Preparing…" : "Download"}
    </Button>
  );
}

/** Saved Budgets tab: the saved months, and a read-only view of one. */
export function SavedBudgetsPanel() {
  const [budgets, setBudgets] = useState<SavedBudgetListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [opened, setOpened] = useState<SavedBudgetListItem | null>(null);

  // Reloaded each time the list is shown, so Last Updated follows new saves.
  useEffect(() => {
    if (opened) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/purchasing/sales-budget/saved");
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(body.error || "Failed to load saved budgets");
        if (!cancelled) {
          setBudgets(body.budgets);
          setListError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setListError(
            err instanceof Error ? err.message : "Failed to load saved budgets",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened]);

  if (opened) {
    return (
      <SavedBudgetViewer
        targetMonth={opened.targetMonth}
        onBack={() => setOpened(null)}
      />
    );
  }

  return (
    <Card className="py-4">
      <CardContent>
        <Table
          containerClassName={TABLE_CONTAINER_CLASS}
          className={TABLE_CLASS}
        >
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead className={HEAD_CLASS}>Budget Month</TableHead>
              <TableHead className={HEAD_CLASS}>Last Updated</TableHead>
              <TableHead className={HEAD_CLASS}>Status</TableHead>
              <TableHead className={`${HEAD_CLASS} w-[140px]`}>
                Download
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listError ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-sm text-destructive"
                >
                  {listError}
                </TableCell>
              </TableRow>
            ) : budgets == null ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : budgets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No saved budgets yet
                </TableCell>
              </TableRow>
            ) : (
              budgets.map((b) => (
                <TableRow
                  key={b.targetMonth}
                  className="cursor-pointer"
                  onClick={() => setOpened(b)}
                >
                  <TableCell className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                    {formatBudgetMonth(b.targetMonth)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {formatSavedAt(b.lastUpdatedAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {b.status === "open" ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        Open
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Locked
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DownloadBudgetButton targetMonth={b.targetMonth} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Read-only table of one saved month, same layout as the live screen. */
function SavedBudgetViewer({
  targetMonth,
  onBack,
}: {
  targetMonth: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<SalesBudgetTab>("online");
  const [filtersByTab, setFiltersByTab] = useState<
    Record<SalesBudgetTab, ViewFilters>
  >({ online: INITIAL_FILTERS, shop: INITIAL_FILTERS });
  const [appliedQueryByTab, setAppliedQueryByTab] = useState<
    Record<SalesBudgetTab, string>
  >({ online: "", shop: "" });
  const [data, setData] = useState<SavedBudgetViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const filters = filtersByTab[tab];
  const appliedQuery = appliedQueryByTab[tab];
  const entityConfig = SALES_BUDGET_ENTITY_CONFIG[tab];

  const updateFilters = (patch: Partial<ViewFilters>) => {
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
    const params = new URLSearchParams({
      tab,
      vat: filters.vat,
      entity: filters.entity,
      brand: filters.brand,
      priority: filters.priority,
      page: String(filters.page),
      limit: String(SALES_BUDGET_PAGE_SIZE),
    });
    if (tab === "shop") params.set("channel", filters.channel);
    if (appliedQuery) params.set("q", appliedQuery);

    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/purchasing/sales-budget/saved/${targetMonth}?${params}`,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Failed to load the budget");
        if (id === requestId.current) {
          setData(body);
          setError(null);
        }
      } catch (err) {
        if (id === requestId.current) {
          setError(
            err instanceof Error ? err.message : "Failed to load the budget",
          );
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    })();
  }, [
    targetMonth,
    tab,
    filters.channel,
    filters.vat,
    filters.entity,
    filters.brand,
    filters.priority,
    filters.page,
    appliedQuery,
  ]);

  const hasActiveFilters =
    filters.channel !== INITIAL_FILTERS.channel ||
    filters.vat !== INITIAL_FILTERS.vat ||
    filters.entity !== INITIAL_FILTERS.entity ||
    filters.brand !== INITIAL_FILTERS.brand ||
    filters.priority !== INITIAL_FILTERS.priority ||
    filters.query !== "";

  const clearFilters = () => {
    setFiltersByTab((prev) => ({ ...prev, [tab]: INITIAL_FILTERS }));
    setAppliedQueryByTab((prev) => ({ ...prev, [tab]: "" }));
  };

  const total = data?.total ?? 0;
  const page = data?.page ?? filters.page;
  const pageCount = Math.max(1, Math.ceil(total / SALES_BUDGET_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * SALES_BUDGET_PAGE_SIZE + 1;
  const to = Math.min(page * SALES_BUDGET_PAGE_SIZE, total);
  const rows = data?.rows ?? [];
  // A Common SKU with VAT and NON-VAT lines is saved as two lines; label them.
  const skuCount = new Map<string, number>();
  for (const r of rows)
    skuCount.set(r.commonSku, (skuCount.get(r.commonSku) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {formatBudgetMonth(targetMonth)} budget
          </h2>
          <p className="text-sm text-muted-foreground">
            {data ? `Last updated ${formatSavedAt(data.lastUpdatedAt)}` : " "}
            {" · Read-only, as saved."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadBudgetButton targetMonth={targetMonth} />
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SalesBudgetTab)}
      >
        <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
          {SALES_BUDGET_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {SALES_BUDGET_TAB_LABELS[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
              {withSelected(data?.entities ?? [], filters.entity).map(
                (name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ),
              )}
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
                    channel: e.target.value as SavedShopChannel,
                    page: 1,
                  })
                }
              >
                {SAVED_SHOP_CHANNELS.map((c) => (
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
              <option value={SALES_BUDGET_ALL_OPTION}>All priorities</option>
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
              <TargetChip
                label="Budgeted Revenue"
                value={data.budgetedRevenueTotal}
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
          <p className="mb-3 text-xs text-muted-foreground">
            Saved values, not recalculated.{" "}
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Highlighted Budgeted Qty = edited by a user
              {filters.entity === SALES_BUDGET_ALL_ENTITIES
                ? " (any merchant / shop)"
                : ""}
              .
            </span>
          </p>
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
                <TableHead className={NUM_HEAD_CLASS}>Budgeted Qty</TableHead>
                <TableHead className={NUM_HEAD_CLASS}>Current Stock</TableHead>
                <TableHead className={NUM_HEAD_CLASS}>Current ROP</TableHead>
                <TableHead className={NUM_HEAD_CLASS}>Selling Price</TableHead>
                <TableHead className={NUM_HEAD_CLASS}>
                  Compare at Price
                </TableHead>
                <TableHead className={NUM_HEAD_CLASS}>
                  Budgeted Revenue
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {error ? (
                <TableRow>
                  <TableCell
                    colSpan={COLUMN_COUNT}
                    className="h-32 text-center text-sm text-destructive"
                  >
                    {error}
                  </TableCell>
                </TableRow>
              ) : loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={COLUMN_COUNT}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Reading the saved budget…
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
                    key={`${row.vat}|${row.commonSku}`}
                    className={loading ? "opacity-60" : undefined}
                  >
                    <TableCell className="font-mono text-xs font-semibold">
                      {row.commonSku}
                      {(skuCount.get(row.commonSku) ?? 0) > 1 ? (
                        <div className="font-sans text-[10px] font-normal text-muted-foreground">
                          {row.vat}
                        </div>
                      ) : null}
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
                        row.edited && "bg-primary/10",
                      )}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {row.edited ? (
                          <span
                            title="Edited by a user"
                            className="h-1.5 w-1.5 rounded-full bg-primary"
                          />
                        ) : null}
                        {formatNumber(row.budgetedQty)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatNumber(row.currentStock)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatNumber(row.currentRop)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums whitespace-nowrap">
                      {formatSavedPrice(row.sellingPrice)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums whitespace-nowrap">
                      {formatSavedPrice(row.compareAtPrice)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatNumber(row.budgetedRevenue)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
