"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, MapPinned, Plus, Printer, Search, Trash2, X } from "lucide-react";

import { StoreAllocationLocationStep } from "@/components/molecules/store-allocation-location-step";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify } from "@/lib/notify";
import {
  MAX_STORE_ALLOCATION_SESSION_ITEMS,
  type SessionItem,
  type SessionLocationQty,
} from "@/lib/store-allocation/session-types";
import {
  buildNonEmptyLocationSteps,
  clampWalkthroughIndex,
} from "@/lib/store-allocation/walkthrough";
import { allocateTakeQty } from "@/lib/store-allocation/allocate";

type LookupItem = {
  sku: string;
  barcode: string | null;
  description: string;
  priorityErp1?: string | null;
  priorityErp2?: string | null;
  companyReorderQty?: number;
  itemStatusCategory?: string | null;
  itemStatusLabel?: string | null;
};

type PrWarehouseRow = {
  id: string;
  sku: string;
  columnKey: string;
  warehouse: string;
  qty: number;
};

function priorityLabel(item: SessionItem) {
  return [item.priorityErp1, item.priorityErp2].filter(Boolean).join(" / ") || "—";
}

function itemSumOk(item: SessionItem): boolean {
  if (item.takeQty == null || item.takeQty <= 0) return true;
  if (item.planStatus !== "ready" || item.locations.length === 0) return false;
  const sum = item.locations.reduce((s, l) => s + l.qty, 0);
  return sum === item.takeQty;
}

function allocationCompany(location: SessionLocationQty) {
  return location.erpCompany?.trim() || location.label.trim() || "Unassigned";
}

