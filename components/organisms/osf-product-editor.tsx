"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { orderQty } from "@/lib/osf/formulas";

type ColumnMeta = { key: string; label: string; includeInRop: boolean; active: boolean };

type ProfileItem = {
  sku: string;
  productTitle: string;
  brand: string | null;
  shopAvailability: string | null;
  ogfPrice: number | null;
  reorderThresholdPercent: number | null;
  rops: Record<string, number>;
  stockPctOfRop?: number;
  totalStock?: number;
  totalRop?: number;
};

type Props = { canManage: boolean; canManageThreshold?: boolean };

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_MIN_CHARS = 3;

function parseRopInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Math.floor(Number(trimmed));
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

export function OsfProductEditor({ canManage, canManageThreshold = false }: Props) {
  const [q, setQ] = useState("");
  const [maxStockPct, setMaxStockPct] = useState("");
  const [items, setItems] = useState<ProfileItem[]>([]);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [selected, setSelected] = useState<ProfileItem | null>(null);
  const [shopAvailability, setShopAvailability] = useState<string>("");
  const [ogfPrice, setOgfPrice] = useState<string>("");
  const [thresholdPercent, setThresholdPercent] = useState<string>("");
  const [rops, setRops] = useState<Record<string, string>>({});
  /** Live ERP stock keyed by column — null value = no warehouse / unknown */
  const [stockByColumn, setStockByColumn] = useState<Record<string, number | null>>({});
  const [stockLoading, setStockLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchSeq = useRef(0);
  const stockSeq = useRef(0);

  const canEditAnything = canManage || canManageThreshold;
  const isBusy = loading || saving || stockLoading;
  const ropColumns = columns.filter((c) => c.active && c.includeInRop);

  useEffect(() => {
    fetch("/api/admin/osf/columns")
      .then((r) => r.json())
      .then((j) => setColumns(j.columns ?? []))
      .catch(() => undefined);
  }, []);

  async function runSearch(query: string, pctRaw: string) {
    const trimmed = query.trim();
    const pctTrim = pctRaw.trim();
    const seq = ++searchSeq.current;

    let maxPercent: number | null = null;
    if (pctTrim) {
      const n = Math.floor(Number(pctTrim));
      if (!Number.isFinite(n) || n < 1 || n > 100) {
        notify.error("Stock below % of ROP must be 1–100 or blank");
        return;
      }
      maxPercent = n;
    }

    if (maxPercent == null && trimmed.length < SEARCH_MIN_CHARS) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const url =
        maxPercent != null
          ? `/api/admin/osf/below-threshold?percent=${maxPercent}&limit=200${
              trimmed ? `&q=${encodeURIComponent(trimmed)}` : ""
            }`
          : `/api/admin/osf/profiles?q=${encodeURIComponent(trimmed)}&limit=30`;
      const res = await fetch(url);
      const json = await res.json();
      if (seq !== searchSeq.current) return;
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setItems(json.items ?? []);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      notify.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (maxStockPct.trim()) return;
      void runSearch(q, maxStockPct);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on q only when no % filter
  }, [q]);

  async function loadLiveStock(sku: string) {
    const seq = ++stockSeq.current;
    setStockLoading(true);
    setStockByColumn({});
    try {
      const res = await fetch(`/api/admin/osf/profiles/${encodeURIComponent(sku)}/stock`);
      const json = await res.json();
      if (seq !== stockSeq.current) return;
      if (!res.ok) throw new Error(json.error ?? "Failed to load ERP stock");
      setStockByColumn(json.stock ?? {});
    } catch (err) {
      if (seq !== stockSeq.current) return;
      setStockByColumn({});
      notify.error(err instanceof Error ? err.message : "Failed to load ERP stock");
    } finally {
      if (seq === stockSeq.current) setStockLoading(false);
    }
  }

  function selectItem(item: ProfileItem) {
    setSelected(item);
    setShopAvailability(item.shopAvailability ?? "");
    setOgfPrice(item.ogfPrice != null ? String(item.ogfPrice) : "");
    setThresholdPercent(
      item.reorderThresholdPercent != null ? String(item.reorderThresholdPercent) : "",
    );
    const next: Record<string, string> = {};
    for (const col of ropColumns) {
      next[col.key] = item.rops[col.key] != null ? String(item.rops[col.key]) : "";
    }
    setRops(next);
    void loadLiveStock(item.sku);
  }

  async function save() {
    if (!canEditAnything || !selected) return;
    setSaving(true);
    try {
      const thresholdTrimmed = thresholdPercent.trim();
      let reorderThresholdPercent: number | null | undefined = undefined;
      if (canManageThreshold || canManage) {
        if (thresholdTrimmed === "") reorderThresholdPercent = null;
        else {
          const n = Math.floor(Number(thresholdTrimmed));
          if (!Number.isFinite(n) || n < 1 || n > 100) {
            throw new Error("Reorder threshold must be 1–100 or blank (default 70)");
          }
          reorderThresholdPercent = n;
        }
      }

      const payload: Record<string, unknown> = {};
      if (canManage) {
        const ropsPayload: Record<string, number | null> = {};
        for (const [key, val] of Object.entries(rops)) {
          const trimmed = val.trim();
          if (trimmed === "") ropsPayload[key] = null;
          else ropsPayload[key] = Math.max(0, Math.floor(Number(trimmed)) || 0);
        }
        const ogfTrimmed = ogfPrice.trim();
        payload.shopAvailability = shopAvailability === "" ? null : shopAvailability;
        payload.ogfPrice = ogfTrimmed === "" ? null : Number(ogfTrimmed);
        payload.rops = ropsPayload;
      }
      if (reorderThresholdPercent !== undefined) {
        payload.reorderThresholdPercent = reorderThresholdPercent;
      }

      const res = await fetch(`/api/admin/osf/profiles/${encodeURIComponent(selected.sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      notify.success(`Saved OSF profile for ${selected.sku}`);
      setSelected({
        ...selected,
        shopAvailability: json.shopAvailability,
        ogfPrice: json.ogfPrice,
        reorderThresholdPercent: json.reorderThresholdPercent ?? null,
        rops: json.rops ?? {},
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium">Product OSF editor</h3>
        <p className="text-sm text-muted-foreground">
          Shop Availability, per-column ROP, OGF Price, and reorder threshold %. Enter a %
          to list SKUs that already have ROP and whose stock is below that share of ROP.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-[12rem] flex-1"
          placeholder="Type at least 3 characters (SKU or title)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSearch(q, maxStockPct);
          }}
        />
        <Input
          type="number"
          min={1}
          max={100}
          className="w-36"
          placeholder="Below % of ROP"
          value={maxStockPct}
          onChange={(e) => setMaxStockPct(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSearch(q, maxStockPct);
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void runSearch(q, maxStockPct)}
          disabled={loading}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Search
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {loading && items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {maxStockPct.trim()
                ? "Checking ERP stock against ROP…"
                : "Searching…"}
            </p>
          ) : items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {maxStockPct.trim()
                ? "No SKUs with assigned ROP below that % — click Search."
                : "Search to load catalog SKUs, or enter a % of ROP and Search."}
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {items.map((item) => (
                <li key={item.sku}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left hover:bg-muted/50 ${
                      selected?.sku === item.sku ? "bg-muted" : ""
                    }`}
                    onClick={() => selectItem(item)}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-mono text-xs">{item.sku}</div>
                      {item.stockPctOfRop != null ? (
                        <div className="shrink-0 text-[11px] text-muted-foreground">
                          {item.stockPctOfRop}% of ROP
                        </div>
                      ) : null}
                    </div>
                    <div className="truncate text-muted-foreground">{item.productTitle}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 rounded-md border p-3">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a SKU to edit.</p>
          ) : (
            <>
              <div>
                <div className="font-mono text-sm font-medium">{selected.sku}</div>
                <div className="text-sm text-muted-foreground">{selected.productTitle}</div>
              </div>
              <label className="block text-xs font-medium">
                Shop Availability
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                  disabled={!canManage || isBusy}
                  value={shopAvailability}
                  onChange={(e) => setShopAvailability(e.target.value)}
                >
                  <option value="">— blank —</option>
                  <option value="allowed">Allowed</option>
                  <option value="not_allowed">Not Allowed</option>
                </select>
              </label>
              <label className="block text-xs font-medium">
                OGF Price (LWK)
                <Input
                  type="number"
                  step="0.01"
                  className="mt-1"
                  disabled={!canManage || isBusy}
                  value={ogfPrice}
                  placeholder="From ERP OGF Price List"
                  onChange={(e) => setOgfPrice(e.target.value)}
                />
                <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                  Synced from Cosmo ERP OGF Price List. Online Cosmetics.lk price is separate.
                </span>
              </label>
              <label className="block text-xs font-medium">
                Reorder threshold % (blank = 70)
                <Input
                  type="number"
                  min={1}
                  max={100}
                  className="mt-1"
                  disabled={(!canManage && !canManageThreshold) || isBusy}
                  value={thresholdPercent}
                  placeholder="70"
                  onChange={(e) => setThresholdPercent(e.target.value)}
                />
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium">ROP by column</div>
                  {selected ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={stockLoading}
                      onClick={() => void loadLiveStock(selected.sku)}
                    >
                      {stockLoading ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="size-3.5" aria-hidden />
                      )}
                      Refresh stock
                    </Button>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Stock is live from Cosmo ERP Bin. Reorder qty = ROP − stock.
                </p>
                {ropColumns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No ROP columns configured. Enable “Set ROP” under OSF location columns.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="grid min-w-[20rem] grid-cols-[minmax(5rem,1fr)_4.5rem_4.5rem_4.5rem] gap-x-2 gap-y-1.5 text-xs">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Location
                      </div>
                      <div className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Stock
                      </div>
                      <div className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        ROP
                      </div>
                      <div className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Reorder
                      </div>
                      {ropColumns.map((col) => {
                        const hasStock = col.key in stockByColumn;
                        const stock = stockByColumn[col.key];
                        const ropNum = parseRopInput(rops[col.key] ?? "");
                        const reorder =
                          !hasStock || stock == null ? null : orderQty(ropNum, stock);
                        return (
                          <div key={col.key} className="contents">
                            <span className="truncate self-center" title={col.label}>
                              {col.label}
                            </span>
                            <span className="self-center text-center tabular-nums text-muted-foreground">
                              {stockLoading && !hasStock
                                ? "…"
                                : !hasStock || stock == null
                                  ? "—"
                                  : stock}
                            </span>
                            <Input
                              type="number"
                              className="h-8"
                              disabled={!canManage || isBusy}
                              value={rops[col.key] ?? ""}
                              onChange={(e) => setRops({ ...rops, [col.key]: e.target.value })}
                            />
                            <span
                              className={`self-center text-center tabular-nums ${
                                reorder != null && reorder > 0
                                  ? "font-medium text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {stockLoading && !hasStock ? "…" : reorder == null ? "—" : reorder}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {canEditAnything && (
                <Button type="button" onClick={() => void save()} disabled={isBusy}>
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Saving...
                    </>
                  ) : (
                    "Save profile"
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
