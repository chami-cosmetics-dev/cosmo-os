"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ExternalLink,
  Flame,
  HelpCircle,
  Layers,
  Link as LinkIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Store,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";

import { Download } from "lucide-react";

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImportPricesDialog } from "@/components/organisms/market-prices/import-dialog";
import { LinkCompetitorDialog } from "@/components/organisms/market-prices/link-dialog";
import { SkuDetailDrawer } from "@/components/organisms/market-prices/sku-detail-drawer";
import { notify } from "@/lib/notify";
import type {
  MarketCompareSummaryRow,
  MarketPriceCompetitorMeta,
  MarketPriceFilterKey,
  MarketPricePageMeta,
  MarketPriceSort,
  PriceLayer,
} from "@/lib/market-prices/types";

type Props = {
  canManage: boolean;
  onOpenImportDialog?: () => void;
  onSelectSkuDetail?: (sku: string) => void;
};

const PRIORITY_OPTIONS = ["all", "Top Priority", "Newly Added", "Non Priority", "Vat"];

const LAYER_CONFIG: Record<
  PriceLayer,
  { label: string; short: string; description: string }
> = {
  ogf: {
    label: "OGF (LWK POS)",
    short: "OGF",
    description: "One Galle Face store retail price list",
  },
  mrp: {
    label: "MRP (Standard)",
    short: "MRP",
    description: "Standard retail compare-at price",
  },
  promo: {
    label: "PROMO (Sale)",
    short: "Promo",
    description: "Active web discounted campaign price",
  },
};

