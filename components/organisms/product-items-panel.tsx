"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Download, FolderOpen, Loader2, Package2, RefreshCw, Search, X } from "lucide-react";

import { ProductItemStorageSheet } from "@/components/organisms/product-item-storage-sheet";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableColumnHeader } from "@/components/ui/sortable-column-header";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { createClientPerfLogger } from "@/lib/client-perf";
import { notify } from "@/lib/notify";
import { mergeErpPriorityFilterOptions } from "@/lib/product-items/erp-priority-options";
import { cn } from "@/lib/utils";

type ProductItem = {
  id: string;
  groupKey?: string;
  productTitle: string;
  familyName?: string;
  variantTitle: string | null;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  priceDisplay?: string;
  compareAtPriceDisplay?: string;
  vendor?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  companyLocation?: { name: string } | null;
  locationCount?: number;
  locationSummary?: string;
  inventoryQuantity: number;
  totalInventoryQuantity?: number;
  status: string | null;
  itemStatusCategory?: string;
  itemStatusLabel?: string | null;
  erp1ProductPriority?: string | null;
  erp2ProductPriority?: string | null;
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
  families: Array<{ id: string; name: string }>;
  priorities?: Array<{ id: string; name: string }>;
};

interface ProductItemsPanelProps {
  initialData?: ProductItemsPanelInitialData | null;
  canManage?: boolean;
}

type SearchableFilterProps = {
  value: string;
  options: Array<{ id: string; name: string }>;
  allLabel: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  onChange: (value: string) => void;
  contentClassName?: string;
  wrapItems?: boolean;
};

