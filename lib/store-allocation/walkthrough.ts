import type { SessionItem, WalkthroughLine, WalkthroughStep } from "@/lib/store-allocation/session-types";

function lineForItemAtLocation(
  item: SessionItem,
  columnKey: string,
): WalkthroughLine | null {
  const row = item.locations.find((l) => l.columnKey === columnKey);
  if (!row || row.qty <= 0) return null;
  return {
    sku: item.sku,
    description: item.description,
    locationRop: row.locationRop,
    stock: row.stock,
    need: row.need,
    sales90d: row.sales90d,
    suggestedQty: row.suggestedQty,
    qty: row.qty,
  };
}

/**
 * Build location walkthrough steps: one step per location that has at least one
 * item with qty > 0. Column order is the first ready item's location order (stable OSF order).
 */
export function buildNonEmptyLocationSteps(items: SessionItem[]): WalkthroughStep[] {
  const included = items.filter(
    (item) =>
      item.takeQty != null &&
      item.takeQty > 0 &&
      item.planStatus === "ready" &&
      item.locations.length > 0,
  );
  if (included.length === 0) return [];

  const orderSource = included[0]!.locations;
  const steps: Omit<WalkthroughStep, "index" | "total">[] = [];

  for (const loc of orderSource) {
    const lines = included
      .map((item) => lineForItemAtLocation(item, loc.columnKey))
      .filter((line): line is WalkthroughLine => line != null);

    if (lines.length === 0) continue;

    steps.push({
      columnKey: loc.columnKey,
      label: loc.label,
      lines,
    });
  }

  const seen = new Set(steps.map((s) => s.columnKey));
  for (const item of included.slice(1)) {
    for (const loc of item.locations) {
      if (seen.has(loc.columnKey)) continue;
      const lines = included
        .map((it) => lineForItemAtLocation(it, loc.columnKey))
        .filter((line): line is WalkthroughLine => line != null);
      if (lines.length === 0) continue;
      seen.add(loc.columnKey);
      steps.push({
        columnKey: loc.columnKey,
        label: loc.label,
        lines,
      });
    }
  }

  const total = steps.length;
  return steps.map((s, index) => ({ ...s, index, total }));
}

export function clampWalkthroughIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, index), total - 1);
}
