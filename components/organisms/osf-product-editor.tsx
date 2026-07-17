"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type ColumnMeta = { key: string; label: string; includeInRop: boolean; active: boolean };

type ProfileItem = {
  sku: string;
  productTitle: string;
  brand: string | null;
  shopAvailability: string | null;
  ogfPrice: number | null;
  rops: Record<string, number>;
};

type Props = { canManage: boolean };

export function OsfProductEditor({ canManage }: Props) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProfileItem[]>([]);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [selected, setSelected] = useState<ProfileItem | null>(null);
  const [shopAvailability, setShopAvailability] = useState<string>("");
  const [ogfPrice, setOgfPrice] = useState<string>("");
  const [rops, setRops] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ropColumns = columns.filter((c) => c.active && c.includeInRop);

  useEffect(() => {
    fetch("/api/admin/osf/columns")
      .then((r) => r.json())
      .then((j) => setColumns(j.columns ?? []))
      .catch(() => undefined);
  }, []);

  async function search() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/osf/profiles?q=${encodeURIComponent(q)}&limit=30`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setItems(json.items ?? []);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function selectItem(item: ProfileItem) {
    setSelected(item);
    setShopAvailability(item.shopAvailability ?? "");
    setOgfPrice(item.ogfPrice != null ? String(item.ogfPrice) : "");
    const next: Record<string, string> = {};
    for (const col of ropColumns) {
      next[col.key] = item.rops[col.key] != null ? String(item.rops[col.key]) : "";
    }
    setRops(next);
  }

  async function save() {
    if (!canManage || !selected) return;
    setSaving(true);
    try {
      const ropsPayload: Record<string, number | null> = {};
      for (const [key, val] of Object.entries(rops)) {
        const trimmed = val.trim();
        if (trimmed === "") ropsPayload[key] = null;
        else ropsPayload[key] = Math.max(0, Math.floor(Number(trimmed)) || 0);
      }
      const ogfTrimmed = ogfPrice.trim();
      const res = await fetch(`/api/admin/osf/profiles/${encodeURIComponent(selected.sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopAvailability: shopAvailability === "" ? null : shopAvailability,
          ogfPrice: ogfTrimmed === "" ? null : Number(ogfTrimmed),
          rops: ropsPayload,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      notify.success(`Saved OSF profile for ${selected.sku}`);
      setSelected({
        ...selected,
        shopAvailability: json.shopAvailability,
        ogfPrice: json.ogfPrice,
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
          Shop Availability, per-column ROP, and independent OGF Price (not LWK).
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search SKU or title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
        />
        <Button type="button" variant="outline" onClick={() => void search()} disabled={loading}>
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
                  disabled={!canManage}
                  value={shopAvailability}
                  onChange={(e) => setShopAvailability(e.target.value)}
                >
                  <option value="">— blank —</option>
                  <option value="allowed">Allowed</option>
                  <option value="not_allowed">Not Allowed</option>
                </select>
              </label>
              <label className="block text-xs font-medium">
                OGF Price
                <Input
                  type="number"
                  step="0.01"
                  className="mt-1"
                  disabled={!canManage}
                  value={ogfPrice}
                  placeholder="Independent of LWK"
                  onChange={(e) => setOgfPrice(e.target.value)}
                />
              </label>
              <div className="space-y-2">
                <div className="text-xs font-medium">ROP by column</div>
                {ropColumns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No ROP columns configured. Add them under Column mapping.
                  </p>
                ) : (
                  ropColumns.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 truncate">{col.label}</span>
                      <Input
                        type="number"
                        className="h-8"
                        disabled={!canManage}
                        value={rops[col.key] ?? ""}
                        onChange={(e) => setRops({ ...rops, [col.key]: e.target.value })}
                      />
                    </label>
                  ))
                )}
              </div>
              {canManage && (
                <Button type="button" onClick={() => void save()} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save profile
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
