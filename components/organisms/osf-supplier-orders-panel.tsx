"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import {
  isRowOverAllocated,
  rowAllocatedSum,
  validateDraftForGenerate,
} from "@/lib/osf/supplier-orders-allocate";
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type SupplierAllocation,
  type WorkingOrderRow,
} from "@/lib/osf/supplier-orders-draft";

type Brand = { id: string; name: string };
type SearchItem = {
  sku: string;
  description: string;
  vendorId: string;
  vendorName: string;
  reorderQty: number;
};
type SupplierOption = {
  supplierId: string;
  supplierName: string;
  lastPurchaseAt: string | null;
  sortGroup: "sku_recent" | "other";
};

export function OsfSupplierOrdersPanel() {
  const [companyId, setCompanyId] = useState("");
  const [userId, setUserId] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [priority, setPriority] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [rows, setRows] = useState<WorkingOrderRow[]>([]);
  const [suppliersBySku, setSuppliersBySku] = useState<Record<string, SupplierOption[]>>({});
  /** Per-SKU supplier keys manually picked via “Choose another supplier”. */
  const [addedSupplierKeysBySku, setAddedSupplierKeysBySku] = useState<Record<string, string[]>>(
    {},
  );
  /** Per-SKU: picker list open for selecting one more supplier. */
  const [pickerOpenBySku, setPickerOpenBySku] = useState<Record<string, boolean>>({});
  const [pickerQueryBySku, setPickerQueryBySku] = useState<Record<string, string>>({});
  /** Per-SKU: compact to suppliers that already have qty allocated. */
  const [compactSuppliersBySku, setCompactSuppliersBySku] = useState<Record<string, boolean>>({});
  const [loadingSuppliers, setLoadingSuppliers] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Skip priority→brands refetch on the initial bootstrap load. */
  const skipPriorityBrandRefreshRef = useRef(true);

  useEffect(() => {
    fetch("/api/admin/osf/supplier-orders/page-data")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load page data");
        return r.json();
      })
      .then(
        (data: {
          brands?: Brand[];
          priorities?: string[];
          companyId?: string;
          userId?: string;
        }) => {
          setBrands(Array.isArray(data.brands) ? data.brands : []);
          setPriorities(Array.isArray(data.priorities) ? data.priorities : []);
          const cid = data.companyId ?? "";
          const uid = data.userId ?? "";
          setCompanyId(cid);
          setUserId(uid);
          if (cid && uid) {
            const draft = loadDraft(cid, uid);
            if (draft?.rows?.length) setRows(draft.rows);
          }
          setBootstrapped(true);
        },
      )
      .catch(() => {
        notify.error("Could not load supplier orders filters");
        setBootstrapped(true);
      });
  }, []);

  useEffect(() => {
    if (!bootstrapped || !companyId || !userId) return;
    saveDraft({
      version: 1,
      companyId,
      userId,
      updatedAt: new Date().toISOString(),
      rows,
    });
  }, [rows, companyId, userId, bootstrapped]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Cascade brand options from selected priority; reset invalid brand selection.
  useEffect(() => {
    if (!bootstrapped) return;
    if (skipPriorityBrandRefreshRef.current) {
      skipPriorityBrandRefreshRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (priority.trim()) params.set("priority", priority.trim());
        const qs = params.toString();
        const res = await fetch(
          qs
            ? `/api/admin/osf/supplier-orders/page-data?${qs}`
            : "/api/admin/osf/supplier-orders/page-data",
        );
        if (!res.ok) throw new Error("Failed to load brands");
        const data = (await res.json()) as { brands?: Brand[] };
        if (cancelled) return;
        const nextBrands = Array.isArray(data.brands) ? data.brands : [];
        setBrands(nextBrands);
        setVendorId((prev) =>
          prev && !nextBrands.some((b) => b.id === prev) ? "" : prev,
        );
      } catch {
        if (!cancelled) notify.error("Could not refresh brands for priority");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [priority, bootstrapped]);

  async function fetchItems(opts: { page: number; append?: boolean; query?: string }) {
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(opts.page));
      params.set("pageSize", "50");
      const query = opts.query ?? q;
      if (query.trim()) params.set("q", query.trim());
      if (vendorId) params.set("vendorId", vendorId);
      if (priority) params.set("priority", priority);
      const res = await fetch(`/api/admin/osf/supplier-orders/items?${params}`);
      if (!res.ok) throw new Error("Search failed");
      const data = (await res.json()) as {
        items?: SearchItem[];
        hasMore?: boolean;
        page?: number;
      };
      const next = Array.isArray(data.items) ? data.items : [];
      setItems((prev) => (opts.append ? [...prev, ...next] : next));
      setHasMore(Boolean(data.hasMore));
      setPage(data.page ?? opts.page);
    } catch {
      notify.error("Could not load items");
    } finally {
      setSearchLoading(false);
    }
  }

  function openSearch() {
    setSearchOpen(true);
    void fetchItems({ page: 1, query: q });
  }

  function onQueryChange(value: string) {
    setQ(value);
    setSearchOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchItems({ page: 1, query: value });
    }, 250);
  }

  useEffect(() => {
    if (!searchOpen) return;
    void fetchItems({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when filters change while open
  }, [vendorId, priority]);

  function focusSearch() {
    setQ("");
    setSearchOpen(true);
    void fetchItems({ page: 1, query: "" });
    requestAnimationFrame(() => {
      searchInputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      searchInputRef.current?.focus({ preventScroll: true });
    });
  }

  function addItem(item: SearchItem) {
    setRows((prev) => {
      if (prev.some((r) => r.sku === item.sku)) {
        notify.info("SKU already in the table");
        return prev;
      }
      return [
        ...prev,
        {
          sku: item.sku,
          description: item.description,
          reorderQty: item.reorderQty,
          allocations: [],
        },
      ];
    });
    setSearchOpen(false);
  }

  function removeRow(sku: string) {
    setRows((prev) => prev.filter((r) => r.sku !== sku));
  }

  function clearAll() {
    setRows([]);
    if (companyId && userId) clearDraft(companyId, userId);
  }

  async function ensureSuppliers(sku: string) {
    if (suppliersBySku[sku]) return;
    setLoadingSuppliers(sku);
    try {
      const res = await fetch(
        `/api/admin/osf/supplier-orders/suppliers?sku=${encodeURIComponent(sku)}`,
      );
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { suppliers?: SupplierOption[] };
      setSuppliersBySku((prev) => ({
        ...prev,
        [sku]: Array.isArray(data.suppliers) ? data.suppliers : [],
      }));
    } catch {
      notify.error(`Could not load suppliers for ${sku}`);
      setSuppliersBySku((prev) => ({ ...prev, [sku]: [] }));
    } finally {
      setLoadingSuppliers(null);
    }
  }

  function setAllocationQty(sku: string, supplier: SupplierOption, qtyRaw: string) {
    const qty = Number(qtyRaw);
    const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
    setRows((prev) =>
      prev.map((row) => {
        if (row.sku !== sku) return row;
        const others = row.allocations.filter(
          (a) =>
            (a.supplierId && a.supplierId !== supplier.supplierId) ||
            (!a.supplierId && a.supplierName !== supplier.supplierName),
        );
        const nextAlloc: SupplierAllocation[] =
          safeQty > 0
            ? [
                ...others,
                {
                  supplierId: supplier.supplierId,
                  supplierName: supplier.supplierName,
                  qty: safeQty,
                },
              ]
            : others;
        return { ...row, allocations: nextAlloc };
      }),
    );
  }

  function allocationQtyFor(row: WorkingOrderRow, supplier: SupplierOption): number {
    const hit = row.allocations.find(
      (a) =>
        (a.supplierId && a.supplierId === supplier.supplierId) ||
        a.supplierName === supplier.supplierName,
    );
    return hit?.qty ?? 0;
  }

  function supplierKey(s: SupplierOption): string {
    return s.supplierId || s.supplierName;
  }

  /** Visible allocation rows: compact → allocated only; else recent + manually added + any with qty. */
  function visibleSuppliersForRow(row: WorkingOrderRow, suppliers: SupplierOption[]): SupplierOption[] {
    const compact = Boolean(compactSuppliersBySku[row.sku]);
    if (compact) {
      return suppliers.filter((s) => allocationQtyFor(row, s) > 0);
    }
    const added = new Set(addedSupplierKeysBySku[row.sku] ?? []);
    const recent = suppliers.filter((s) => s.sortGroup === "sku_recent");
    const picked = suppliers.filter((s) => added.has(supplierKey(s)));
    const withQty = suppliers.filter((s) => allocationQtyFor(row, s) > 0);
    const seen = new Set<string>();
    const out: SupplierOption[] = [];
    for (const s of [...recent, ...picked, ...withQty]) {
      const k = supplierKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }

  /** Suppliers not yet on the allocation list — for the picker. */
  function pickerCandidatesForRow(
    row: WorkingOrderRow,
    suppliers: SupplierOption[],
  ): SupplierOption[] {
    const visibleKeys = new Set(visibleSuppliersForRow(row, suppliers).map(supplierKey));
    const q = (pickerQueryBySku[row.sku] ?? "").trim().toLowerCase();
    return suppliers.filter((s) => {
      if (visibleKeys.has(supplierKey(s))) return false;
      if (!q) return true;
      return s.supplierName.toLowerCase().includes(q);
    });
  }

  function addSupplierToRow(sku: string, supplier: SupplierOption) {
    const key = supplierKey(supplier);
    setAddedSupplierKeysBySku((prev) => {
      const cur = prev[sku] ?? [];
      if (cur.includes(key)) return prev;
      return { ...prev, [sku]: [...cur, key] };
    });
    setPickerOpenBySku((prev) => ({ ...prev, [sku]: false }));
    setPickerQueryBySku((prev) => ({ ...prev, [sku]: "" }));
    setCompactSuppliersBySku((prev) => ({ ...prev, [sku]: false }));
  }

  function setPickerOpen(sku: string, open: boolean) {
    setPickerOpenBySku((prev) => ({ ...prev, [sku]: open }));
    if (open) {
      setCompactSuppliersBySku((prev) => ({ ...prev, [sku]: false }));
    }
  }

  function setCompactSuppliers(sku: string, compact: boolean) {
    setCompactSuppliersBySku((prev) => ({ ...prev, [sku]: compact }));
    if (compact) {
      setPickerOpenBySku((prev) => ({ ...prev, [sku]: false }));
    }
  }

  async function generate() {
    const validation = validateDraftForGenerate(rows);
    if (!validation.ok) {
      notify.error(
        validation.skus?.length
          ? `${validation.error}: ${validation.skus.join(", ")}`
          : validation.error,
      );
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/osf/supplier-orders/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Generate failed (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? "OSF-supplier-orders.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      // Clear working table + draft only after successful generate (FR-001).
      clearAll();
      notify.success("Supplier order zip downloaded");
    } catch (err) {
      // Leave rows/draft intact on failure (FR-002).
      notify.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-2xl space-y-1">
          <h3 className="font-medium">Supplier orders</h3>
          <p className="text-sm text-muted-foreground">
            Filter by priority and brand, search SKUs, allocate quantities across suppliers,
            then generate a zip of supplier Excel files.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearAll}
            disabled={rows.length === 0}
          >
            Clear table
          </Button>
          <Button type="button" size="sm" onClick={() => void generate()} disabled={generating}>
            {generating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            {generating ? "Generating…" : "Generate zip"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Priority</span>
          <select
            className="flex h-9 w-44 rounded-md border border-input bg-background px-2 text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">All priorities</option>
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Brand</span>
          <select
            className="flex h-9 w-52 rounded-md border border-input bg-background px-2 text-sm"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="relative max-w-xl" ref={searchWrapRef}>
        <label className="space-y-1 text-sm block">
          <span className="text-muted-foreground">Search items (SKU / description)</span>
          <Input
            ref={searchInputRef}
            value={q}
            placeholder="Click to list all filtered items, or type to filter…"
            onFocus={openSearch}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </label>
        {searchOpen && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-background shadow-md">
            {searchLoading && items.length === 0 ? (
              <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No items match.</p>
            ) : (
              <ul className="py-1">
                {items.map((item) => (
                  <li key={item.sku}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/60"
                      onClick={() => addItem(item)}
                    >
                      <span className="font-medium">{item.sku}</span>
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {item.description}
                        {item.reorderQty > 0 ? ` · reorder ${item.reorderQty}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hasMore && (
              <button
                type="button"
                className="w-full border-t px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40"
                disabled={searchLoading}
                onClick={() => void fetchItems({ page: page + 1, append: true })}
              >
                {searchLoading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No SKUs in the working table yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">SKU</th>
                <th className="p-2">Description</th>
                <th className="p-2">Reorder qty</th>
                <th className="p-2">Supplier allocations</th>
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const allocated = rowAllocatedSum(row);
                const over = isRowOverAllocated(row);
                const suppliers = suppliersBySku[row.sku];
                const pickerOpen = Boolean(pickerOpenBySku[row.sku]);
                const compact = Boolean(compactSuppliersBySku[row.sku]);
                const recentCount = suppliers?.filter((s) => s.sortGroup === "sku_recent").length ?? 0;
                const visible = suppliers ? visibleSuppliersForRow(row, suppliers) : [];
                const pickerCandidates = suppliers ? pickerCandidatesForRow(row, suppliers) : [];
                const hasPositiveAlloc = row.allocations.some((a) => a.qty > 0);
                return (
                  <tr key={row.sku} className="border-t align-top">
                    <td className="p-2 font-medium whitespace-nowrap">{row.sku}</td>
                    <td className="p-2 max-w-[14rem]">{row.description}</td>
                    <td className="p-2 tabular-nums">{row.reorderQty}</td>
                    <td className="p-2">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void ensureSuppliers(row.sku)}
                          >
                            {loadingSuppliers === row.sku ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : null}
                            {suppliers ? "Refresh suppliers" : "Load suppliers"}
                          </Button>
                          <span
                            className={`text-xs ${over ? "text-destructive" : "text-muted-foreground"}`}
                          >
                            Allocated {allocated}
                            {row.reorderQty > 0 ? ` / ${row.reorderQty}` : ""}
                            {over ? " (over)" : ""}
                          </span>
                        </div>
                        {suppliers && suppliers.length === 0 && (
                          <p className="text-xs text-muted-foreground">No suppliers configured.</p>
                        )}
                        {suppliers && suppliers.length > 0 && (
                          <div className="space-y-2">
                            {!compact && (
                              <p className="text-xs text-muted-foreground">
                                {recentCount > 0
                                  ? `Recent for this SKU (${recentCount})`
                                  : "No recent suppliers for this SKU — choose another below"}
                                {visible.length > recentCount
                                  ? ` · ${visible.length} on list`
                                  : ""}
                              </p>
                            )}
                            {compact && (
                              <p className="text-xs text-muted-foreground">
                                Allocated suppliers only ({visible.length})
                              </p>
                            )}
                            {visible.length > 0 ? (
                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {visible.map((s) => (
                                  <label
                                    key={supplierKey(s)}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <span
                                      className="min-w-0 flex-1 truncate"
                                      title={s.supplierName}
                                    >
                                      {s.supplierName}
                                      {s.sortGroup === "sku_recent" ? " · recent" : ""}
                                    </span>
                                    <Input
                                      className="h-8 w-20"
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={allocationQtyFor(row, s) || ""}
                                      placeholder="0"
                                      onChange={(e) =>
                                        setAllocationQty(row.sku, s, e.target.value)
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            ) : (
                              !compact && (
                                <p className="text-xs text-muted-foreground">
                                  Use “Choose another supplier” to pick one for this SKU.
                                </p>
                              )
                            )}
                            {!compact && pickerOpen && (
                              <div className="rounded-md border bg-background p-2 space-y-2 max-w-md">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium">Select a supplier to add</p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setPickerOpen(row.sku, false)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                                <Input
                                  className="h-8"
                                  placeholder="Filter suppliers…"
                                  value={pickerQueryBySku[row.sku] ?? ""}
                                  onChange={(e) =>
                                    setPickerQueryBySku((prev) => ({
                                      ...prev,
                                      [row.sku]: e.target.value,
                                    }))
                                  }
                                />
                                <ul className="max-h-48 overflow-y-auto divide-y rounded-md border">
                                  {pickerCandidates.length === 0 ? (
                                    <li className="px-2 py-2 text-xs text-muted-foreground">
                                      No more suppliers to add
                                      {(pickerQueryBySku[row.sku] ?? "").trim()
                                        ? " for this filter"
                                        : ""}
                                      .
                                    </li>
                                  ) : (
                                    pickerCandidates.map((s) => (
                                      <li key={supplierKey(s)}>
                                        <button
                                          type="button"
                                          className="flex w-full px-2 py-1.5 text-left text-xs hover:bg-muted/60"
                                          onClick={() => addSupplierToRow(row.sku, s)}
                                        >
                                          {s.supplierName}
                                        </button>
                                      </li>
                                    ))
                                  )}
                                </ul>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {!compact && !pickerOpen && pickerCandidates.length > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setPickerOpen(row.sku, true)}
                                >
                                  Choose another supplier ({pickerCandidates.length})
                                </Button>
                              )}
                              {!compact && !pickerOpen && pickerCandidates.length === 0 && visible.length > 0 && (
                                <span className="text-xs text-muted-foreground self-center">
                                  All suppliers already on the list
                                </span>
                              )}
                              {!compact && hasPositiveAlloc && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setCompactSuppliers(row.sku, true)}
                                >
                                  Shrink list
                                </Button>
                              )}
                              {compact && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setCompactSuppliers(row.sku, false)}
                                >
                                  Edit suppliers
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${row.sku}`}
                        onClick={() => removeRow(row.sku)}
                      >
                        <X className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-center border-t p-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => focusSearch()}
            >
              Add another item
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
