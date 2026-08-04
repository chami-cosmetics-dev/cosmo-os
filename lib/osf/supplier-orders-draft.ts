export const DRAFT_VERSION = 1 as const;
export const DRAFT_KEY = "osf_supplier_orders_draft_v1";

export type SupplierAllocation = {
  supplierId?: string;
  supplierName: string;
  qty: number;
};

export type WorkingOrderRow = {
  sku: string;
  description: string;
  reorderQty: number;
  allocations: SupplierAllocation[];
};

export type SupplierOrdersDraft = {
  version: typeof DRAFT_VERSION;
  companyId: string;
  userId: string;
  updatedAt: string;
  rows: WorkingOrderRow[];
};

export function buildDraftStorageKey(companyId: string, userId: string): string {
  return `${DRAFT_KEY}:${companyId}:${userId}`;
}

/** Dedupe rows by SKU (first wins), clamp qty fields, enforce draft version. */
export function normalizeDraft(draft: SupplierOrdersDraft): SupplierOrdersDraft {
  const seen = new Set<string>();
  const rows: WorkingOrderRow[] = [];

  for (const row of draft.rows) {
    const sku = row.sku.trim();
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);

    rows.push({
      sku,
      description: row.description ?? "",
      reorderQty: Number.isFinite(row.reorderQty) ? Math.max(0, row.reorderQty) : 0,
      allocations: Array.isArray(row.allocations)
        ? row.allocations.map((allocation) => ({
            supplierId: allocation.supplierId,
            supplierName: allocation.supplierName ?? "",
            qty: Number.isFinite(allocation.qty) ? Math.max(0, allocation.qty) : 0,
          }))
        : [],
    });
  }

  return {
    version: DRAFT_VERSION,
    companyId: draft.companyId,
    userId: draft.userId,
    updatedAt: draft.updatedAt,
    rows,
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadDraft(companyId: string, userId: string): SupplierOrdersDraft | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(buildDraftStorageKey(companyId, userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SupplierOrdersDraft;
    if (parsed.version !== DRAFT_VERSION) return null;
    if (parsed.companyId !== companyId || parsed.userId !== userId) return null;

    return normalizeDraft(parsed);
  } catch {
    return null;
  }
}

export function saveDraft(draft: SupplierOrdersDraft): void {
  if (!isBrowser()) return;

  const normalized = normalizeDraft({
    ...draft,
    updatedAt: new Date().toISOString(),
  });

  try {
    window.localStorage.setItem(
      buildDraftStorageKey(normalized.companyId, normalized.userId),
      JSON.stringify(normalized),
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearDraft(companyId: string, userId: string): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(buildDraftStorageKey(companyId, userId));
  } catch {
    // Ignore storage failures.
  }
}
