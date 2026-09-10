import { isValidCustomerDisplayName } from "@/lib/reports/csv";

/** ERP paths carry authoritative customer display name (Customer.customer_name). */
const ERP_NAME_AUTHORITATIVE_SOURCES = new Set([
  "erpnext_si",
  "erp_customer_backfill",
]);

function normalizeComparableName(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!trimmed || !isValidCustomerDisplayName(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Prefer ERP customer name over Adapt/merchant junk already on ContactMaster.
 * Phone-matched only — never rename from email-only identity.
 */
export function shouldPreferIncomingContactName(input: {
  existingName: string | null | undefined;
  incomingName: string | null | undefined;
  phoneMatched: boolean;
  sourceType?: string | null;
}): boolean {
  if (!input.phoneMatched) return false;
  const incoming = normalizeComparableName(input.incomingName);
  if (!incoming) return false;

  const existing = normalizeComparableName(input.existingName);
  if (!existing) return true;
  if (existing === incoming) return false;

  return Boolean(
    input.sourceType && ERP_NAME_AUTHORITATIVE_SOURCES.has(input.sourceType)
  );
}
