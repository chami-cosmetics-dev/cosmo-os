"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import {
  formatPercentPoints,
  sellingFromMargin,
  sellingMargin,
  supplierPriceChangePercent,
} from "@/lib/osf/pricing-math";

function formatMoneyInput(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function formatMarginInput(fraction: number): string {
  const pct = formatPercentPoints(fraction);
  return pct == null ? "" : String(pct);
}

type PricingItem = {
  sku: string;
  productTitle: string;
  brand: string | null;
  discountedPrice: number | null;
  mrp: number | null;
  latestCost: number | null;
  latestSupplier: string | null;
  costSource: string | null;
};

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_MIN_CHARS = 3;

export function PurchasingSkuCalculator() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PricingItem[]>([]);
  const [selected, setSelected] = useState<PricingItem | null>(null);
  const [sellingPrice, setSellingPrice] = useState("");
  const [marginPercent, setMarginPercent] = useState("");
  const [newSupplierPrice, setNewSupplierPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const searchSeq = useRef(0);

  async function runSearch(query: string, opts?: { notifyEmpty?: boolean }) {
    const trimmed = query.trim();
    const seq = ++searchSeq.current;
    if (trimmed.length < SEARCH_MIN_CHARS) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/purchasing/sku-pricing?q=${encodeURIComponent(trimmed)}`,
      );
      const json = await res.json();
      if (seq !== searchSeq.current) return;
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      const next = json.items ?? [];
      setItems(next);
      if (opts?.notifyEmpty && !next.length) notify.error("No SKUs found");
    } catch (err) {
      if (seq !== searchSeq.current) return;
      notify.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(q);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on q only
  }, [q]);

  function selectItem(item: PricingItem) {
    setSelected(item);
    const sell = item.discountedPrice;
    setSellingPrice(sell != null ? String(sell) : "");
    const m = sellingMargin(sell, item.latestCost);
    setMarginPercent(m != null ? formatMarginInput(m) : "");
    setNewSupplierPrice("");
  }

  function onSellingPriceChange(raw: string) {
    setSellingPrice(raw);
    const sellNum = raw.trim() === "" ? null : Number(raw);
    const m = sellingMargin(
      sellNum != null && Number.isFinite(sellNum) ? sellNum : null,
      selected?.latestCost ?? null,
    );
    setMarginPercent(m != null ? formatMarginInput(m) : "");
  }

  function onMarginPercentChange(raw: string) {
    setMarginPercent(raw);
    const pctNum = raw.trim() === "" ? null : Number(raw);
    if (pctNum == null || !Number.isFinite(pctNum)) {
      return;
    }
    const sell = sellingFromMargin(selected?.latestCost ?? null, pctNum / 100);
    if (sell != null) setSellingPrice(formatMoneyInput(sell));
  }

  const sellNum = sellingPrice.trim() === "" ? null : Number(sellingPrice);
  const margin = sellingMargin(
    sellNum != null && Number.isFinite(sellNum) ? sellNum : null,
    selected?.latestCost ?? null,
  );
  const marginPct = formatPercentPoints(margin);

  const newNum = newSupplierPrice.trim() === "" ? null : Number(newSupplierPrice);
  const change = supplierPriceChangePercent(
    selected?.latestCost ?? null,
    newNum != null && Number.isFinite(newNum) ? newNum : null,
  );
  const changePct = formatPercentPoints(change);
  const absDiff =
    selected?.latestCost != null && newNum != null && Number.isFinite(newNum)
      ? newNum - selected.latestCost
      : null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">SKU margin & price compare</h3>
        <p className="text-sm text-muted-foreground">
          Search a SKU, review purchase cost, check margin vs sell price, and compare a
          quoted supplier price (session only — not saved).
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Type at least 3 characters (SKU or title)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSearch(q, { notifyEmpty: true });
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void runSearch(q, { notifyEmpty: true })}
          disabled={loading}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Search
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Search to load catalog SKUs.</p>
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
                    <div className="font-mono text-xs">{item.sku}</div>
                    <div className="truncate text-muted-foreground">{item.productTitle}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4 rounded-md border p-3 text-sm">
          {!selected ? (
            <p className="text-muted-foreground">Select a SKU to calculate.</p>
          ) : (
            <>
              <div>
                <div className="font-mono text-xs">{selected.sku}</div>
                <div className="font-medium">{selected.productTitle}</div>
                {selected.brand && (
                  <div className="text-muted-foreground">Brand: {selected.brand}</div>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Purchase / cost
                </div>
                {selected.latestCost != null ? (
                  <p>
                    {selected.latestCost}
                    {selected.latestSupplier ? ` · ${selected.latestSupplier}` : ""}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    No purchase cost available (not invented).
                  </p>
                )}
              </div>

              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Selling / margin
                </p>
                <p className="text-xs text-muted-foreground">
                  Enter either sell price or margin % — the other updates from cost.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium">
                    Selling price
                    <Input
                      className="mt-1"
                      type="number"
                      step="any"
                      min="0"
                      value={sellingPrice}
                      onChange={(e) => onSellingPriceChange(e.target.value)}
                      placeholder={
                        selected.discountedPrice != null
                          ? String(selected.discountedPrice)
                          : "Enter sell price"
                      }
                    />
                  </label>
                  <label className="text-xs font-medium">
                    Margin %
                    <Input
                      className="mt-1"
                      type="number"
                      step="any"
                      value={marginPercent}
                      onChange={(e) => onMarginPercentChange(e.target.value)}
                      disabled={selected.latestCost == null}
                      placeholder={
                        selected.latestCost == null ? "Needs cost" : "e.g. 40"
                      }
                    />
                  </label>
                </div>
                <p>
                  Margin:{" "}
                  {marginPct != null ? (
                    <span className="font-medium">{marginPct}%</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {selected.latestCost == null
                        ? "unavailable (missing cost)"
                        : Number(marginPercent) >= 100
                          ? "margin must be under 100%"
                          : "enter a selling price or margin %"}
                    </span>
                  )}
                </p>
              </div>

              <div className="space-y-2 border-t pt-3">
                <label className="text-xs font-medium">
                  New supplier price (quote — not saved)
                  <Input
                    className="mt-1"
                    type="number"
                    step="any"
                    min="0"
                    value={newSupplierPrice}
                    onChange={(e) => setNewSupplierPrice(e.target.value)}
                    placeholder="Enter quoted price"
                  />
                </label>
                <p>
                  Change vs last:{" "}
                  {changePct != null ? (
                    <span className="font-medium">
                      {changePct > 0 ? "+" : ""}
                      {changePct}%
                      {absDiff != null ? ` (${absDiff > 0 ? "+" : ""}${absDiff})` : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {selected.latestCost == null
                        ? "unavailable (missing last price)"
                        : "enter a new price"}
                    </span>
                  )}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
