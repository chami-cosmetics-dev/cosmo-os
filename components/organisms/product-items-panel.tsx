"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
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

export function ProductItemsPanel() {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, locationFilter, vendorFilter, categoryFilter, sortBy, sortOrder]);

  const fetchPageData = useCallback(async () => {
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
  }, [debouncedSearch, locationFilter, vendorFilter, categoryFilter, page, limit, sortBy, sortOrder]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPageData()
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          notify.error("Failed to load data");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPageData]);

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
    if (!val) return "—";
    const n = parseFloat(val);
    return Number.isNaN(n) ? val : n.toLocaleString("en-LK", { minimumFractionDigits: 2 });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Product Items</CardTitle>
          <p className="text-muted-foreground text-sm">
            Items synced from Shopify via webhooks. Filter by location, vendor, or category.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search by title, variant, or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <TableSkeleton columns={8} rows={6} />
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              No product items yet. Items will appear here when synced from Shopify webhooks.
            </p>
          ) : (
            <>
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
                    <tr key={item.id} className="border-b last:border-0">
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
                      <td className="px-4 py-2">{item.sku ?? "—"}</td>
                      <td className="px-4 py-2 text-right">{formatPrice(item.price)}</td>
                      <td className="px-4 py-2 text-right">
                        {formatPrice(item.compareAtPrice)}
                      </td>
                      <td className="px-4 py-2">{item.vendor?.name ?? "—"}</td>
                      <td className="px-4 py-2">{item.category?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-center">{item.inventoryQuantity}</td>
                      <td className="px-4 py-2">{item.companyLocation?.name ?? "—"}</td>
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
