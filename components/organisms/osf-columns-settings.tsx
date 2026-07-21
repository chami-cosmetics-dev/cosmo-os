"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";

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

function columnRole(col: ColumnRow): string {
  if (col.includeInStock && col.includeInRop) return "Warehouse — stock + ROP";
  if (col.includeInStock && !col.includeInRop) return "Shop / stock only";
  if (!col.includeInStock && col.includeInRop) return "ROP only";
  return "Hidden columns";
}

export function OsfColumnsSettings({ canManage, initialLocations }: Props) {
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>(initialLocations ?? []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  function updateRow(idx: number, patch: Partial<ColumnRow>) {
    setColumns((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-2xl space-y-1">
          <h3 className="font-medium">OSF location columns</h3>
          <p className="text-sm text-muted-foreground">
            Each row is one stock/ROP column in the Excel file. Link it to where ERP stock
            comes from, then choose whether buyers set a reorder target (ROP) for that
            location.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" /> Add location
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        )}
      </div>

      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Show stock</span> — include this
          location’s quantity in the workbook.
        </li>
        <li>
          <span className="font-medium text-foreground">Set ROP</span> — buyers can enter a
          reorder target here (typical for warehouses). Leave off for shops that only need
          stock visibility.
        </li>
        <li>
          <span className="font-medium text-foreground">In OSF</span> — turn off to hide the
          column without deleting it.
        </li>
      </ul>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Name in Excel</th>
              <th className="p-2">Pull stock from</th>
              <th className="p-2 text-center" title="Include stock qty in the workbook">
                Show stock
              </th>
              <th className="p-2 text-center" title="Allow ROP targets for this location">
                Set ROP
              </th>
              <th className="p-2 text-center" title="Include this column when generating OSF">
                In OSF
              </th>
              {showAdvanced && (
                <>
                  <th className="p-2" title="Internal id used when saving ROP values">
                    Internal key
                  </th>
                  <th
                    className="p-2"
                    title="Left-to-right position in the workbook (lower = further left)"
                  >
                    File order
                  </th>
                </>
              )}
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {columns.map((col, idx) => (
              <tr key={`${col.key}-${idx}`} className="border-t align-top">
                <td className="p-2">
                  <Input
                    value={col.label}
                    disabled={!canManage}
                    className="h-8"
                    placeholder="e.g. Cosmetics.lk"
                    onChange={(e) => updateRow(idx, { label: e.target.value })}
                    onBlur={() => {
                      if (!col.key || col.key.startsWith("col_")) {
                        updateRow(idx, { key: slugify(col.label) || col.key });
                      }
                    }}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">{columnRole(col)}</p>
                </td>
                <td className="p-2">
                  {col.directWarehouses.length > 0 ? (
                    <div
                      className="text-xs text-muted-foreground"
                      title={`Direct ERP warehouse(s): ${col.directWarehouses.join(", ")}`}
                    >
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        ERP warehouse
                      </span>
                      <div className="mt-1 truncate">{col.directWarehouses.join(", ")}</div>
                    </div>
                  ) : (
                    <select
                      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      disabled={!canManage}
                      value={col.companyLocationId ?? ""}
                      onChange={(e) =>
                        updateRow(idx, { companyLocationId: e.target.value || null })
                      }
                    >
                      <option value="">Choose location…</option>
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
                    aria-label={`Show stock for ${col.label}`}
                    checked={col.includeInStock}
                    disabled={!canManage}
                    onChange={(e) => updateRow(idx, { includeInStock: e.target.checked })}
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Set ROP for ${col.label}`}
                    checked={col.includeInRop}
                    disabled={!canManage}
                    onChange={(e) => updateRow(idx, { includeInRop: e.target.checked })}
                  />
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Include ${col.label} in OSF`}
                    checked={col.active}
                    disabled={!canManage}
                    onChange={(e) => updateRow(idx, { active: e.target.checked })}
                  />
                </td>
                {showAdvanced && (
                  <>
                    <td className="p-2">
                      <Input
                        value={col.key}
                        disabled={!canManage}
                        className="h-8 font-mono text-xs"
                        onChange={(e) =>
                          updateRow(idx, { key: slugify(e.target.value) || col.key })
                        }
                      />
                    </td>
                    <td className="p-2 w-24">
                      <Input
                        type="number"
                        value={col.sortOrder}
                        disabled={!canManage}
                        title="Column position in the workbook (lower number = further left)"
                        className="h-8"
                        onChange={(e) =>
                          updateRow(idx, { sortOrder: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                  </>
                )}
                <td className="p-2">
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${col.label}`}
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
                <td colSpan={showAdvanced ? 8 : 6} className="p-4 text-center text-muted-foreground">
                  No locations yet. Add warehouses (stock + ROP) and shops (stock only).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        {showAdvanced ? "Hide" : "Show"} advanced (internal key & file order)
      </button>
    </div>
  );
}
