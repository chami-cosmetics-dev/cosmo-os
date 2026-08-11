"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, MapPinned, Printer, Search, Trash2 } from "lucide-react";

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

function priorityLabel(item: SessionItem) {
  return [item.priorityErp1, item.priorityErp2].filter(Boolean).join(" / ") || "—";
}

function itemSumOk(item: SessionItem): boolean {
  if (item.takeQty == null || item.takeQty <= 0) return true;
  if (item.planStatus !== "ready" || item.locations.length === 0) return false;
  const sum = item.locations.reduce((s, l) => s + l.qty, 0);
  return sum === item.takeQty;
}

export function StoreLocationAllocationPanel() {
  const [q, setQ] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [matches, setMatches] = useState<LookupItem[]>([]);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [focusSku, setFocusSku] = useState<string | null>(null);
  const [continuingSku, setContinuingSku] = useState<string | null>(null);
  const [walkOpen, setWalkOpen] = useState(false);
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

  function setTakeQty(sku: string, raw: string) {
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

  function openWalkthrough() {
    const steps = buildNonEmptyLocationSteps(items);
    if (steps.length === 0) {
      notify.error("Enter take qtys and wait for plans before walking locations");
      return;
    }
    setWalkIndex(0);
    setWalkOpen(true);
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
          </div>

          <div className="space-y-3">
            {items.map((item) => {
              const takeSafe = item.takeQty ?? 0;
              const allocatedSum = item.locations.reduce((s, l) => s + l.qty, 0);
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
        </SheetContent>
      </Sheet>
    </div>
  );
}
