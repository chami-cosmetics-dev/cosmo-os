"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

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
import { notify } from "@/lib/notify";

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
  imageUrl: string | null;
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
}

export function ProductItemsPanel({ initialData }: ProductItemsPanelProps = {}) {
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
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [limit, setLimit] = useState(initialData?.limit ?? 10);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const hasActiveFilters = Boolean(
    debouncedSearch.trim() || locationFilter || vendorFilter || categoryFilter
  );
  const activeFilterCount = [
    Boolean(debouncedSearch.trim()),
    Boolean(locationFilter),
    Boolean(vendorFilter),
    Boolean(categoryFilter),
  ].filter(Boolean).length;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPageData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (locationFilter) params.set("location_id", locationFilter);
    if (vendorFilter) params.set("vendor_id", vendorFilter);
    if (categoryFilter) params.set("category_id", categoryFilter);
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (sortBy) {
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
    }
    const res = await fetch(`/api/admin/product-items/page-data?${params}`);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      notify.error(data.error ?? "Failed to load items");
      setLoading(false);
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
  }, [debouncedSearch, locationFilter, vendorFilter, categoryFilter, page, limit, sortBy, sortOrder]);

  const skippedInitialFetch = useRef(false);
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
    setSortBy("");
    setSortOrder("asc");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Product Items</CardTitle>
          <p className="text-muted-foreground text-sm">
            Items synced from Shopify via webhooks. Filter by location, vendor, or category.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border bg-muted/30 px-2 py-1">Total: {total}</span>
            {hasActiveFilters ? (
              <span className="rounded-md border bg-muted/30 px-2 py-1">
                Active filters: {activeFilterCount}
              </span>
            ) : null}
            {sortBy ? (
              <span className="rounded-md border bg-muted/30 px-2 py-1">
                Sorted by: {sortBy} ({sortOrder})
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3">
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
              >
                <X className="size-4" />
                Clear
              </Button>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Search by title, variant, or SKU..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
              <Select
                value={locationFilter || ALL_FILTER_VALUE}
                onValueChange={(value) => {
                  setLocationFilter(value === ALL_FILTER_VALUE ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-52">
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
                <SelectTrigger className="w-full sm:w-48">
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
                <SelectTrigger className="w-full sm:w-52">
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
            </div>
          </div>

          {loading ? (
            <TableSkeleton columns={8} rows={6} />
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-muted-foreground text-sm">
                {hasActiveFilters
                  ? "No items found for current filters."
                  : "No product items yet. Items will appear here when synced from Shopify webhooks."}
              </p>
              {hasActiveFilters ? (
                <Button className="mt-3" size="sm" variant="outline" onClick={clearFilters}>
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
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
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
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
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
