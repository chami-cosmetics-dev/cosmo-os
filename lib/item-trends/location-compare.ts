import { compareChannelKind } from "@/lib/item-trends/cover";
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
}> {
  const seen = new Map<string, { columnKey: string; label: string; channelKind: CoverRow["channelKind"] }>();
  for (const row of rows) {
    if (!seen.has(row.columnKey)) {
      seen.set(row.columnKey, {
        columnKey: row.columnKey,
        label: row.outletName,
        channelKind: row.channelKind,
      });
    }
  }
  return [...seen.values()].sort(
    (a, b) => compareChannelKind(a.channelKind, b.channelKind) || a.label.localeCompare(b.label),
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
    const suggestedSendQty = children.reduce((s, r) => s + r.suggestedSendQty, 0);
    const daysInRange = first.daysInRange;
    const avgDaily = daysInRange > 0 ? unitsInRange / daysInRange : 0;
    out.push({
      ...first,
      sku: first.commonSkuKey || first.sku,
      title: first.commonSkuTitle ?? first.title,
      unitsInRange,
      stockQty,
      weekNeed: Math.round(weekNeed * 100) / 100,
      avgDaily: Math.round(avgDaily * 100) / 100,
      stockPctOfSale: unitsInRange > 0 ? Math.round((stockQty / unitsInRange) * 10000) / 100 : null,
      stockPctOfWeek: weekNeed > 0 ? Math.round((stockQty / weekNeed) * 10000) / 100 : null,
      coverDays: avgDaily > 0 ? Math.round((stockQty / avgDaily) * 100) / 100 : null,
      shouldSend: children.some((c) => c.shouldSend),
      suggestedSendQty,
      isOosInRange: children.some((c) => c.isOosInRange),
    });
  }

  return out.sort(
    (a, b) =>
      compareChannelKind(a.channelKind, b.channelKind) ||
      b.unitsInRange - a.unitsInRange ||
      a.outletName.localeCompare(b.outletName),
  );
}
