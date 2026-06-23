/** Normalize ERP invoice numbers for fuzzy matching (SV100-0253 ↔ SV1000253). */
export function normalizeErpInvoiceReference(ref: string): string {
  return ref.trim().replace(/^#+/, "").replace(/[\s-]+/g, "");
}

/** Distinct lookup values for an ERP Sales Invoice name. */
export function erpInvoiceReferenceLookupValues(ref: string): string[] {
  const trimmed = ref.trim().replace(/^#+/, "");
  const compact = normalizeErpInvoiceReference(trimmed);
  const values = new Set<string>();
  if (trimmed) values.add(trimmed);
  if (compact) values.add(compact);
  return [...values];
}
