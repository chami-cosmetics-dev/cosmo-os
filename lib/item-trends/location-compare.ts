import { compareChannelKind, TRAILING_COVER_DAYS } from "@/lib/item-trends/cover";
import { resolveLocationRopQty } from "@/lib/item-trends/rop-resolve";
import type { CoverRow } from "@/lib/item-trends/types";
import type { SkuGrain } from "@/lib/item-trends/sku-group";

export function itemCoverRows(
  rows: CoverRow[],
  target: { sku: string; commonSkuKey?: string | null },
  grain: SkuGrain,
): CoverRow[] {
  const sku = target.sku.trim();
  const common = (target.commonSkuKey ?? "").trim();
  const matched =
    grain === "common" && common
      ? rows.filter((row) => (row.commonSkuKey ?? row.sku) === common)
      : rows.filter((row) => row.sku === sku);
  return matched;
}

export function availableCompareLocations(rows: CoverRow[]): Array<{
  columnKey: string;
  label: string;
  channelKind: CoverRow["channelKind"];
  locationGroup: CoverRow["locationGroup"];
}> {
  const seen = new Map<
    string,
    {
      columnKey: string;
      label: string;
      channelKind: CoverRow["channelKind"];
      locationGroup: CoverRow["locationGroup"];
    }
  >();
  for (const row of rows) {
    if (!seen.has(row.columnKey)) {
      seen.set(row.columnKey, {
        columnKey: row.columnKey,
        label: row.outletName,
        channelKind: row.channelKind,
        locationGroup: row.locationGroup,
      });
    }
  }
  return [...seen.values()].sort(
    (a, b) =>
      (a.locationGroup === b.locationGroup ? 0 : a.locationGroup === "cosmetics_lk" ? -1 : 1) ||
      compareChannelKind(a.channelKind, b.channelKind) ||
      a.label.localeCompare(b.label),
  );
}

export function compareCoverByLocation(input: {
  rows: CoverRow[];
  selectedColumnKeys: string[];
}): CoverRow[] {
  const wanted = new Set(input.selectedColumnKeys);
  const filtered = wanted.size > 0 ? input.rows.filter((row) => wanted.has(row.columnKey)) : input.rows;

  const byLocation = new Map<string, CoverRow[]>();
  for (const row of filtered) {
    const list = byLocation.get(row.columnKey) ?? [];
    list.push(row);
    byLocation.set(row.columnKey, list);
  }

  const out: CoverRow[] = [];
  for (const children of byLocation.values()) {
    const first = children[0];
    if (!first) continue;
    if (children.length === 1) {
      out.push(first);
      continue;
    }
    const unitsInRange = children.reduce((s, r) => s + r.unitsInRange, 0);
    const stockQty = children.reduce((s, r) => s + r.stockQty, 0);
    const weekNeed = children.reduce((s, r) => s + r.weekNeed, 0);
    const last30Units = children.reduce((s, r) => s + (r.last30Units ?? 0), 0);
    const daysInRange = first.daysInRange;
    const avgDaily = daysInRange > 0 ? unitsInRange / daysInRange : 0;
    const last30AvgDaily = last30Units / TRAILING_COVER_DAYS;
    const coverDays = last30AvgDaily > 0 ? Math.round((stockQty / last30AvgDaily) * 100) / 100 : null;
    const ropMap = new Map<string, number>();
    const commonKey = first.commonSkuKey || first.sku;
    if (first.commonRopQty != null) {
      ropMap.set(`${commonKey}::${first.columnKey}`, first.commonRopQty);
    }
    for (const child of children) {
      if (child.ropQty != null) {
        ropMap.set(`${child.sku}::${child.columnKey}`, child.ropQty);
      }
      if (child.commonRopQty != null) {
        ropMap.set(`${child.commonSkuKey || child.sku}::${child.columnKey}`, child.commonRopQty);
      }
    }
    const ropQty = resolveLocationRopQty({
      grain: "common",
      sku: commonKey,
      commonSkuKey: commonKey,
      columnKey: first.columnKey,
      ropBySkuColumn: ropMap,
      childSkus: children.map((c) => c.sku),
    });

    out.push({
      ...first,
      sku: first.commonSkuKey || first.sku,
      title: first.commonSkuTitle ?? first.title,
      unitsInRange,
      stockQty,
      weekNeed: Math.round(weekNeed * 100) / 100,
      avgDaily: Math.round(avgDaily * 100) / 100,
      last30Units,
      last30AvgDaily: Math.round(last30AvgDaily * 100) / 100,
      coverDays,
      ropQty,
      commonRopQty: first.commonRopQty ?? null,
      isOosInRange: children.some((c) => c.isOosInRange),
    });
  }

  return out.sort(
    (a, b) =>
      (a.locationGroup === b.locationGroup ? 0 : a.locationGroup === "cosmetics_lk" ? -1 : 1) ||
      compareChannelKind(a.channelKind, b.channelKind) ||
      b.unitsInRange - a.unitsInRange ||
      a.outletName.localeCompare(b.outletName),
  );
}
