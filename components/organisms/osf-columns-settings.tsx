"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type LocationOption = { id: string; name: string; shortName: string | null };

type ColumnRow = {
  key: string;
  label: string;
  companyLocationId: string | null;
  erpnextInstanceId: string | null;
  directWarehouses: string[];
  warehouses?: string[];
  includeInStock: boolean;
  includeInRop: boolean;
  sortOrder: number;
  active: boolean;
};

type Props = {
  canManage: boolean;
  initialLocations?: LocationOption[];
};

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function OsfColumnsSettings({ canManage, initialLocations }: Props) {
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>(initialLocations ?? []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [colsRes, locRes] = await Promise.all([
          fetch("/api/admin/osf/columns"),
          initialLocations ? Promise.resolve(null) : fetch("/api/admin/company/locations"),
        ]);
        if (!colsRes.ok) throw new Error("Failed to load columns");
        const colsJson = (await colsRes.json()) as { columns: ColumnRow[] };
        if (!cancelled) {
          setColumns(
            (colsJson.columns ?? []).map((c) => ({
              key: c.key,
              label: c.label,
              companyLocationId: c.companyLocationId,
              erpnextInstanceId: c.erpnextInstanceId ?? null,
              directWarehouses: c.directWarehouses ?? [],
              warehouses: c.warehouses ?? [],
              includeInStock: c.includeInStock,
              includeInRop: c.includeInRop,
              sortOrder: c.sortOrder,
              active: c.active,
            })),
          );
        }
        if (locRes && locRes.ok) {
          const locs = (await locRes.json()) as LocationOption[] | { locations: LocationOption[] };
          const list = Array.isArray(locs) ? locs : locs.locations ?? [];
          if (!cancelled) setLocations(list);
        }
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Failed to load OSF columns");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialLocations]);

  async function save() {
    if (!canManage) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/osf/columns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setColumns(json.columns ?? columns);
      notify.success("OSF columns saved");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function addRow() {
    const n = columns.length + 1;
    setColumns([
      ...columns,
      {
        key: `col_${n}`,
        label: `Column ${n}`,
        companyLocationId: null,
        erpnextInstanceId: null,
        directWarehouses: [],
        includeInStock: true,
        includeInRop: true,
        sortOrder: n * 10,
        active: true,
      },
    ]);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading columns…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">Column mapping</h3>
          <p className="text-sm text-muted-foreground">
            Map Excel stock/ROP labels to Cosmo locations (ERP warehouses).
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

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Key</th>
              <th className="p-2">Excel label</th>
              <th className="p-2">Location</th>
              <th className="p-2">Stock</th>
              <th className="p-2">ROP</th>
              <th className="p-2" title="Left-to-right position of this column in the generated workbook (lower = further left)">
                Display order
              </th>
              <th className="p-2">Active</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {columns.map((col, idx) => (
              <tr key={`${col.key}-${idx}`} className="border-t">
                <td className="p-2">
                  <Input
                    value={col.key}
                    disabled={!canManage}
                    className="h-8 font-mono text-xs"
                    onChange={(e) => {
                      const next = [...columns];
                      next[idx] = { ...col, key: slugify(e.target.value) || col.key };
                      setColumns(next);
                    }}
                  />
                </td>
                <td className="p-2">
                  <Input
                    value={col.label}
                    disabled={!canManage}
                    className="h-8"
                    onChange={(e) => {
                      const next = [...columns];
                      next[idx] = { ...col, label: e.target.value };
                      setColumns(next);
                    }}
                    onBlur={() => {
                      if (!col.key || col.key.startsWith("col_")) {
                        const next = [...columns];
                        next[idx] = { ...col, key: slugify(col.label) || col.key };
                        setColumns(next);
                      }
                    }}
                  />
                </td>
                <td className="p-2">
                  {col.directWarehouses.length > 0 ? (
                    <div
                      className="truncate text-xs text-muted-foreground"
                      title={`Direct ERP warehouse(s): ${col.directWarehouses.join(", ")}`}
                    >
                      <span className="rounded bg-muted px-1.5 py-0.5">ERP warehouse</span>{" "}
                      {col.directWarehouses.join(", ")}
                    </div>
                  ) : (
                    <select
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      disabled={!canManage}
                      value={col.companyLocationId ?? ""}
                      onChange={(e) => {
                        const next = [...columns];
                        next[idx] = {
                          ...col,
                          companyLocationId: e.target.value || null,
                        };
                        setColumns(next);
                      }}
                    >
                      <option value="">—</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.shortName || loc.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={col.includeInStock}
                    disabled={!canManage}
                    onChange={(e) => {
                      const next = [...columns];
                      next[idx] = { ...col, includeInStock: e.target.checked };
                      setColumns(next);
                    }}
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={col.includeInRop}
                    disabled={!canManage}
                    onChange={(e) => {
                      const next = [...columns];
                      next[idx] = { ...col, includeInRop: e.target.checked };
                      setColumns(next);
                    }}
                  />
                </td>
                <td className="p-2 w-20">
                  <Input
                    type="number"
                    value={col.sortOrder}
                    disabled={!canManage}
                    title="Column position in the workbook (lower number = further left)"
                    className="h-8"
                    onChange={(e) => {
                      const next = [...columns];
                      next[idx] = { ...col, sortOrder: Number(e.target.value) || 0 };
                      setColumns(next);
                    }}
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={col.active}
                    disabled={!canManage}
                    onChange={(e) => {
                      const next = [...columns];
                      next[idx] = { ...col, active: e.target.checked };
                      setColumns(next);
                    }}
                  />
                </td>
                <td className="p-2">
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setColumns(columns.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {columns.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-muted-foreground">
                  No columns yet. Add Cosmetics.lk, LMJ, LWK, … and map locations.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