export function MarketPricesPanel({
  canManage,
  onOpenImportDialog,
  onSelectSkuDetail,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & State
  const [layer, setLayer] = useState<PriceLayer>("ogf");
  const [activeFilter, setActiveFilter] = useState<MarketPriceFilterKey | "all">("all");
  const [competitorFilter, setCompetitorFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<MarketPriceSort>("gap_desc");
  const [page, setPage] = useState(1);
  const limit = 50;

  // Modals & Drawers
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogSku, setLinkDialogSku] = useState<string | undefined>(undefined);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [detailSku, setDetailSku] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  const handleOpenLink = (sku?: string) => {
    setLinkDialogSku(sku);
    setLinkDialogOpen(true);
  };

  const handleOpenDetail = (sku: string) => {
    setDetailSku(sku);
    setDetailDrawerOpen(true);
  };

  // Data
  const [rows, setRows] = useState<MarketCompareSummaryRow[]>([]);
  const [meta, setMeta] = useState<MarketPricePageMeta | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchDraft.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("layer", layer);
        params.set("sort", sort);
        params.set("page", String(page));
        params.set("limit", String(limit));

        if (activeFilter !== "all") {
          params.set("filter", activeFilter);
        }
        if (competitorFilter !== "all") {
          params.set("competitor", competitorFilter);
        }
        if (priorityFilter !== "all") {
          params.set("priority", priorityFilter);
        }
        if (search) {
          params.set("q", search);
        }

        const res = await fetch(
          `/api/admin/purchasing/market-prices/page-data?${params.toString()}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load market prices");
        }

        const data: { meta: MarketPricePageMeta; rows: MarketCompareSummaryRow[] } =
          await res.json();
        setRows(data.rows);
        setMeta(data.meta);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Error loading data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [layer, sort, page, activeFilter, competitorFilter, priorityFilter, search],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregate KPI stats from current dataset
  const kpis = useMemo(() => {
    const total = meta?.total ?? rows.length;
    let aboveMarket = 0;
    let cheapest = 0;
    let stale = 0;
    let linked = 0;

    for (const r of rows) {
      if (r.competitorCount > 0) linked++;
      if (r.anyStale) stale++;

      const gap =
        layer === "mrp" ? r.gapPctMrp : layer === "promo" ? r.gapPctPromo : r.gapPctOgf;
      if (gap != null && gap > 5) aboveMarket++;

      const isCheapest =
        layer === "mrp" ? r.cheapestMrp : layer === "promo" ? r.cheapestPromo : r.cheapestOgf;
      if (isCheapest) cheapest++;
    }

    return { total, linked, aboveMarket, cheapest, stale };
  }, [rows, meta, layer]);

  const totalPages = Math.max(1, Math.ceil((meta?.total ?? 0) / limit));

  const formatPrice = (val: number | null | undefined) => {
    if (val == null || !Number.isFinite(val)) return "—";
    return `Rs. ${val.toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Market Price Comparison</h1>
          <p className="text-sm text-muted-foreground">
            Side-by-side pricing against Sri Lankan competitors (Angels Beauty, Essentials,
            Liberty Store, Kiki Beauty, Dreams of Ceylonese, Watsans)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>

          <a
            href={`/api/admin/purchasing/market-prices/export?layer=${layer}${
              activeFilter !== "all" ? `&filter=${activeFilter}` : ""
            }${competitorFilter !== "all" ? `&competitor=${competitorFilter}` : ""}${
              priorityFilter !== "all" ? `&priority=${priorityFilter}` : ""
            }${search ? `&q=${encodeURIComponent(search)}` : ""}`}
            download="market_prices_export.csv"
          >
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </a>

          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportDialogOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Bulk Import
              </Button>
              <Button size="sm" onClick={() => handleOpenLink()}>
                <Plus className="mr-2 h-4 w-4" />
                Link Competitor
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium">
              Tracked SKUs
              <Store className="h-4 w-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold">
              {kpis.linked}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {meta?.total ?? rows.length} total
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
            Products with competitor links
          </CardContent>
        </Card>

        <Card
          className={`border-border/60 shadow-sm transition-colors ${
            kpis.aboveMarket > 0 ? "border-amber-500/30 bg-amber-500/5" : ""
          }`}
        >
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium">
              Above Market (&gt;5%)
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {kpis.aboveMarket}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
            Higher than market median on {LAYER_CONFIG[layer].short}
          </CardContent>
        </Card>

        <Card
          className={`border-border/60 shadow-sm transition-colors ${
            kpis.cheapest > 0 ? "border-emerald-500/30 bg-emerald-500/5" : ""
          }`}
        >
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium">
              Cheapest in Market
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {kpis.cheapest}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
            Strictly lowest price across competitors
          </CardContent>
        </Card>

        <Card
          className={`border-border/60 shadow-sm transition-colors ${
            kpis.stale > 0 ? "border-rose-500/30 bg-rose-500/5" : ""
          }`}
        >
          <CardHeader className="p-4 pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-medium">
              Stale Data (&gt;14d)
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {kpis.stale}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground">
            Prices not verified in 14 days
          </CardContent>
        </Card>
      </div>

      {/* Toolbar & Layer Selector */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="space-y-4 p-4">
          {/* Price Layer Switcher */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Compare Layer:
              </span>
              <div className="inline-flex rounded-lg border bg-muted/30 p-1">
                {(["ogf", "mrp", "promo"] as PriceLayer[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      setLayer(l);
                      setPage(1);
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                      layer === l
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {LAYER_CONFIG[l].label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {LAYER_CONFIG[layer].description}
            </p>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search SKU, title, brand, barcode..."
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            {/* Quick Filter */}
            <div>
              <select
                value={activeFilter}
                onChange={(e) => {
                  setActiveFilter(e.target.value as MarketPriceFilterKey | "all");
                  setPage(1);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Products</option>
                <option value="above_market">Above Market (&gt;5% gap)</option>
                <option value="cheapest">Cheapest in Market</option>
                <option value="stale">Stale Records (&gt;14 days)</option>
                <option value="has_links">Linked Only</option>
                <option value="untracked">Untracked Only</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Priorities</option>
                {PRIORITY_OPTIONS.filter((p) => p !== "all").map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as MarketPriceSort);
                  setPage(1);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="gap_desc">Gap % (Highest First)</option>
                <option value="gap_asc">Gap % (Lowest First)</option>
                <option value="sku">SKU (A to Z)</option>
                <option value="title">Product Title (A to Z)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[300px]">Product / SKU</TableHead>
                  <TableHead className="text-right">
                    Our Price ({LAYER_CONFIG[layer].short})
                  </TableHead>
                  <TableHead className="text-right">Competitor Range</TableHead>
                  <TableHead className="text-right">Competitor Median</TableHead>
                  <TableHead className="text-center">Gap vs Median</TableHead>
                  <TableHead className="text-center">Last Checked</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Loading market price comparisons...
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <HelpCircle className="h-8 w-8 text-muted-foreground/60" />
                        <p className="text-sm font-medium">No products found</p>
                        <p className="text-xs text-muted-foreground">
                          {search
                            ? `No results matching "${search}"`
                            : "No competitor prices linked yet. Click 'Link Competitor' to add competitor URLs."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const activeOurPrice =
                      layer === "mrp"
                        ? row.prices.mrp
                        : layer === "promo"
                          ? row.prices.promo
                          : row.prices.ogf;

                    const activeGap =
                      layer === "mrp"
                        ? row.gapPctMrp
                        : layer === "promo"
                          ? row.gapPctPromo
                          : row.gapPctOgf;

                    const activeCheapest =
                      layer === "mrp"
                        ? row.cheapestMrp
                        : layer === "promo"
                          ? row.cheapestPromo
                          : row.cheapestOgf;

                    return (
                      <TableRow
                        key={row.sku}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => handleOpenDetail(row.sku)}
                      >
                        {/* SKU & Title */}
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-primary">
                                {row.sku}
                              </span>
                              {row.priority && (
                                <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                                  {row.priority}
                                </span>
                              )}
                            </div>
                            <p className="line-clamp-2 text-xs font-medium text-foreground">
                              {row.title || "—"}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              {row.brand && <span>{row.brand}</span>}
                              {row.barcode && <span>• {row.barcode}</span>}
                            </div>
                          </div>
                        </TableCell>

                        {/* Our Price */}
                        <TableCell className="text-right align-top">
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold tabular-nums">
                              {formatPrice(activeOurPrice)}
                            </div>
                            <div className="text-[10px] text-muted-foreground space-y-0.5">
                              {layer !== "ogf" && row.prices.ogf && (
                                <div>OGF: {formatPrice(row.prices.ogf)}</div>
                              )}
                              {layer !== "mrp" && row.prices.mrp && (
                                <div>MRP: {formatPrice(row.prices.mrp)}</div>
                              )}
                              {layer !== "promo" && row.prices.promo && (
                                <div className="text-emerald-600 dark:text-emerald-400">
                                  Promo: {formatPrice(row.prices.promo)}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Competitor Range */}
                        <TableCell className="text-right align-top">
                          {row.competitorCount > 0 ? (
                            <div className="space-y-0.5">
                              <div className="text-xs tabular-nums text-foreground">
                                {formatPrice(row.competitorMin)} -{" "}
                                {formatPrice(row.competitorMax)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                across {row.competitorCount} store
                                {row.competitorCount > 1 ? "s" : ""}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              No links
                            </span>
                          )}
                        </TableCell>

                        {/* Competitor Median */}
                        <TableCell className="text-right align-top">
                          {row.competitorMedian != null ? (
                            <span className="text-xs font-semibold tabular-nums text-foreground">
                              {formatPrice(row.competitorMedian)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Gap vs Median */}
                        <TableCell className="text-center align-top">
                          {activeGap != null ? (
                            <div className="inline-flex flex-col items-center gap-1">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                                  activeCheapest
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                    : activeGap > 5
                                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                                      : activeGap < 0
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                        : "bg-secondary text-secondary-foreground"
                                }`}
                              >
                                {activeGap > 0 ? `+${activeGap}%` : `${activeGap}%`}
                              </span>
                              {activeCheapest && (
                                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  Cheapest
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Last Checked */}
                        <TableCell className="text-center align-top">
                          {row.latestCheckDate ? (
                            <div className="inline-flex flex-col items-center gap-1">
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {row.latestCheckDate}
                              </span>
                              {row.anyStale && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3 w-3" />
                                  Stale &gt;14d
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Action */}
                        <TableCell
                          className="text-right align-top"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => handleOpenDetail(row.sku)}
                            >
                              Details
                            </Button>
                            {canManage && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                onClick={() => handleOpenLink(row.sku)}
                              >
                                <LinkIcon className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {meta && meta.total > limit && (
            <div className="flex items-center justify-between border-t p-4 text-xs text-muted-foreground">
              <div>
                Showing {(page - 1) * limit + 1} -{" "}
                {Math.min(page * limit, meta.total)} of {meta.total} products
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link Dialog */}
      <LinkCompetitorDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        sku={linkDialogSku}
        onSuccess={() => loadData(true)}
      />

      {/* Import Dialog */}
      <ImportPricesDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={() => loadData(true)}
      />

      {/* Detail Drawer */}
      <SkuDetailDrawer
        sku={detailSku}
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        canManage={canManage}
        onEditLink={(sku) => {
          setDetailDrawerOpen(false);
          handleOpenLink(sku);
        }}
      />
    </div>
  );
}
