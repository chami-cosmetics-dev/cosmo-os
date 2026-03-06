"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(420px,1fr)_180px_180px_180px] xl:items-end">
            <div className="relative md:col-span-2 xl:col-span-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search by title, variant, or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <MenuFilterSelect
              className="w-full"
              value={locationFilter}
              onChange={setLocationFilter}
              options={[
                { value: "", label: "All locations" },
                ...locations.map((location) => ({
                  value: location.id,
                  label: location.name,
                })),
              ]}
            />
            <MenuFilterSelect
              className="w-full"
              value={vendorFilter}
              onChange={setVendorFilter}
              options={[
                { value: "", label: "All vendors" },
                ...vendors.map((vendor) => ({
                  value: vendor.id,
                  label: vendor.name,
                })),
              ]}
            />
            <MenuFilterSelect
              className="w-full"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "", label: "All categories" },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
            />
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

type MenuFilterOption = {
  value: string;
  label: string;
};

function MenuFilterSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: MenuFilterOption[];
  className?: string;
}) {
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "Select";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`border-input bg-background/90 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-11 items-center justify-between rounded-xl border border-border/70 px-4 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] dark:bg-input/40 ${className ?? ""}`}
        >
          <span>{selectedLabel}</span>
          <ChevronsUpDown className="text-muted-foreground size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value || "empty"}
            onSelect={() => onChange(option.value)}
            className="justify-between"
          >
            <span>{option.label}</span>
            {value === option.value ? <Check className="size-4" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
