import { ADAPT_FIELD, cell } from "@/lib/adapt-import/columns";
import type { AdaptCsvRow } from "@/lib/adapt-import/types";

/** Build idempotent Adapt invoice key. */
export function buildAdaptInvoiceKey(input: {
  salesInvoiceMasterId: string | null;
  salesInvoiceNo: string | null;
  salesLocationId: string | null;
  invoiceDate: Date | null;
}): string | null {
  const mid = input.salesInvoiceMasterId?.trim();
  if (mid) return `mid:${mid}`;

  const no = input.salesInvoiceNo?.trim();
  if (!no || !input.invoiceDate || Number.isNaN(input.invoiceDate.getTime())) {
    return null;
  }
  const y = input.invoiceDate.getFullYear();
  const m = String(input.invoiceDate.getMonth() + 1).padStart(2, "0");
  const d = String(input.invoiceDate.getDate()).padStart(2, "0");
  const loc = (input.salesLocationId ?? "").trim();
  return `cmp:${no}|${loc}|${y}-${m}-${d}`;
}

export function buildAdaptInvoiceKeyFromRow(
  row: AdaptCsvRow,
  invoiceDate: Date | null
): string | null {
  return buildAdaptInvoiceKey({
    salesInvoiceMasterId: cell(row, ADAPT_FIELD.salesInvoiceMasterId),
    salesInvoiceNo: cell(row, ADAPT_FIELD.salesInvoiceNo),
    salesLocationId: cell(row, ADAPT_FIELD.salesLocationId),
    invoiceDate,
  });
}
