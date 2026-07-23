/** Stable OSF Excel column access ids for per-user download visibility. */

import type { OsfResolvedColumn } from "@/lib/osf/column-config";

export type OsfAccessColumnMeta = { id: string; label: string };

/** Access key for Sales Units regardless of month suffix on the Excel header. */
export const OSF_ACCESS_SALES_UNITS = "Sales Units";

/** Static assignable columns (identity headers are never listed — always included). */
export const OSF_STATIC_ASSIGNABLE_COLUMNS: OsfAccessColumnMeta[] = [
  { id: "Total Stock", label: "Total Stock" },
  { id: "Common SKU Stock", label: "Common SKU Stock" },
  { id: "Common ROP", label: "Common ROP" },
  { id: "% of ROP", label: "% of ROP" },
  { id: "70% OF TOTAL ROP", label: "70% OF TOTAL ROP" },
  { id: "70% OF TOTAL ROP AVAILABILITY", label: "70% OF TOTAL ROP AVAILABILITY" },
  { id: "TOTAL ORDER QTY", label: "TOTAL ORDER QTY" },
  { id: "Common SKU Reorder", label: "Common SKU Reorder" },
  { id: "Cosmetics MRP", label: "Cosmetics MRP" },
  { id: "Discounted Price", label: "Discounted Price" },
  { id: "OGF Price", label: "OGF Price" },
  { id: "Latest Cost", label: "Latest Cost" },
  { id: "Latest supplier", label: "Latest supplier" },
  { id: "Last Purchase Qty", label: "Last Purchase Qty" },
  { id: "Last Purchase Date", label: "Last Purchase Date" },
  { id: "Days Since Last Purchase", label: "Days Since Last Purchase" },
  { id: "Purchased (last 30d)", label: "Purchased (last 30d)" },
  { id: "Cosmetics Margin %", label: "Cosmetics Margin %" },
  { id: "OGF Margin %", label: "OGF Margin %" },
  { id: OSF_ACCESS_SALES_UNITS, label: "Sales Units" },
];

export const LEGACY_GROUP_TO_COLUMN_KEYS: Record<string, string[]> = {
  pricing: ["Cosmetics MRP", "Discounted Price", "OGF Price"],
  cost: [
    "Latest Cost",
    "Latest supplier",
    "Last Purchase Qty",
    "Last Purchase Date",
    "Days Since Last Purchase",
    "Purchased (last 30d)",
  ],
  margins: ["Cosmetics Margin %", "OGF Margin %"],
  sales: [OSF_ACCESS_SALES_UNITS],
};

export function stockAccessKey(columnKey: string): string {
  return `stock:${columnKey}`;
}

export function ropAccessKey(columnKey: string): string {
  return `rop:${columnKey}`;
}

export function orderAccessKey(columnKey: string): string {
  return `order:${columnKey}`;
}

export function expandLegacyColumnGroups(groups: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const g of groups ?? []) {
    const keys = LEGACY_GROUP_TO_COLUMN_KEYS[g];
    if (!keys) continue;
    for (const k of keys) {
      if (!out.includes(k)) out.push(k);
    }
  }
  return out;
}

/** Build assignable catalog from active OSF columns + static headers. */
export function buildOsfAccessCatalog(columns: OsfResolvedColumn[]): OsfAccessColumnMeta[] {
  const out: OsfAccessColumnMeta[] = [];
  const seen = new Set<string>();

  const push = (id: string, label: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, label });
  };

  const active = columns.filter((c) => c.active);
  for (const c of active) {
    if (c.includeInStock) push(stockAccessKey(c.key), c.label);
  }
  for (const c of OSF_STATIC_ASSIGNABLE_COLUMNS) {
    if (c.id === "Total Stock" || c.id === "Common SKU Stock") push(c.id, c.label);
  }
  for (const c of active) {
    if (c.includeInRop) push(ropAccessKey(c.key), `${c.label} ROP`);
  }
  for (const c of OSF_STATIC_ASSIGNABLE_COLUMNS) {
    if (
      c.id === "Common ROP" ||
      c.id === "% of ROP" ||
      c.id === "70% OF TOTAL ROP" ||
      c.id === "70% OF TOTAL ROP AVAILABILITY"
    ) {
      push(c.id, c.label);
    }
  }
  for (const c of active) {
    if (c.includeInStock) push(orderAccessKey(c.key), `${c.label} ORDER QTY`);
  }
  for (const c of OSF_STATIC_ASSIGNABLE_COLUMNS) {
    if (
      c.id === "TOTAL ORDER QTY" ||
      c.id === "Common SKU Reorder" ||
      [
        "Cosmetics MRP",
        "Discounted Price",
        "OGF Price",
        "Latest Cost",
        "Latest supplier",
        "Last Purchase Qty",
        "Last Purchase Date",
        "Days Since Last Purchase",
        "Purchased (last 30d)",
        "Cosmetics Margin %",
        "OGF Margin %",
        OSF_ACCESS_SALES_UNITS,
      ].includes(c.id)
    ) {
      push(c.id, c.label);
    }
  }

  return out;
}

export function normalizeOsfColumnKeys(
  keys: string[] | null | undefined,
  catalogIds: Set<string>,
): string[] {
  const out: string[] = [];
  for (const raw of keys ?? []) {
    const id = String(raw ?? "").trim();
    if (!id || !catalogIds.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

export function allCatalogKeySet(catalog: OsfAccessColumnMeta[]): Set<string> {
  return new Set(catalog.map((c) => c.id));
}

/** Effective keys for a restricted user (identity always granted separately). */
export function resolveEffectiveOsfColumnKeysFromMarks(
  marks: string[] | null | undefined,
  fullAccess: boolean,
  catalogIds: Set<string>,
): Set<string> | "all" {
  if (fullAccess) return "all";
  return new Set(normalizeOsfColumnKeys(marks, catalogIds));
}