function SearchableFilter({
  value,
  options,
  allLabel,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  onChange,
  contentClassName,
  wrapItems = false,
}: SearchableFilterProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between border-border/70 bg-background px-3 font-normal"
        >
          <span className={cn("truncate text-left", !selected && !value && "text-muted-foreground")} title={selected?.name}>
            {selected?.name ?? (value ? placeholder : allLabel)}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] border-border/70 p-0", contentClassName)}
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === option.id ? "opacity-100" : "opacity-0")} />
                  <span className={wrapItems ? "whitespace-normal break-words leading-snug" : "truncate"}>
                    {option.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PriorityCell({ value, differ }: { value: string | null | undefined; differ?: boolean }) {
  const text = value?.trim() || "—";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md border px-2 py-1 text-xs font-medium",
        differ
          ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
          : "border-border/70 bg-secondary/20 text-foreground",
        !value?.trim() && "text-muted-foreground",
      )}
      title={text}
    >
      <span className="truncate">{text}</span>
    </span>
  );
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
  const [locations, setLocations] = useState(initialData?.locations ?? []);
  const [vendors, setVendors] = useState(initialData?.vendors ?? []);
  const [categories, setCategories] = useState(initialData?.categories ?? []);
  const [families, setFamilies] = useState(initialData?.families ?? []);
  const [priorities, setPriorities] = useState(
    () => mergeErpPriorityFilterOptions((initialData?.priorities ?? []).map((p) => p.name)),
  );
  const [loading, setLoading] = useState(!initialData);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [limit, setLimit] = useState(initialData?.limit ?? 10);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [storageItem, setStorageItem] = useState<{
    sku: string;
    productTitle: string;
    familyName: string;
  } | null>(null);

  const hasActiveFilters = Boolean(
    debouncedSearch.trim() ||
      locationFilter ||
      vendorFilter ||
      categoryFilter ||
      familyFilter ||
      priorityFilter,
  );
  const activeFilterCount = [
    Boolean(debouncedSearch.trim()),
    Boolean(locationFilter),
    Boolean(vendorFilter),
    Boolean(categoryFilter),
    Boolean(familyFilter),
    Boolean(priorityFilter),
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
    if (familyFilter) params.set("family_id", familyFilter);
    if (priorityFilter) params.set("erp_product_priority", priorityFilter);
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
    const data = (await res.json()) as ProductItemsPanelInitialData;
    setItems(data.items);
    setTotal(data.total);
    setLocations(data.locations ?? []);
    setVendors(data.vendors ?? []);
    setCategories(data.categories ?? []);
    setFamilies(data.families ?? []);
    setPriorities(mergeErpPriorityFilterOptions((data.priorities ?? []).map((p) => p.name)));
    setLoading(false);
    perf.end({ ok: true, total: data.total });
  }, [
    categoryFilter,
    effectiveSearch,
    familyFilter,
    hasInitialData,
    priorityFilter,
    locationFilter,
    page,
    limit,
    sortBy,
    sortOrder,
    vendorFilter,
  ]);

  const syncPriorities = useCallback(async (opts?: { silent?: boolean }) => {
    setSyncing(true);
    try {
      if (!opts?.silent) {
        notify.success("Syncing priorities from ERP…");
      }
      const res = await fetch("/api/admin/product-items/sync-erp-priorities", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        updatedRows?: number;
        sources?: Array<{ id: string; label: string; status: string; error?: string | null }>;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Priority sync failed");
        return;
      }
      const failed = (data.sources ?? []).filter((s) => s.status === "failed");
      if (failed.length > 0) {
        notify.error(
          `Partial sync: ${failed.map((s) => s.label).join(", ")} unavailable. Other ERP updated.`,
        );
      } else {
        notify.success(`Priorities synced (${data.updatedRows?.toLocaleString() ?? 0} rows).`);
      }
      await fetchPageData();
    } catch {
      notify.error("Priority sync failed");
    } finally {
      setSyncing(false);
    }
  }, [fetchPageData]);

  const skippedInitialFetch = useRef(false);
  const syncedOnce = useRef(false);

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

  // Auto-sync from ERP once after first paint (plan 2B)
  useEffect(() => {
    if (syncedOnce.current) return;
    syncedOnce.current = true;
    const timer = setTimeout(() => {
      void syncPriorities({ silent: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [syncPriorities]);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setLocationFilter("");
    setVendorFilter("");
    setCategoryFilter("");
    setFamilyFilter("");
    setPriorityFilter("");
    setSortBy("");
    setSortOrder("asc");
    setPage(1);
  }

  function downloadProductItemsExport() {
    const params = new URLSearchParams();
    if (effectiveSearch) params.set("search", effectiveSearch);
    if (locationFilter) params.set("location_id", locationFilter);
    if (vendorFilter) params.set("vendor_id", vendorFilter);
    if (categoryFilter) params.set("category_id", categoryFilter);
    if (familyFilter) params.set("family_id", familyFilter);
    if (priorityFilter) params.set("erp_product_priority", priorityFilter);
    if (sortBy) {
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
    }
    window.open(`/api/admin/product-items/export?${params.toString()}`, "_blank", "noopener");
  }

  function formatPrice(val: string | null): string {
    if (!val) return "-";
    const n = parseFloat(val);
    return Number.isNaN(n) ? val : n.toLocaleString("en-LK", { minimumFractionDigits: 2 });
  }

  const isBusy = syncing;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-[0.14em]">Products</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Package2 className="size-5 text-muted-foreground" />
            Product Items
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Product Priority comes from ERP1 / ERP2 (Manufacturing). Syncs when you open this page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-border/70 px-2.5 py-1 text-muted-foreground">
            {total.toLocaleString("en-LK")} items
          </span>
          {activeFilterCount > 0 ? (
            <span className="rounded-md border border-border/70 px-2.5 py-1 text-muted-foreground">
              {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void syncPriorities()}
            disabled={isBusy}
            className="h-9 border-border/70"
          >
            {syncing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            {syncing ? "Syncing…" : "Sync priorities"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={downloadProductItemsExport}
            disabled={isBusy}
            className="h-9 border-border/70"
          >
            <Download className="size-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/80 p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)_minmax(150px,1fr)_minmax(170px,1fr)_minmax(160px,1fr)_auto]">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search product, SKU..."
              value={search}
              disabled={isBusy}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 border-border/70 bg-background pl-9"
            />
          </div>
          <SearchableFilter
            value={locationFilter}
            options={locations}
            allLabel="All locations"
            placeholder="Location"
            searchPlaceholder="Search location..."
            emptyLabel="No location found."
            onChange={(value) => {
              setLocationFilter(value);
              setPage(1);
            }}
          />
          <SearchableFilter
            value={vendorFilter}
            options={vendors}
            allLabel="All vendors"
            placeholder="Vendor"
            searchPlaceholder="Search vendor..."
            emptyLabel="No vendor found."
            onChange={(value) => {
              setVendorFilter(value);
              setPage(1);
            }}
          />
          <SearchableFilter
            value={categoryFilter}
            options={categories}
            allLabel="All categories"
            placeholder="Category"
            searchPlaceholder="Search category..."
            emptyLabel="No category found."
            onChange={(value) => {
              setCategoryFilter(value);
              setPage(1);
            }}
          />
          <SearchableFilter
            value={familyFilter}
            options={families}
            allLabel="All families"
            placeholder="Family"
            searchPlaceholder="Search family..."
            emptyLabel="No family found."
            contentClassName="w-[min(520px,calc(100vw-2rem))]"
            wrapItems
            onChange={(value) => {
              setFamilyFilter(value);
              setPage(1);
            }}
          />
          <Select
            value={priorityFilter || ALL_FILTER_VALUE}
            onValueChange={(value) => {
              setPriorityFilter(value === ALL_FILTER_VALUE ? "" : value);
              setPage(1);
            }}
            disabled={isBusy}
          >
            <SelectTrigger className="h-9 w-full border-border/70 bg-background">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All priorities</SelectItem>
              {priorities.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clearFilters}
            disabled={(!hasActiveFilters && !sortBy) || isBusy}
            className="h-9 justify-start px-2"
          >
            <X className="size-4" />
            Clear
          </Button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <TableSkeleton columns={6} rows={8} />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-background/70 p-8 text-center">
          <p className="text-muted-foreground text-sm">
            {hasActiveFilters ? "No items found for current filters." : "No product items yet."}
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
          <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] table-fixed text-sm">
                <thead className="bg-secondary/10">
                  <tr className="border-b border-border/60">
                    <SortableColumnHeader
                      label="Product"
                      sortKey="product"
                      currentSort={sortBy || undefined}
                      currentOrder={sortOrder}
                      onSort={(key, order) => {
                        setSortBy(key);
                        setSortOrder(order);
                        setPage(1);
                      }}
                      className="w-[30%] py-2 text-xs"
                    />
                    <SortableColumnHeader
                      label="Family"
                      sortKey="family"
                      currentSort={sortBy || undefined}
                      currentOrder={sortOrder}
                      onSort={(key, order) => {
                        setSortBy(key);
                        setSortOrder(order);
                        setPage(1);
                      }}
                      className="w-[18%] py-2 text-xs"
                    />
                    <SortableColumnHeader
                      label="Price"
                      sortKey="price"
                      currentSort={sortBy || undefined}
                      currentOrder={sortOrder}
                      onSort={(key, order) => {
                        setSortBy(key);
                        setSortOrder(order);
                        setPage(1);
                      }}
                      align="right"
                      className="w-[10%] py-2 text-xs"
                    />
                    <SortableColumnHeader
                      label="Stock"
                      sortKey="stock"
                      currentSort={sortBy || undefined}
                      currentOrder={sortOrder}
                      onSort={(key, order) => {
                        setSortBy(key);
                        setSortOrder(order);
                        setPage(1);
                      }}
                      align="center"
                      className="w-[10%] py-2 text-xs"
                    />
                    <th className="w-[16%] px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      ERP1 Priority
                    </th>
                    <th className="w-[16%] px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      ERP2 Priority
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const price = item.priceDisplay
                      ? item.priceDisplay.split(" - ").map(formatPrice).join(" - ")
                      : formatPrice(item.price);
                    const p1 = item.erp1ProductPriority?.trim() || null;
                    const p2 = item.erp2ProductPriority?.trim() || null;
                    const differ = Boolean(p1 && p2 && p1 !== p2);
                    return (
                      <tr key={item.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/8">
                        <td className="px-4 py-3 align-top">
                          <div className="flex min-w-0 items-start gap-3">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                            ) : (
                              <div className="size-9 shrink-0 rounded-md bg-secondary/30" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{item.productTitle}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {[item.sku ? `SKU ${item.sku}` : null, item.vendor?.name, item.category?.name]
                                  .filter(Boolean)
                                  .join(" / ") || "-"}
                              </p>
                              <div className="mt-1 flex items-center gap-1.5">
                                {item.hasExplanation ? (
                                  <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                    Academy
                                  </span>
                                ) : null}
                                {item.sku ? (
                                  <button
                                    type="button"
                                    title="Open storage"
                                    onClick={() =>
                                      setStorageItem({
                                        sku: item.sku!,
                                        productTitle: item.productTitle,
                                        familyName: item.familyName ?? item.productTitle,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                                  >
                                    <FolderOpen className="size-3" />
                                    Storage
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="truncate text-sm">{item.familyName ?? "-"}</p>
                          {item.variantTitle ? (
                            <p className="mt-1 truncate text-xs text-muted-foreground">{item.variantTitle}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <p className="font-medium tabular-nums">{price}</p>
                        </td>
                        <td className="px-4 py-3 text-center align-top">
                          <p className="font-medium tabular-nums">
                            {item.totalInventoryQuantity ?? item.inventoryQuantity}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.locationSummary ?? item.companyLocation?.name ?? "-"}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <PriorityCell value={p1} differ={differ} />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <PriorityCell value={p2} differ={differ} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {total > 0 ? (
            <Pagination
              page={page}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onLimitChange={(newLimit) => {
                setLimit(newLimit);
                setPage(1);
              }}
              limitOptions={[10, 25, 50, 100]}
            />
          ) : null}
        </>
      )}

      {storageItem ? (
        <ProductItemStorageSheet
          open={Boolean(storageItem)}
          onClose={() => setStorageItem(null)}
          sku={storageItem.sku}
          productTitle={storageItem.productTitle}
          familyName={storageItem.familyName}
        />
      ) : null}
    </div>
  );
}
