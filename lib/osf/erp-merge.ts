import type { ItemCostSupplier } from "@/lib/osf/erp-cost-supplier";
import type { ItemLastPurchase } from "@/lib/osf/erp-purchases";

export type InstanceErpData = {
  costs: Map<string, ItemCostSupplier>;
  purchases: Map<string, ItemLastPurchase>;
};

/**
 * Merge per-ERP-instance cost & purchase data into single company-wide maps.
 *
 * Locations span multiple ERP instances, but the OSF has single "Latest Cost /
 * supplier / purchase" columns. Rules:
 *  - Purchase: the instance with the most recent purchase date wins for
 *    supplier / qty / date. `recentQty` is summed across instances (total group
 *    procurement in the window).
 *  - Cost: prefer the cost from the same instance that won the latest purchase;
 *    otherwise the first non-null cost from any instance.
 */
export function mergeInstanceErpData(
  skus: string[],
  perInstance: InstanceErpData[],
): {
  costMap: Map<string, ItemCostSupplier>;
  purchaseMap: Map<string, ItemLastPurchase>;
} {
  const costMap = new Map<string, ItemCostSupplier>();
  const purchaseMap = new Map<string, ItemLastPurchase>();

  for (const sku of skus) {
    let bestIdx = -1;
    let bestDate: string | null = null;
    let recentSum = 0;
    let sawPurchase = false;

    perInstance.forEach((inst, idx) => {
      const p = inst.purchases.get(sku);
      if (!p) return;
      sawPurchase = true;
      recentSum += p.recentQty ?? 0;
      // Prefer the latest posting_date; a dated record beats an undated one.
      if (bestIdx === -1 || (p.date != null && (bestDate == null || p.date > bestDate))) {
        bestIdx = idx;
        bestDate = p.date ?? bestDate;
      }
    });

    if (sawPurchase) {
      const best = bestIdx >= 0 ? perInstance[bestIdx]!.purchases.get(sku) : undefined;
      purchaseMap.set(sku, {
        supplier: best?.supplier ?? null,
        qty: best?.qty ?? null,
        rate: best?.rate ?? null,
        date: best?.date ?? null,
        recentQty: recentSum,
      });
    }

    // Cost: align with the winning purchase instance when it has a cost.
    let cost: number | null = null;
    let supplier: string | null = null;
    const preferred = bestIdx >= 0 ? perInstance[bestIdx]!.costs.get(sku) : undefined;
    if (preferred?.cost != null) {
      cost = preferred.cost;
      supplier = preferred.supplier;
    } else {
      for (const inst of perInstance) {
        const c = inst.costs.get(sku);
        if (c?.cost != null) {
          cost = c.cost;
          supplier = c.supplier;
          break;
        }
      }
    }
    if (cost != null || supplier != null) {
      costMap.set(sku, { cost, supplier });
    }
  }

  return { costMap, purchaseMap };
}
