"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package2, Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortableColumnHeader } from "@/components/ui/sortable-column-header";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { createClientPerfLogger } from "@/lib/client-perf";
import { notify } from "@/lib/notify";
import {
  getProductItemStatusMeta,
  PRODUCT_ITEM_STATUS_CATEGORIES,
  PRODUCT_ITEM_STATUS_META,
} from "@/lib/product-item-status";

type ProductItem = {
  id: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  vendor?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  companyLocation?: { name: string } | null;
  inventoryQuantity: number;
  status: string | null;
  itemStatusCategory: string;
  itemStatusLabel: string | null;
  imageUrl: string | null;
  hasExplanation?: boolean;
};

export type ProductItemsPanelInitialData = {
  items: ProductItem[];
  total: number;
  page: number;
  limit: number;
  locations: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
};

interface ProductItemsPanelProps {
  initialData?: ProductItemsPanelInitialData | null;
  canManage?: boolean;
}

export function ProductItemsPanel({ initialData, canManage = false }: ProductItemsPanelProps = {}) {
  const hasInitialData = Boolean(initialData);
  const pagePerfRef = useRef(
    createClientPerfLogger("product-items.panel.mount", {
      hasInitialData,
    }),
  );
  const ALL_FILTER_VALUE = "__all__";
  const [items, setItems] = useState<ProductItem[]>(initialData?.items ?? []);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>(
    initialData?.locations ?? []
  );
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>(
    initialData?.vendors ?? []
  );
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>(
    initialData?.categories ?? []
  );
  const [loading, setLoading] = useState(!initialData);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [itemStatusFilter, setItemStatusFilter] = useState<string>("");
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [limit, setLimit] = useState(initialData?.limit ?? 10);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);

  const hasActiveFilters = Boolean(
    debouncedSearch.trim() || locationFilter || vendorFilter || categoryFilter || itemStatusFilter
  );
  const activeFilterCount = [
    Boolean(debouncedSearch.trim()),
    Boolean(locationFilter),
    Boolean(vendorFilter),
    Boolean(categoryFilter),
    Boolean(itemStatusFilter),
  ].filter(Boolean).length;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveSearch = useMemo(() => debouncedSearch.trim(), [debouncedSearch]);

  const fetchPageData = useCallback(async () => {
    const perf = createClientPerfLogger("product-items.panel.fetch", {
      hasInitialData,
      page,
      limit,
    });
    const params = new URLSearchParams();
    if (effectiveSearch) params.set("search", effectiveSearch);
    if (locationFilter) params.set("location_id", locationFilter);
    if (vendorFilter) params.set("vendor_id", vendorFilter);
    if (categoryFilter) params.set("category_id", categoryFilter);
    if (itemStatusFilter) params.set("item_status_category", itemStatusFilter);
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (sortBy) {
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
    }
    const res = await fetch(`/api/admin/product-items/page-data?${params}`);
    perf.mark("response");
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load items");
      setLoading(false);
      perf.end({ ok: false });
      return;
    }
    const data = (await res.json()) as {
      items: ProductItem[];
      total: number;
      page: number;
      limit: number;
      locations: Array<{ id: string; name: string }>;
      vendors: Array<{ id: string; name: string }>;
      categories: Array<{ id: string; name: string }>;
    };
    setItems(data.items);
    setTotal(data.total);
    setLocations(data.locations ?? []);
    setVendors(data.vendors ?? []);
    setCategories(data.categories ?? []);
    setLoading(false);
    perf.end({ ok: true, total: data.total });
  }, [categoryFilter, effectiveSearch, hasInitialData, itemStatusFilter, locationFilter, page, limit, sortBy, sortOrder, vendorFilter]);

  const skippedInitialFetch = useRef(false);
  useEffect(() => {
    pagePerfRef.current.end({ initialItemCount: initialData?.items.length ?? 0 });
  }, [initialData]);

  useEffect(() => {
    if (initialData && !skippedInitialFetch.current) {
      skippedInitialFetch.current = true;
      return;
    }
    skippedInitialFetch.current = true;
    const timer = setTimeout(() => {
      fetchPageData().catch(() => {
        notify.error("Failed to load data");
        setLoading(false);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchPageData, initialData]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit);
    setPage(1);
  }

  function handleSort(key: string, order: "asc" | "desc") {
    setSortBy(key);
    setSortOrder(order);
    setPage(1);
  }

  function formatPrice(val: string | null): string {
    if (!val) return "-";
    const n = parseFloat(val);
    return Number.isNaN(n) ? val : n.toLocaleString("en-LK", { minimumFractionDigits: 2 });
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setLocationFilter("");
    setVendorFilter("");
    setCategoryFilter("");
    setItemStatusFilter("");
    setSortBy("");
    setSortOrder("asc");
    setPage(1);
  }

  function statusBadgeClass(category: string): string {
    if (category === "DISCONTINUE") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200";
    if (category === "NEWLY_ADDED") return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200";
    if (category.startsWith("TOP_PRIORITY")) return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200";
    if (category.startsWith("PRIORITY")) return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
    return "border-border/70 bg-secondary/20 text-muted-foreground";
  }

  async function updateItemStatus(itemId: string, itemStatusCategory: string) {
    const previousItems = items;
    const statusMeta = getProductItemStatusMeta(itemStatusCategory);
    setSavingStatusId(itemId);
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              itemStatusCategory: statusMeta.category,
              itemStatusLabel: statusMeta.category === "UNCATEGORIZED" ? null : statusMeta.label,
            }
          : item
      )
    );

    try {
      const res = await fetch(`/api/admin/product-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemStatusCategory: statusMeta.category }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setItems(previousItems);
        notify.error(data.error ?? "Failed to update item status");
        return;
      }
      notify.success("Item status updated.");
    } catch {
      setItems(previousItems);
      notify.error("Failed to update item status");
    } finally {
      setSavingStatusId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Products
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Package2 className="size-5 text-muted-foreground" />
          Product Items
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Browse Shopify-synced product items with quick filters for branch, vendor, category, and item priority.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Total Items</p>
          <p className="mt-2 text-sm font-semibold">{total.toLocaleString("en-LK")}</p>
          <p className="text-muted-foreground mt-1 text-xs">Live count based on the current product item dataset.</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--primary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Filters</p>
          <p className="mt-2 text-sm font-semibold">{activeFilterCount} active</p>
          <p className="text-muted-foreground mt-1 text-xs">Search and filters help narrow items by location, vendor, and category.</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Sorting</p>
          <p className="mt-2 text-sm font-semibold">{sortBy ? `${sortBy} (${sortOrder})` : "Default order"}</p>
          <p className="text-muted-foreground mt-1 text-xs">Use column sorting to inspect price, stock, vendor, and location faster.</p>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="space-y-2 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle className="flex items-center gap-2">
            <Package2 className="size-5 text-muted-foreground" />
            Product Item Explorer
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Items synced from Shopify via webhooks. Filter by location, vendor, category, or item priority.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_96%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))] p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                Filters
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clearFilters}
                disabled={!hasActiveFilters && !sortBy}
                className="border-border/70 bg-background/85 hover:bg-secondary/10"
              >
                <X className="size-4" />
                Clear
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_13rem_12rem_13rem_16rem]">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Search by title, variant, or SKU..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="border-border/70 bg-background/90 pl-9"
                />
              </div>
              <Select
                value={locationFilter || ALL_FILTER_VALUE}
                onValueChange={(value) => {
                  setLocationFilter(value === ALL_FILTER_VALUE ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full border-border/70 bg-background/90 sm:w-52">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All locations</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={vendorFilter || ALL_FILTER_VALUE}
                onValueChange={(value) => {
                  setVendorFilter(value === ALL_FILTER_VALUE ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full border-border/70 bg-background/90 sm:w-48">
                  <SelectValue placeholder="All vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All vendors</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={categoryFilter || ALL_FILTER_VALUE}
                onValueChange={(value) => {
                  setCategoryFilter(value === ALL_FILTER_VALUE ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full border-border/70 bg-background/90 sm:w-52">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={itemStatusFilter || ALL_FILTER_VALUE}
                onValueChange={(value) => {
                  setItemStatusFilter(value === ALL_FILTER_VALUE ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full border-border/70 bg-background/90">
                  <SelectValue placeholder="All item statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All item statuses</SelectItem>
                  {PRODUCT_ITEM_STATUS_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {PRODUCT_ITEM_STATUS_META[category].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading && items.length === 0 ? (
            <TableSkeleton columns={9} rows={6} />
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-background/85 p-8 text-center">
              <p className="text-muted-foreground text-sm">
                {hasActiveFilters
                  ? "No items found for current filters."
                  : "No product items yet. Items will appear here when synced from Shopify webhooks."}
              </p>
              {hasActiveFilters ? (
                <Button className="mt-3 border-border/70 bg-background/85 hover:bg-secondary/10" size="sm" variant="outline" onClick={clearFilters}>
                  <X className="size-4" />
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="text-muted-foreground text-xs">
                Showing {items.length} item(s) on this page.
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/90 shadow-xs">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_10%,transparent))]">
                      <SortableColumnHeader
                        label="Product"
                        sortKey="product"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableColumnHeader
                        label="SKU"
                        sortKey="sku"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableColumnHeader
                        label="Price"
                        sortKey="price"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                        align="right"
                      />
                      <SortableColumnHeader
                        label="Compare At"
                        sortKey="compare_at"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                        align="right"
                      />
                      <SortableColumnHeader
                        label="Vendor"
                        sortKey="vendor"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableColumnHeader
                        label="Category"
                        sortKey="category"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                        Item Status
                      </th>
                      <SortableColumnHeader
                        label="Stock"
                        sortKey="stock"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                        align="center"
                      />
                      <SortableColumnHeader
                        label="Location"
                        sortKey="location"
                        currentSort={sortBy || undefined}
                        currentOrder={sortOrder}
                        onSort={handleSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/10">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="size-10 rounded object-cover"
                              />
                            )}
                            <div>
                              <span className="font-medium">{item.productTitle}</span>
                              {item.hasExplanation && (
                                <span className="mt-1 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                  Academy explanation created
                                </span>
                              )}
                              {item.variantTitle && (
                                <span className="text-muted-foreground block text-xs">
                                  {item.variantTitle}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2">{item.sku ?? "-"}</td>
                        <td className="px-4 py-2 text-right">{formatPrice(item.price)}</td>
                        <td className="px-4 py-2 text-right">
                          {formatPrice(item.compareAtPrice)}
                        </td>
                        <td className="px-4 py-2">{item.vendor?.name ?? "-"}</td>
                        <td className="px-4 py-2">{item.category?.name ?? "-"}</td>
                        <td className="px-4 py-2">
                          {(() => {
                            const statusMeta = getProductItemStatusMeta(item.itemStatusCategory);
                            return canManage ? (
                              <Select
                                value={statusMeta.category}
                                onValueChange={(value) => updateItemStatus(item.id, value)}
                                disabled={savingStatusId === item.id}
                              >
                                <SelectTrigger className={`h-8 min-w-56 border px-2 py-1 text-xs font-medium ${statusBadgeClass(statusMeta.category)}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {PRODUCT_ITEM_STATUS_CATEGORIES.map((category) => (
                                    <SelectItem key={category} value={category}>
                                      {PRODUCT_ITEM_STATUS_META[category].label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className={`inline-flex max-w-56 items-center rounded-md border px-2 py-1 text-xs font-medium ${statusBadgeClass(statusMeta.category)}`}>
                                {item.itemStatusLabel || statusMeta.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-2 text-center">{item.inventoryQuantity}</td>
                        <td className="px-4 py-2">{item.companyLocation?.name ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 0 && (
                <Pagination
                  page={page}
                  limit={limit}
                  total={total}
                  onPageChange={handlePageChange}
                  onLimitChange={handleLimitChange}
                  limitOptions={[10, 25, 50, 100]}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
