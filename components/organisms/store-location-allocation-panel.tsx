"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Printer, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type LookupItem = {
  sku: string;
  barcode: string | null;
  description: string;
  priorityErp1?: string | null;
  priorityErp2?: string | null;
  companyReorderQty?: number;
};

type PlanLocation = {
  columnKey: string;
  label: string;
  locationRop: number;
  stock: number;
  need: number;
  sales30d: number;
  suggestedQty: number;
  qty: number;
};

export function StoreLocationAllocationPanel() {
  const [q, setQ] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [item, setItem] = useState<LookupItem | null>(null);
  const [matches, setMatches] = useState<LookupItem[]>([]);
  const [takeQty, setTakeQty] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [locations, setLocations] = useState<PlanLocation[]>([]);
  const [companyReorderQty, setCompanyReorderQty] = useState(0);
  const [shortShipment, setShortShipment] = useState(false);
  const [erpAvailable, setErpAvailable] = useState(true);
  const [exporting, setExporting] = useState(false);
  const lastScanAt = useRef(0);
  const planTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const takeNum = Number(takeQty);
  const takeSafe = Number.isFinite(takeNum) ? Math.max(0, Math.floor(takeNum)) : 0;
  const allocatedSum = locations.reduce((s, l) => s + l.qty, 0);
  const sumOk = locations.length > 0 && allocatedSum === takeSafe;

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
        setItem({
          ...data.item,
          companyReorderQty: data.item.companyReorderQty ?? 0,
        });
        setCompanyReorderQty(data.item.companyReorderQty ?? 0);
        setLocations([]);
        setTakeQty("");
      } else {
        setItem(null);
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
          setItem(data.item);
          setCompanyReorderQty(data.item.companyReorderQty ?? 0);
          setMatches([]);
          setLocations([]);
          setTakeQty("");
        }
      } catch {
        notify.error("Could not load item");
      } finally {
        setLookupLoading(false);
      }
    })();
  }

  useEffect(() => {
    if (!item?.sku) return;
    if (planTimer.current) clearTimeout(planTimer.current);
    planTimer.current = setTimeout(() => {
      void loadPlan(item.sku, takeSafe);
    }, 250);
    return () => {
      if (planTimer.current) clearTimeout(planTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional debounce on take
  }, [item?.sku, takeSafe]);

  async function loadPlan(sku: string, qty: number) {
    setPlanLoading(true);
    try {
      const params = new URLSearchParams({
        sku,
        takeQty: String(qty),
      });
      const res = await fetch(`/api/admin/store-allocation/plan?${params}`);
      if (!res.ok) throw new Error("Plan failed");
      const data = (await res.json()) as {
        companyReorderQty: number;
        shortShipment: boolean;
        erpAvailable?: boolean;
        locations: Array<Omit<PlanLocation, "qty"> & { suggestedQty: number }>;
      };
      setCompanyReorderQty(data.companyReorderQty);
      setShortShipment(Boolean(data.shortShipment));
      setErpAvailable(data.erpAvailable !== false);
      setLocations(
        (data.locations ?? []).map((l) => ({
          ...l,
          qty: l.suggestedQty,
        })),
      );
    } catch {
      notify.error("Could not build location plan");
    } finally {
      setPlanLoading(false);
    }
  }

  function setQty(columnKey: string, raw: string) {
    const n = Number(raw);
    const qty = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    setLocations((prev) =>
      prev.map((l) => (l.columnKey === columnKey ? { ...l, qty } : l)),
    );
  }

  async function exportXlsx() {
    if (!item || !sumOk) {
      notify.error("Location quantities must sum to take qty");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/admin/store-allocation/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: item.sku,
          description: item.description,
          barcode: item.barcode,
          companyReorderQty,
          takeQty: takeSafe,
          locations: locations.map((l) => ({
            columnKey: l.columnKey,
            label: l.label,
            qty: l.qty,
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
      const filename = match?.[1] ?? "store-allocation.xlsx";
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
    if (!sumOk) {
      notify.error("Location quantities must sum to take qty");
      return;
    }
    window.print();
  }

  const priorityLabel =
    [item?.priorityErp1, item?.priorityErp2].filter(Boolean).join(" / ") || "—";

  return (
    <div className="space-y-4">
      <div className="max-w-xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Store location allocation</h1>
        <p className="text-sm text-muted-foreground">
          Scan or search a SKU/barcode, enter how many units to take, and split across OSF ROP
          locations. Export or print the plan — stock transfers are not created automatically.
        </p>
      </div>

      <form
        className="flex max-w-xl flex-wrap gap-2"
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
          {lookupLoading ? <Loader2 className="size-4 animate-spin" /> : "Look up"}
        </Button>
      </form>

      {matches.length > 0 && (
        <ul className="max-w-xl rounded-md border divide-y">
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

      {item && (
        <div className="space-y-4 print:space-y-2">
          <div className="rounded-md border p-4 text-sm grid gap-2 sm:grid-cols-2 print:border-0 print:p-0">
            <div>
              <p className="text-xs text-muted-foreground">Priority</p>
              <p className="font-medium">{priorityLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">SKU</p>
              <p className="font-medium">{item.sku}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Barcode</p>
              <p className="font-medium">{item.barcode || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Company reorder qty (TOTAL ORDER QTY)</p>
              <p className="font-medium tabular-nums">{companyReorderQty}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="font-medium">{item.description || "—"}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 print:hidden">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Take qty (how much we take now)</span>
              <Input
                className="w-32"
                type="number"
                min={0}
                step={1}
                value={takeQty}
                placeholder="0"
                onChange={(e) => setTakeQty(e.target.value)}
              />
            </label>
            {takeSafe > companyReorderQty && companyReorderQty > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Take qty is above company TOTAL ORDER QTY ({companyReorderQty}).
              </p>
            )}
            {shortShipment && (
              <p className="text-sm text-muted-foreground">
                Short shipment — split uses need × (1 + sales).
              </p>
            )}
            {!erpAvailable && (
              <p className="text-sm text-destructive">
                ERP stock unavailable — stock treated as 0 for need.
              </p>
            )}
            {planLoading && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Updating plan…
              </span>
            )}
          </div>

          {locations.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-md border print:border">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2">Location</th>
                      <th className="p-2">ROP</th>
                      <th className="p-2">Stock</th>
                      <th className="p-2">Need</th>
                      <th className="p-2">Sales 30d</th>
                      <th className="p-2">Suggested</th>
                      <th className="p-2">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((l) => (
                      <tr key={l.columnKey} className="border-t">
                        <td className="p-2 font-medium">{l.label}</td>
                        <td className="p-2 tabular-nums">{l.locationRop}</td>
                        <td className="p-2 tabular-nums">{l.stock}</td>
                        <td className="p-2 tabular-nums">{l.need}</td>
                        <td className="p-2 tabular-nums">{l.sales30d}</td>
                        <td className="p-2 tabular-nums">{l.suggestedQty}</td>
                        <td className="p-2">
                          <Input
                            className="h-8 w-20 print:border-0"
                            type="number"
                            min={0}
                            value={l.qty || ""}
                            onChange={(e) => setQty(l.columnKey, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3 print:hidden">
                <p
                  className={`text-sm ${sumOk ? "text-muted-foreground" : "text-destructive"}`}
                >
                  Allocated {allocatedSum} / take {takeSafe}
                  {!sumOk ? " — must match to export" : ""}
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={!sumOk || exporting}
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
                  disabled={!sumOk}
                  onClick={printPlan}
                >
                  <Printer className="size-4" />
                  Print
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