export function StoreLocationAllocationPanel() {
  const [q, setQ] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [matches, setMatches] = useState<LookupItem[]>([]);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [focusSku, setFocusSku] = useState<string | null>(null);
  const [continuingSku, setContinuingSku] = useState<string | null>(null);
  const [walkOpen, setWalkOpen] = useState(false);
  const [allocationConfirmed, setAllocationConfirmed] = useState(false);
  const [prSupplier, setPrSupplier] = useState("");
  const [prSuppliers, setPrSuppliers] = useState<Array<{ name: string; label: string }>>([]);
  const [prRows, setPrRows] = useState<PrWarehouseRow[]>([]);
  const [createdReceipts, setCreatedReceipts] = useState<string[]>([]);
  const [creatingPr, setCreatingPr] = useState(false);
  const [walkIndex, setWalkIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const lastScanAt = useRef(0);
  const planTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const walkSteps = useMemo(() => buildNonEmptyLocationSteps(items), [items]);
  const safeWalkIndex = clampWalkthroughIndex(walkIndex, walkSteps.length);
  const currentStep = walkSteps[safeWalkIndex] ?? null;

  const exportable = items.filter((i) => i.takeQty != null && i.takeQty > 0);
  const allExportValid =
    exportable.length > 0 && exportable.every((i) => itemSumOk(i) && i.planStatus === "ready");

  useEffect(() => {
    void Promise.all((['ERP1', 'ERP2'] as const).map(async (erp) => {
      const response = await fetch(`/api/item-creation/stock/options?erp=${erp}`, { cache: "no-store" });
      if (!response.ok) return [] as Array<{ name: string; label: string }>;
      const data = (await response.json()) as { suppliers?: Array<{ name?: string; label?: string }> };
      return (data.suppliers ?? []).flatMap((supplier) =>
        supplier.name || supplier.label
          ? [{ name: supplier.name || supplier.label!, label: supplier.label || supplier.name! }]
          : [],
      );
    })).then((supplierLists) => {
      const unique = new Map<string, { name: string; label: string }>();
      for (const supplier of supplierLists.flat()) unique.set(supplier.name, supplier);
      setPrSuppliers([...unique.values()].sort((a, b) => a.label.localeCompare(b.label)));
    }).catch(() => setPrSuppliers([]));
  }, []);

  useEffect(() => {
    if (!focusSku) return;
    const el = rowRefs.current.get(focusSku);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusSku, items.length]);

  useEffect(() => {
    if (!walkOpen) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setWalkIndex((i) => clampWalkthroughIndex(i + 1, walkSteps.length));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setWalkIndex((i) => clampWalkthroughIndex(i - 1, walkSteps.length));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walkOpen, walkSteps.length]);

  function addOrFocusItem(raw: LookupItem) {
    const companyReorderQty = raw.companyReorderQty ?? 0;
    const itemStatusCategory = raw.itemStatusCategory ?? "UNCATEGORIZED";
    const itemStatusLabel = raw.itemStatusLabel ?? null;
    const needsContinue = itemStatusCategory === "DISCONTINUE";
    setItems((prev) => {
      const existing = prev.find((p) => p.sku === raw.sku);
      if (existing) {
        setFocusSku(raw.sku);
        notify.info("Item already on the list");
        return prev;
      }
      if (prev.length >= MAX_STORE_ALLOCATION_SESSION_ITEMS) {
        notify.error(`Maximum ${MAX_STORE_ALLOCATION_SESSION_ITEMS} items per session`);
        return prev;
      }
      const next: SessionItem = {
        sku: raw.sku,
        barcode: raw.barcode,
        description: raw.description,
        priorityErp1: raw.priorityErp1,
        priorityErp2: raw.priorityErp2,
        companyReorderQty,
        itemStatusCategory,
        itemStatusLabel,
        needsContinue,
        takeQty: null,
        locations: [],
        shortShipment: false,
        erpAvailable: true,
        planStatus: "idle",
      };
      setFocusSku(raw.sku);
      return [...prev, next];
    });
    setMatches([]);
    setQ("");
  }

  async function continueDiscontinued(sku: string) {
    setContinuingSku(sku);
    try {
      const res = await fetch("/api/admin/store-allocation/continue-discontinued", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Could not continue item");
      }
      const data = (await res.json()) as {
        itemStatusCategory: string;
        itemStatusLabel: string | null;
      };
      setItems((prev) =>
        prev.map((item) =>
          item.sku === sku
            ? {
                ...item,
                needsContinue: false,
                itemStatusCategory: data.itemStatusCategory,
                itemStatusLabel: data.itemStatusLabel,
              }
            : item,
        ),
      );
      notify.success("Status set to Newly Added — enter take qty");
      setFocusSku(sku);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Could not continue item");
    } finally {
      setContinuingSku(null);
    }
  }

  async function runLookup(raw: string) {
    const query = raw.trim();
    if (!query) return;
    const now = Date.now();
    if (now - lastScanAt.current < 400) return;
    lastScanAt.current = now;

    setLookupLoading(true);
    setMatches([]);
    try {
      const res = await fetch(
        `/api/admin/store-allocation/lookup?q=${encodeURIComponent(query)}`,
      );
      if (!res.ok) throw new Error("Lookup failed");
      const data = (await res.json()) as {
        item?: LookupItem | null;
        matches?: LookupItem[];
      };
      if (data.item) {
        addOrFocusItem({
          ...data.item,
          companyReorderQty: data.item.companyReorderQty ?? 0,
        });
      } else {
        setMatches(Array.isArray(data.matches) ? data.matches : []);
        if (!data.matches?.length) notify.error("No item found for that code");
      }
    } catch {
      notify.error("Could not look up item");
    } finally {
      setLookupLoading(false);
    }
  }

  function selectMatch(m: LookupItem) {
    void (async () => {
      setLookupLoading(true);
      try {
        const res = await fetch(
          `/api/admin/store-allocation/lookup?q=${encodeURIComponent(m.sku)}`,
        );
        if (!res.ok) throw new Error("Lookup failed");
        const data = (await res.json()) as { item?: LookupItem | null };
        if (data.item) {
          addOrFocusItem({
            ...data.item,
            companyReorderQty: data.item.companyReorderQty ?? 0,
          });
        }
      } catch {
        notify.error("Could not load item");
      } finally {
        setLookupLoading(false);
      }
    })();
  }

  function removeItem(sku: string) {
    setItems((prev) => prev.filter((i) => i.sku !== sku));
    const t = planTimers.current.get(sku);
    if (t) clearTimeout(t);
    planTimers.current.delete(sku);
  }

  function clearAll() {
    for (const t of planTimers.current.values()) clearTimeout(t);
    planTimers.current.clear();
    setItems([]);
    setFocusSku(null);
    setMatches([]);
    setWalkOpen(false);
    setAllocationConfirmed(false);
    setPrSupplier("");
    setPrRows([]);
    setCreatedReceipts([]);
    setWalkIndex(0);
  }

  function setTakeQty(sku: string, raw: string) {
    setAllocationConfirmed(false);
    const trimmed = raw.trim();
    const takeQty =
      trimmed === ""
        ? null
        : Number.isFinite(Number(trimmed))
          ? Math.max(0, Math.floor(Number(trimmed)))
          : null;

    setItems((prev) =>
      prev.map((item) => {
        if (item.sku !== sku) return item;
        if (takeQty == null || takeQty === 0) {
          return {
            ...item,
            takeQty,
            locations: [],
            shortShipment: false,
            planStatus: "idle",
          };
        }
        return { ...item, takeQty, planStatus: "loading" };
      }),
    );

    const existing = planTimers.current.get(sku);
    if (existing) clearTimeout(existing);
    if (takeQty == null || takeQty === 0) return;

    planTimers.current.set(
      sku,
      setTimeout(() => {
        void loadPlan(sku, takeQty);
      }, 250),
    );
  }

  async function loadPlan(sku: string, qty: number) {
    setItems((prev) =>
      prev.map((i) => (i.sku === sku ? { ...i, planStatus: "loading" } : i)),
    );
    try {
      const params = new URLSearchParams({ sku, takeQty: String(qty) });
      const res = await fetch(`/api/admin/store-allocation/plan?${params}`);
      if (!res.ok) throw new Error("Plan failed");
      const data = (await res.json()) as {
        companyReorderQty: number;
        shortShipment: boolean;
        erpAvailable?: boolean;
        locations: Array<Omit<SessionLocationQty, "qty"> & { suggestedQty: number }>;
      };
      setItems((prev) =>
        prev.map((i) => {
          if (i.sku !== sku) return i;
          if (i.takeQty !== qty) return i;
          return {
            ...i,
            companyReorderQty: data.companyReorderQty,
            shortShipment: Boolean(data.shortShipment),
            erpAvailable: data.erpAvailable !== false,
            planStatus: "ready",
            locations: (data.locations ?? []).map((l) => ({
              ...l,
              qty: l.suggestedQty,
            })),
          };
        }),
      );
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.sku === sku ? { ...i, planStatus: "error" } : i)),
      );
      notify.error(`Could not build plan for ${sku}`);
    }
  }

  function setItemLocationQty(sku: string, columnKey: string, raw: string) {
    const n = Number(raw);
    const qty = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    setItems((prev) =>
      prev.map((item) => {
        if (item.sku !== sku) return item;
        return {
          ...item,
          locations: item.locations.map((l) =>
            l.columnKey === columnKey ? { ...l, qty } : l,
          ),
        };
      }),
    );
  }

  function removeCompany(company: string) {
    setItems((prev) => prev.map((item) => {
      const remaining = item.locations.filter((location) => allocationCompany(location) !== company);
      const suggestions = item.takeQty && remaining.length > 0
        ? new Map(allocateTakeQty(item.takeQty, remaining.map((location) => ({
            key: location.columnKey,
            need: location.need,
            sales: location.sales90d,
            priority: location.allocationPriority ?? 2,
          }))).map((allocation) => [allocation.key, allocation.qty]))
        : new Map<string, number>();
      return {
        ...item,
        locations: remaining.map((location) => ({
          ...location,
          qty: suggestions.get(location.columnKey) ?? 0,
          suggestedQty: suggestions.get(location.columnKey) ?? 0,
        })),
      };
    }));
    setPrRows((current) => current.filter((row) => {
      const location = items.flatMap((item) => item.locations).find((candidate) => candidate.columnKey === row.columnKey);
      return !location || allocationCompany(location) !== company;
    }));
  }

  function openWalkthrough() {
    const steps = buildNonEmptyLocationSteps(items);
    if (steps.length === 0) {
      notify.error("Enter take qtys and wait for plans before walking locations");
      return;
    }
    setWalkIndex(0);
    setWalkOpen(true);
  }

  function confirmAllocation() {
    if (!allExportValid) {
      notify.error("Each item's location quantities must sum to its take qty");
      return;
    }
    const rows: PrWarehouseRow[] = [];
    for (const item of exportable) {
      for (const location of item.locations) {
        const warehouse = location.warehouses[0] ?? "";
        rows.push({ id: `${item.sku}:${location.columnKey}:0`, sku: item.sku, columnKey: location.columnKey, warehouse, qty: location.qty });
      }
    }
    setPrRows(rows);
    setCreatedReceipts([]);
    setAllocationConfirmed(true);
    setWalkOpen(false);
    notify.success("Allocation confirmed. Review Purchase Receipts below.");
  }

  async function createAllocationPurchaseReceipts() {
    if (!allocationConfirmed || !prSupplier.trim()) {
      notify.error("Enter a supplier and confirm the allocation first");
      return;
    }
    const supplierId = prSuppliers.find((supplier) => supplier.label === prSupplier || supplier.name === prSupplier)?.name ?? prSupplier;
    const payload = prRows.filter((row) => row.qty > 0).flatMap((row) => {
      const item = exportable.find((candidate) => candidate.sku === row.sku);
      const location = item?.locations.find((candidate) => candidate.columnKey === row.columnKey);
      return item && location && row.warehouse ? [{ sku: item.sku, qty: row.qty, warehouse: row.warehouse, erpInstanceId: location.erpnextInstanceId, company: allocationCompany(location) }] : [];
    });
    if (payload.length === 0) {
      notify.error("Add a quantity to at least one warehouse");
      return;
    }
    if (payload.some((row) => !row.warehouse || !row.erpInstanceId)) {
      notify.error("Every allocated location needs a warehouse and ERP instance");
      return;
    }
    setCreatingPr(true);
    try {
      const res = await fetch("/api/admin/store-allocation/purchase-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier: supplierId, items: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Purchase Receipt creation failed");
      const receipts = Array.isArray(data.receipts) ? data.receipts.map(String) : [];
      setCreatedReceipts(receipts);
      notify.success(`${receipts.length} Purchase Receipt(s) created`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Purchase Receipt creation failed");
    } finally {
      setCreatingPr(false);
    }
  }

  function updatePrRow(id: string, patch: Partial<PrWarehouseRow>) {
    setPrRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function recalculatePrAllocations(nextRows: PrWarehouseRow[]) {
    const allocationsByItem = new Map<string, Map<string, number>>();
    const nextItems = items.map((item) => {
      const activeKeys = new Set(nextRows.filter((row) => row.sku === item.sku).map((row) => row.columnKey));
      const allocations = allocateTakeQty(item.takeQty ?? 0, item.locations.filter((location) => activeKeys.has(location.columnKey)).map((location) => ({
        key: location.columnKey,
        need: location.need,
        sales: location.sales90d,
        priority: location.allocationPriority ?? 2,
      })));
      const next = new Map(allocations.map((allocation) => [allocation.key, allocation.qty]));
      allocationsByItem.set(item.sku, next);
      return { ...item, locations: item.locations.map((location) => ({ ...location, qty: next.get(location.columnKey) ?? 0, suggestedQty: next.get(location.columnKey) ?? 0 })) };
    });
    const assigned = new Set<string>();
    const nextPrRows = nextRows.map((row) => {
      const allocation = allocationsByItem.get(row.sku)?.get(row.columnKey);
      if (allocation == null) return row;
      const key = `${row.sku}:${row.columnKey}`;
      if (assigned.has(key)) return { ...row, qty: 0 };
      assigned.add(key);
      return { ...row, qty: allocation };
    });
    setItems(nextItems);
    setPrRows(nextPrRows);
  }

  function addItemsToWarehouse(warehouse: string, company?: string) {
    const additions: PrWarehouseRow[] = [];
    for (const item of exportable) {
      for (const location of item.locations) {
        if (!location.warehouses.includes(warehouse)) continue;
        if (company && allocationCompany(location) !== company) continue;
        if (prRows.some((row) => row.sku === item.sku && row.warehouse === warehouse)) continue;
        additions.push({ id: `${item.sku}:${warehouse}:${Date.now()}:${additions.length}`, sku: item.sku, columnKey: location.columnKey, warehouse, qty: 0 });
      }
    }
    if (additions.length === 0) {
      notify.info("All session items are already available in this warehouse");
      return;
    }
    recalculatePrAllocations([...prRows, ...additions]);
  }

  function addWarehouse(warehouse: string) {
    addItemsToWarehouse(warehouse);
  }

  function removePrRow(row: PrWarehouseRow) {
    const nextRows = prRows.filter((candidate) => candidate.id !== row.id);
    recalculatePrAllocations(nextRows);
  }

  async function exportXlsx() {
    if (!allExportValid) {
      notify.error("Each item's location quantities must sum to its take qty");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/admin/store-allocation/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: exportable.map((item) => ({
            sku: item.sku,
            description: item.description,
            barcode: item.barcode,
            companyReorderQty: item.companyReorderQty,
            takeQty: item.takeQty!,
            locations: item.locations.map((l) => ({
              columnKey: l.columnKey,
              label: l.label,
              locationRop: l.locationRop,
              stock: l.stock,
              qty: l.qty,
            })),
          })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Export failed");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? "store-allocation-multi.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      notify.success("Allocation exported");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function printPlan() {
    if (!allExportValid) {
      notify.error("Each item's location quantities must sum to its take qty");
      return;
    }
    window.print();
  }

  return (
    <div className="space-y-4">
      <div className="max-w-2xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Store location allocation</h1>
        <p className="text-sm text-muted-foreground">
          Scan several SKUs/barcodes, enter take qty per item, then walk locations one at a time
          (arrow keys). Export or print — stock transfers are not created automatically.
        </p>
      </div>

      <form
        className="flex max-w-xl flex-wrap gap-2 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          void runLookup(q);
        }}
      >
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={q}
            placeholder="SKU or barcode (scanner OK)"
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <Button type="submit" disabled={lookupLoading}>
          {lookupLoading ? <Loader2 className="size-4 animate-spin" /> : "Add to list"}
        </Button>
      </form>

      {matches.length > 0 && (
        <ul className="max-w-xl rounded-md border divide-y print:hidden">
          {matches.map((m) => (
            <li key={m.sku}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => selectMatch(m)}
              >
                <span className="font-medium">{m.sku}</span>
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {m.description}
                  {m.barcode ? ` · ${m.barcode}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No items yet — scan or search to build the list (max {MAX_STORE_ALLOCATION_SESSION_ITEMS}).
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <p className="text-sm text-muted-foreground">
              {items.length} / {MAX_STORE_ALLOCATION_SESSION_ITEMS} items
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={walkSteps.length === 0}
              onClick={openWalkthrough}
            >
              <MapPinned className="size-4" />
              Walk locations
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!allExportValid}
              onClick={confirmAllocation}
            >
              Confirm allocation
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!allExportValid || exporting}
              onClick={() => void exportXlsx()}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Export Excel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!allExportValid}
              onClick={printPlan}
            >
              <Printer className="size-4" />
              Print
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearAll}>
              <Trash2 className="size-4" />
              Clear all
            </Button>
          </div>

          {allocationConfirmed && (
            <section className="rounded-xl border bg-card p-4 print:hidden">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Create Purchase Receipts</h2>
                  <p className="text-sm text-muted-foreground">
                    Review the confirmed quantities. Receipts are grouped by ERP company.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Add warehouse</span>
                    <select
                      className="h-9 min-w-56 rounded-md border bg-background px-2"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) addWarehouse(e.target.value);
                        e.target.value = "";
                      }}
                    >
                      <option value="">Add warehouse...</option>
                      {[...new Set(exportable.flatMap((item) => item.locations.flatMap((location) => location.warehouses)))].filter((warehouse) => !prRows.some((row) => row.warehouse === warehouse)).sort().map((warehouse) => <option key={warehouse} value={warehouse}>{warehouse}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Supplier</span>
                    <Input
                      list="store-allocation-suppliers"
                      value={prSupplier}
                      onChange={(e) => setPrSupplier(e.target.value)}
                      placeholder="Search supplier"
                    />
                    <datalist id="store-allocation-suppliers">
                      {prSuppliers.map((supplier) => <option key={supplier.name} value={supplier.label} label={supplier.name} />)}
                    </datalist>
                  </label>
                  <Button type="button" disabled={creatingPr || !prSupplier.trim()} onClick={() => void createAllocationPurchaseReceipts()}>
                    {creatingPr ? <Loader2 className="size-4 animate-spin" /> : null}
                    Create Purchase Receipts
                  </Button>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                {createdReceipts.length > 0 && (
                  <div className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                    <p className="font-medium">Purchase receipts created</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {createdReceipts.map((receipt) => <span key={receipt} className="text-emerald-700 dark:text-emerald-300">{receipt}</span>)}
                    </div>
                  </div>
                )}
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="px-2 py-2">Company</th><th className="px-2 py-2">SKU / item</th><th className="px-2 py-2">Reference</th><th className="px-2 py-2">Warehouse</th><th className="px-2 py-2">Qty</th></tr>
                  </thead>
                  <tbody>
                    {[...new Set(exportable.flatMap((item) => item.locations.map(allocationCompany)))].map((company) => {
                      const companyRows = exportable.flatMap((item) => item.locations.filter((location) => allocationCompany(location) === company).map((location) => ({ item, location })));
                      return (
                        <Fragment key={company}>
                          <tr className="border-b bg-muted/30">
                            <td className="px-2 py-2 font-semibold" colSpan={4}>{company}</td>
                            <td className="px-2 py-2 text-right">
                              <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                {(() => {
                                  const selectedWarehouses = [...new Set(prRows.filter((row) => companyRows.some(({ item, location }) => row.sku === item.sku && row.columnKey === location.columnKey)).map((row) => row.warehouse))];
                                  const hasMissingItems = selectedWarehouses.some((warehouse) => companyRows.some(({ item, location }) => location.warehouses.includes(warehouse) && !prRows.some((row) => row.sku === item.sku && row.warehouse === warehouse)));
                                  return (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={!hasMissingItems}
                                      onClick={() => selectedWarehouses.forEach((warehouse) => addItemsToWarehouse(warehouse, company))}
                                    >
                                      <Plus className="size-4" /> Add items
                                    </Button>
                                  );
                                })()}
                                <Button type="button" size="sm" variant="outline" onClick={() => removeCompany(company)}>Remove company</Button>
                              </div>
                            </td>
                          </tr>
                          {companyRows.map(({ item, location }) => prRows.filter((row) => row.sku === item.sku && row.columnKey === location.columnKey).map((row) => {
                            return (
                            <tr key={row.id} className="border-b last:border-0">
                              <td className="px-2 py-2 text-muted-foreground">{company}</td>
                              <td className="px-2 py-2 font-medium">{item.sku}<div className="text-xs text-muted-foreground">{item.description}</div></td>
                              <td className="px-2 py-2 text-xs text-muted-foreground">Barcode: {item.barcode || "-"}<br />ROP: {location.locationRop}<br />Stock: {location.stock}</td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={row.warehouse}
                                    onChange={(e) => updatePrRow(row.id, { warehouse: e.target.value })}
                                    className="h-9 min-w-64 rounded-md border bg-background px-2"
                                  >
                                    {location.warehouses.map((warehouse) => <option key={warehouse} value={warehouse}>{warehouse}</option>)}
                                  </select>
                                </div>
                              </td>
                              <td className="px-2 py-2"><div className="flex items-center gap-1"><Input type="number" min="0" value={row.qty} onChange={(e) => updatePrRow(row.id, { qty: Number(e.target.value) || 0 })} className="w-24" /><Button type="button" size="icon" variant="ghost" title="Remove item from warehouse" onClick={() => removePrRow(row)}><X className="size-4" /></Button></div></td>
                            </tr>
                            );
                          }))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="space-y-3">
            {items.map((item) => {
              const takeSafe = item.takeQty ?? 0;
              const allocatedSum = item.locations.reduce((s, l) => s + l.qty, 0);
              const totalRop = item.locations.reduce((s, l) => s + l.locationRop, 0);
              const totalStock = item.locations.reduce((s, l) => s + l.stock, 0);
              const hasLocationStats = item.locations.length > 0;
              const sumOk = itemSumOk(item);
              const isDiscontinueGate = item.needsContinue;

              return (
                <div
                  key={item.sku}
                  ref={(el) => {
                    rowRefs.current.set(item.sku, el);
                  }}
                  className={`rounded-xl border p-3 text-sm space-y-3 ${
                    isDiscontinueGate
                      ? "border-red-500 bg-red-50 text-red-950 ring-1 ring-red-500/30 dark:bg-red-950/45 dark:text-red-50 dark:ring-red-500/40"
                      : focusSku === item.sku
                        ? "ring-2 ring-primary/40"
                        : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid gap-1 sm:grid-cols-2 flex-1 min-w-[12rem]">
                      <div>
                        <p
                          className={`text-xs ${isDiscontinueGate ? "text-red-700/80 dark:text-red-200/80" : "text-muted-foreground"}`}
                        >
                          SKU
                        </p>
                        <p className="font-medium">{item.sku}</p>
                      </div>
                      <div>
                        <p
                          className={`text-xs ${isDiscontinueGate ? "text-red-700/80 dark:text-red-200/80" : "text-muted-foreground"}`}
                        >
                          Priority
                        </p>
                        <p className="font-medium">{priorityLabel(item)}</p>
                      </div>
                      <div>
                        <p
                          className={`text-xs ${isDiscontinueGate ? "text-red-700/80 dark:text-red-200/80" : "text-muted-foreground"}`}
                        >
                          Barcode
                        </p>
                        <p className="font-medium">{item.barcode || "—"}</p>
                      </div>
                      <div>
                        <p
                          className={`text-xs ${isDiscontinueGate ? "text-red-700/80 dark:text-red-200/80" : "text-muted-foreground"}`}
                        >
                          TOTAL ORDER QTY
                        </p>
                        <p className="font-medium tabular-nums">{item.companyReorderQty}</p>
                      </div>
                      <div>
                        <p
                          className={`text-xs ${isDiscontinueGate ? "text-red-700/80 dark:text-red-200/80" : "text-muted-foreground"}`}
                        >
                          Total ROP
                        </p>
                        <p className="font-medium tabular-nums">
                          {hasLocationStats ? totalRop : "—"}
                        </p>
                      </div>
                      <div>
                        <p
                          className={`text-xs ${isDiscontinueGate ? "text-red-700/80 dark:text-red-200/80" : "text-muted-foreground"}`}
                        >
                          Stock qty
                        </p>
                        <p className="font-medium tabular-nums">
                          {hasLocationStats ? totalStock : "—"}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p
                          className={`text-xs ${isDiscontinueGate ? "text-red-700/80 dark:text-red-200/80" : "text-muted-foreground"}`}
                        >
                          Description
                        </p>
                        <p className="font-medium">{item.description || "—"}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p
                          className={`text-xs ${isDiscontinueGate ? "text-red-700/80 dark:text-red-200/80" : "text-muted-foreground"}`}
                        >
                          Status
                        </p>
                        <p className="font-medium">
                          {item.itemStatusLabel ?? item.itemStatusCategory}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={`print:hidden ${isDiscontinueGate ? "text-red-800 hover:bg-red-100 hover:text-red-950 dark:text-red-100 dark:hover:bg-red-900/50 dark:hover:text-white" : ""}`}
                      onClick={() => removeItem(item.sku)}
                      aria-label={`Remove ${item.sku}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {isDiscontinueGate ? (
                    <div className="flex flex-wrap items-center gap-3 print:hidden">
                      <p className="text-sm text-red-800/90 dark:text-red-100/90">
                        Discontinued — continue to allocate as Newly Added
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-red-600 text-white hover:bg-red-500"
                        disabled={continuingSku === item.sku}
                        onClick={() => void continueDiscontinued(item.sku)}
                      >
                        {continuingSku === item.sku ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Continue
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-end gap-3 print:hidden">
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Take qty</span>
                        <Input
                          className="w-28"
                          type="number"
                          min={0}
                          step={1}
                          value={item.takeQty == null ? "" : item.takeQty}
                          placeholder="0"
                          onChange={(e) => setTakeQty(item.sku, e.target.value)}
                        />
                      </label>
                      {takeSafe > item.companyReorderQty && item.companyReorderQty > 0 && (
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                          Above TOTAL ORDER QTY ({item.companyReorderQty})
                        </p>
                      )}
                      {item.shortShipment && (
                        <p className="text-sm text-muted-foreground">Short shipment</p>
                      )}
                      {!item.erpAvailable && item.planStatus === "ready" && (
                        <p className="text-sm text-destructive">ERP stock unavailable</p>
                      )}
                      {item.planStatus === "loading" && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" /> Planning…
                        </span>
                      )}
                      {item.planStatus === "error" && (
                        <p className="text-sm text-destructive">Plan failed</p>
                      )}
                      {item.planStatus === "ready" && (
                        <p
                          className={`text-sm ${sumOk ? "text-muted-foreground" : "text-destructive"}`}
                        >
                          Allocated {allocatedSum} / take {takeSafe}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Print-only detail */}
          <div className="hidden print:block space-y-4">
            {exportable.map((item) => (
              <div key={`print-${item.sku}`}>
                <h2 className="font-semibold">
                  {item.sku} — take {item.takeQty}
                </h2>
                <ul className="text-sm">
                  {item.locations
                    .filter((l) => l.qty > 0)
                    .map((l) => (
                      <li key={l.columnKey}>
                        {l.label}: {l.qty}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <Sheet open={walkOpen} onOpenChange={setWalkOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-3xl overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Location walkthrough</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {currentStep ? (
              <StoreAllocationLocationStep
                step={{ ...currentStep, index: safeWalkIndex, total: walkSteps.length }}
                canPrev={safeWalkIndex > 0}
                canNext={safeWalkIndex < walkSteps.length - 1}
                onPrev={() =>
                  setWalkIndex((i) => clampWalkthroughIndex(i - 1, walkSteps.length))
                }
                onNext={() =>
                  setWalkIndex((i) => clampWalkthroughIndex(i + 1, walkSteps.length))
                }
                onQtyChange={(sku, raw) =>
                  setItemLocationQty(sku, currentStep.columnKey, raw)
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">No locations with qty to walk.</p>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" onClick={confirmAllocation} disabled={!allExportValid}>
              Confirm allocation and review PRs
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
