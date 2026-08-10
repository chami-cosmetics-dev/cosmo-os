import type { SessionItem, WalkthroughStep } from "@/lib/store-allocation/session-types";

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
      .map((item) => {
        const row = item.locations.find((l) => l.columnKey === loc.columnKey);
        const qty = row?.qty ?? 0;
        return {
          sku: item.sku,
          description: item.description,
          qty,
        };
      })
      .filter((line) => line.qty > 0);

    if (lines.length === 0) continue;

    steps.push({
      columnKey: loc.columnKey,
      label: loc.label,
      lines,
    });
  }

  // Include any columnKeys present on later items but missing from the first item's order
  const seen = new Set(steps.map((s) => s.columnKey));
  for (const item of included.slice(1)) {
    for (const loc of item.locations) {
      if (seen.has(loc.columnKey)) continue;
      const lines = included
        .map((it) => {
          const row = it.locations.find((l) => l.columnKey === loc.columnKey);
          const qty = row?.qty ?? 0;
          return { sku: it.sku, description: it.description, qty };
        })
        .filter((line) => line.qty > 0);
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
