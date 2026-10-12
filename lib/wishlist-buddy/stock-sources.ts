/** Pure shaping of ERPNext Bin + Warehouse rows into the "where else is it in stock" list. */

export type ErpBinRow = {
  warehouse?: string | null;
  actual_qty?: number | null;
  reserved_qty?: number | null;
  projected_qty?: number | null;
};

export type ErpWarehouseRow = {
  name?: string | null;
  company?: string | null;
  is_group?: number | boolean | null;
  disabled?: number | boolean | null;
  warehouse_type?: string | null;
};

export type StockSource = {
  instanceId: string;
  instanceLabel: string;
  erpCompany: string;
  warehouse: string;
  /** actual_qty - reserved_qty */
  availableQty: number;
  actualQty: number;
  reservedQty: number;
  projectedQty: number;
};

export type StockLookupResult = {
  sources: StockSource[];
  /** Instances that could not be read. Callers must not treat a failed instance as zero stock. */
  failedInstances: Array<{ instanceId: string; instanceLabel: string; error: string }>;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function truthyFlag(v: unknown): boolean {
  return v === 1 || v === true || v === "1";
}

export function isTransitWarehouse(row: ErpWarehouseRow): boolean {
  const type = (row.warehouse_type ?? "").trim().toLowerCase();
  if (type === "transit") return true;
  return /\btransit\b/i.test(row.name ?? "");
}

/**
 * Stock sources for one ERP instance: real (non-group, enabled, non-transit) warehouses with
 * available qty > 0, excluding the warehouse Shopify itself sells from.
 */
export function buildInstanceStockSources(input: {
  instanceId: string;
  instanceLabel: string;
  bins: ErpBinRow[];
  warehouses: ErpWarehouseRow[];
  excludeWarehouses?: string[];
  isExcludedCompany?: (company: string) => boolean;
}): StockSource[] {
  const warehouseByName = new Map<string, ErpWarehouseRow>();
  for (const w of input.warehouses) {
    const name = (w.name ?? "").trim();
    if (name) warehouseByName.set(name, w);
  }
  const exclude = new Set((input.excludeWarehouses ?? []).map((w) => w.trim()).filter(Boolean));

  const byWarehouse = new Map<string, StockSource>();
  for (const bin of input.bins) {
    const name = (bin.warehouse ?? "").trim();
    if (!name || exclude.has(name)) continue;
    const meta = warehouseByName.get(name);
    // Unknown warehouse metadata means we cannot tell group/transit/company — skip rather than guess.
    if (!meta) continue;
    if (truthyFlag(meta.is_group) || truthyFlag(meta.disabled) || isTransitWarehouse(meta)) continue;
    const company = (meta.company ?? "").trim();
    if (!company || input.isExcludedCompany?.(company)) continue;

    const existing = byWarehouse.get(name);
    const actualQty = num(bin.actual_qty) + (existing?.actualQty ?? 0);
    const reservedQty = num(bin.reserved_qty) + (existing?.reservedQty ?? 0);
    const projectedQty = num(bin.projected_qty) + (existing?.projectedQty ?? 0);
    byWarehouse.set(name, {
      instanceId: input.instanceId,
      instanceLabel: input.instanceLabel,
      erpCompany: company,
      warehouse: name,
      actualQty,
      reservedQty,
      projectedQty,
      availableQty: actualQty - reservedQty,
    });
  }

  return [...byWarehouse.values()].filter((s) => s.availableQty > 0);
}

/**
 * Order: priority warehouses first (in the given order, e.g. Main Warehouse - Cosmo), then by ERP
 * instance order (e.g. ERP2 before ERP1), then company, then highest available qty.
 */
export function sortStockSources(
  sources: StockSource[],
  instanceOrder: string[],
  priorityWarehouses: string[] = [],
): StockSource[] {
  const rank = new Map(instanceOrder.map((id, i) => [id, i]));
  const priority = new Map(priorityWarehouses.map((w, i) => [w.trim().toLowerCase(), i]));
  return [...sources].sort((a, b) => {
    const pa = priority.get(a.warehouse.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const pb = priority.get(b.warehouse.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    const ra = rank.get(a.instanceId) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.instanceId) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    const c = a.erpCompany.localeCompare(b.erpCompany);
    if (c !== 0) return c;
    return b.availableQty - a.availableQty;
  });
}

/**
 * Order ERP instances by label hints (e.g. ["ERP_2", "ERP_1"]): instances whose label contains an
 * earlier hint come first; the rest keep their original (setup) order.
 */
export function orderInstancesByLabel<T extends { id: string; label: string | null }>(
  instances: T[],
  labelHints: string[],
): T[] {
  const hints = labelHints.map((h) => h.trim().toLowerCase()).filter(Boolean);
  const hintRank = (label: string | null) => {
    const l = (label ?? "").toLowerCase();
    const i = hints.findIndex((h) => l.includes(h));
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return instances
    .map((inst, index) => ({ inst, index, r: hintRank(inst.label) }))
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((x) => x.inst);
}

export type StockLookupOutcome = "found" | "none" | "error";

/** "none" is only claimed when every instance was read successfully. */
export function classifyStockLookup(result: StockLookupResult): StockLookupOutcome {
  if (result.sources.length > 0) return "found";
  return result.failedInstances.length > 0 ? "error" : "none";
}
