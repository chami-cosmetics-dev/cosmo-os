"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

export type BuyerRow = {
  name: string;
  brands: string[];
  sortOrder: number;
  active: boolean;
};

type Props = {
  canManage: boolean;
  initialBuyers?: BuyerRow[];
  brandOptions?: string[];
};

export function OsfBuyersSettings({ canManage, initialBuyers, brandOptions = [] }: Props) {
  const [buyers, setBuyers] = useState<BuyerRow[]>(initialBuyers ?? []);
  const [loading, setLoading] = useState(!initialBuyers);
  const [saving, setSaving] = useState(false);
  const brandListId = useId();

  useEffect(() => {
    if (initialBuyers) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/osf/buyers");
        if (!res.ok) throw new Error("Failed to load buyers");
        const json = (await res.json()) as { buyers: BuyerRow[] };
        if (!cancelled) setBuyers(json.buyers ?? []);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Failed to load buyers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialBuyers]);

  async function save() {
    if (!canManage) return;
    setSaving(true);
    try {
      const payload = {
        buyers: buyers
          .filter((b) => b.name.trim())
          .map((b) => ({
            name: b.name.trim(),
            brands: b.brands.map((x) => x.trim()).filter(Boolean),
            sortOrder: b.sortOrder,
            active: b.active,
          })),
      };
      const res = await fetch("/api/admin/osf/buyers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setBuyers(json.buyers ?? buyers);
      notify.success("Buyer sheets saved");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function addRow() {
    setBuyers([
      ...buyers,
      { name: "", brands: [], sortOrder: (buyers.length + 1) * 10, active: true },
    ]);
  }

  function update(idx: number, patch: Partial<BuyerRow>) {
    const next = [...buyers];
    next[idx] = { ...next[idx]!, ...patch };
    setBuyers(next);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading buyers…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">Buyer sheets</h3>
          <p className="text-sm text-muted-foreground">
            Each buyer becomes its own sheet in the workbook (no pricing columns), showing only
            their assigned brands. Leave brands empty to include the full catalog.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" /> Add
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        )}
      </div>

      <datalist id={brandListId}>
        {brandOptions.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Buyer / sheet name</th>
              <th className="p-2">Brands (comma-separated; blank = all)</th>
              <th
                className="p-2"
                title="Left-to-right order of the buyer sheets (lower = earlier)"
              >
                Sheet order
              </th>
              <th className="p-2">Active</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {buyers.map((b, idx) => (
              <tr key={idx} className="border-t">
                <td className="p-2">
                  <Input
                    value={b.name}
                    disabled={!canManage}
                    className="h-8"
                    placeholder="e.g. Randil"
                    onChange={(e) => update(idx, { name: e.target.value })}
                  />
                </td>
                <td className="p-2">
                  <Input
                    value={b.brands.join(", ")}
                    disabled={!canManage}
                    className="h-8"
                    list={brandListId}
                    placeholder="Cantu, Maui, … (blank = all brands)"
                    onChange={(e) =>
                      update(idx, {
                        brands: e.target.value.split(",").map((x) => x.trimStart()),
                      })
                    }
                    onBlur={(e) =>
                      update(idx, {
                        brands: e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </td>
                <td className="p-2 w-24">
                  <Input
                    type="number"
                    value={b.sortOrder}
                    disabled={!canManage}
                    className="h-8"
                    onChange={(e) => update(idx, { sortOrder: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={b.active}
                    disabled={!canManage}
                    onChange={(e) => update(idx, { active: e.target.checked })}
                  />
                </td>
                <td className="p-2">
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setBuyers(buyers.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {buyers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                  No buyer sheets yet. Add one (e.g. Randil, Inoka) and assign their brands.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
