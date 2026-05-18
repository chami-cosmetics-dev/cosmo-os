"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Download, FileUp, FolderOpen, Loader2, Package2, Search, X } from "lucide-react";

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
  families: Array<{ id: string; name: string }>;
};

type PriorityImportPreview = {
  totalRows: number;
  parsedRows: number;
  matchedSkus: number;
  matchedItems: number;
  unmatchedSkus: string[];
  byCategory: Record<string, number>;
  rows: Array<{
    sku: string;
    itemStatusLabel: string;
    itemStatusCategory: string;
  }>;
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

export function ProductItemsPanel({ initialData, canManage = false }: ProductItemsPanelProps = {}) {
  const hasInitialData = Boolean(initialData);
  const pagePerfRef = useRef(
    createClientPerfLogger("product-items.panel.mount", {
      hasInitialData,
    }),
  );
  const priorityFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [families, setFamilies] = useState<Array<{ id: string; name: string }>>(
    initialData?.families ?? []
  );
  const [loading, setLoading] = useState(!initialData);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [familyFilter, setFamilyFilter] = useState<string>("");
  const [itemStatusFilter, setItemStatusFilter] = useState<string>("");
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [limit, setLimit] = useState(initialData?.limit ?? 10);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [storageItem, setStorageItem] = useState<{ sku: string; productTitle: string; familyName: string } | null>(null);
  const [priorityImporting, setPriorityImporting] = useState(false);
  const [priorityApplying, setPriorityApplying] = useState(false);
  const [priorityPreview, setPriorityPreview] = useState<PriorityImportPreview | null>(null);

  const hasActiveFilters = Boolean(
    debouncedSearch.trim() || locationFilter || vendorFilter || categoryFilter || familyFilter || itemStatusFilter
  );
  const activeFilterCount = [
    Boolean(debouncedSearch.trim()),
    Boolean(locationFilter),
    Boolean(vendorFilter),
    Boolean(categoryFilter),
    Boolean(familyFilter),
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
    if (familyFilter) params.set("family_id", familyFilter);
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
      families: Array<{ id: string; name: string }>;
    };
    setItems(data.items);
    setTotal(data.total);
    setLocations(data.locations ?? []);
    setVendors(data.vendors ?? []);
    setCategories(data.categories ?? []);
    setFamilies(data.families ?? []);
    setLoading(false);
    perf.end({ ok: true, total: data.total });
  }, [categoryFilter, effectiveSearch, familyFilter, hasInitialData, itemStatusFilter, locationFilter, page, limit, sortBy, sortOrder, vendorFilter]);

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
    setFamilyFilter("");
    setItemStatusFilter("");
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
    if (itemStatusFilter) params.set("item_status_category", itemStatusFilter);
    if (sortBy) {
      params.set("sort_by", sortBy);
      params.set("sort_order", sortOrder);
    }
    window.open(`/api/admin/product-items/export?${params.toString()}`, "_blank", "noopener");
  }

  async function previewPriorityImport(file: File) {
    try {
      setPriorityImporting(true);
      setPriorityPreview(null);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/product-items/status-import/preview", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as PriorityImportPreview & { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to read priority file");
        return;
      }
      setPriorityPreview(data);
      notify.success(`Preview ready. ${data.matchedSkus} SKU(s) matched.`);
    } catch {
      notify.error("Failed to read priority file");
    } finally {
      setPriorityImporting(false);
      if (priorityFileInputRef.current) priorityFileInputRef.current.value = "";
    }
  }

  async function applyPriorityImport() {
    if (!priorityPreview) return;
    try {
      setPriorityApplying(true);
      const res = await fetch("/api/admin/product-items/status-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: priorityPreview.rows }),
      });
      const data = (await res.json()) as { error?: string; updatedItems?: number };
      if (!res.ok) {
        notify.error(data.error ?? "Failed to apply priority file");
        return;
      }
      notify.success(`Priority file applied. Updated ${data.updatedItems ?? 0} item row(s).`);
      setPriorityPreview(null);
      await fetchPageData();
    } catch {
      notify.error("Failed to apply priority file");
    } finally {
      setPriorityApplying(false);
    }
  }

  function statusBadgeClass(category: string): string {
    if (category === "DISCONTINUE") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200";
    if (category === "NEWLY_ADDED") return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200";
    if (category.startsWith("TOP_PRIORITY")) return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200";
    if (category.startsWith("PRIORITY")) return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
    return "border-border/70 bg-secondary/20 text-muted-foreground";
  }

  function compactStatusLabel(category: string) {
    const label = getProductItemStatusMeta(category).label;
    return label
      .replace("Top Priority Brand", "Top Brand")
      .replace("Priority Brand", "Priority Brand")
      .replace("Priority Product", "Priority")
      .replace("Non Priority Product", "Non Priority");
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-[0.14em]">Products</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Package2 className="size-5 text-muted-foreground" />
            Product Items
          </h1>
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
          {canManage ? (
            <>
              <input
                ref={priorityFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void previewPriorityImport(file);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => priorityFileInputRef.current?.click()}
                disabled={priorityImporting || priorityApplying}
                className="h-9 border-border/70"
              >
                {priorityImporting ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                Priority
              </Button>
            </>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={downloadProductItemsExport} className="h-9 border-border/70">
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
            value={itemStatusFilter || ALL_FILTER_VALUE}
            onValueChange={(value) => {
              setItemStatusFilter(value === ALL_FILTER_VALUE ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full border-border/70 bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All statuses</SelectItem>
              {PRODUCT_ITEM_STATUS_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>{PRODUCT_ITEM_STATUS_META[category].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clearFilters}
            disabled={!hasActiveFilters && !sortBy}
            className="h-9 justify-start px-2"
          >
            <X className="size-4" />
            Clear
          </Button>
        </div>

        {priorityPreview ? (
          <div className="mt-3 rounded-md border border-border/70 bg-secondary/10 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm">
                <p className="font-medium">Priority preview</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {priorityPreview.parsedRows} rows, {priorityPreview.matchedSkus} matched SKUs, {priorityPreview.matchedItems} item rows.
                  {priorityPreview.unmatchedSkus.length > 0 ? ` ${priorityPreview.unmatchedSkus.length} unmatched.` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setPriorityPreview(null)} disabled={priorityApplying}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={applyPriorityImport} disabled={priorityApplying || priorityPreview.matchedSkus === 0}>
                  {priorityApplying ? <Loader2 className="size-4 animate-spin" /> : null}
                  Apply
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <TableSkeleton columns={5} rows={8} />
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
              <table className="w-full min-w-[980px] table-fixed text-sm">
                <thead className="bg-secondary/10">
                  <tr className="border-b border-border/60">
                    <SortableColumnHeader label="Product" sortKey="product" currentSort={sortBy || undefined} currentOrder={sortOrder} onSort={handleSort} className="w-[34%] py-2 text-xs" />
                    <SortableColumnHeader label="Family" sortKey="family" currentSort={sortBy || undefined} currentOrder={sortOrder} onSort={handleSort} className="w-[24%] py-2 text-xs" />
                    <SortableColumnHeader label="Price" sortKey="price" currentSort={sortBy || undefined} currentOrder={sortOrder} onSort={handleSort} align="right" className="w-[12%] py-2 text-xs" />
                    <SortableColumnHeader label="Stock" sortKey="stock" currentSort={sortBy || undefined} currentOrder={sortOrder} onSort={handleSort} align="center" className="w-[10%] py-2 text-xs" />
                    <th className="w-[20%] px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const statusMeta = getProductItemStatusMeta(item.itemStatusCategory);
                    const price = item.priceDisplay
                      ? item.priceDisplay.split(" - ").map(formatPrice).join(" - ")
                      : formatPrice(item.price);
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
                                {[item.sku ? `SKU ${item.sku}` : null, item.vendor?.name, item.category?.name].filter(Boolean).join(" / ") || "-"}
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
                                    onClick={() => setStorageItem({ sku: item.sku!, productTitle: item.productTitle, familyName: item.familyName ?? item.productTitle })}
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
                          {item.compareAtPriceDisplay && item.compareAtPriceDisplay !== "-" ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Compare {item.compareAtPriceDisplay.split(" - ").map(formatPrice).join(" - ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-center align-top">
                          <p className="font-medium tabular-nums">{item.totalInventoryQuantity ?? item.inventoryQuantity}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.locationSummary ?? item.companyLocation?.name ?? "-"}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {canManage ? (
                            <Select
                              value={statusMeta.category}
                              onValueChange={(value) => updateItemStatus(item.id, value)}
                              disabled={savingStatusId === item.id}
                            >
                              <SelectTrigger className={`h-8 w-full border px-2 text-xs font-medium ${statusBadgeClass(statusMeta.category)}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRODUCT_ITEM_STATUS_CATEGORIES.map((category) => (
                                  <SelectItem key={category} value={category}>{compactStatusLabel(category)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`inline-flex max-w-full items-center rounded-md border px-2 py-1 text-xs font-medium ${statusBadgeClass(statusMeta.category)}`}>
                              {compactStatusLabel(statusMeta.category)}
                            </span>
                          )}
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
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              limitOptions={[10, 25, 50, 100]}
            />
          ) : null}
        </>
      )}
      <ProductItemStorageSheet
        open={Boolean(storageItem)}
        sku={storageItem?.sku ?? null}
        productTitle={storageItem?.productTitle ?? null}
        familyName={storageItem?.familyName ?? null}
        onClose={() => setStorageItem(null)}
      />
    </div>
  );
}
