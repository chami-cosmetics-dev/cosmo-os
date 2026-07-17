/** Max length for an ERP Sales Invoice / Return SI document name. */
const ERP_RETURN_SI_MAX_LEN = 140;

/** Normalize and dedupe Return SI document names for `Order.erpReturnSalesInvoiceIds`. */
export function normalizeErpReturnSalesInvoiceIds(
  values: Array<string | null | undefined> | string | null | undefined,
): string[] {
  const list = Array.isArray(values) ? values : values != null ? [values] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().slice(0, ERP_RETURN_SI_MAX_LEN);
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Append incoming Return SI name(s) onto an existing list without duplicates. */
export function mergeErpReturnSalesInvoiceIds(
  existing: string[] | null | undefined,
  incoming: string | string[] | null | undefined,
): string[] {
  return normalizeErpReturnSalesInvoiceIds([...(existing ?? []), ...(Array.isArray(incoming) ? incoming : [incoming])]);
}

/** Legacy keys written into Order.rawPayload before the first-class column existed. */
export function readLegacyErpReturnSalesInvoiceNames(rawPayload: unknown): string[] {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return [];
  const names = (rawPayload as Record<string, unknown>).erpReturnSalesInvoiceNames;
  if (!Array.isArray(names)) return [];
  return normalizeErpReturnSalesInvoiceIds(
    names.filter((value): value is string => typeof value === "string"),
  );
}

/**
 * Merge legacy rawPayload names into a column-style list (for backfill / transition).
 */
export function combineErpReturnSalesInvoiceIds(
  columnIds: string[] | null | undefined,
  rawPayload: unknown,
): string[] {
  return mergeErpReturnSalesInvoiceIds(columnIds, readLegacyErpReturnSalesInvoiceNames(rawPayload));
}
