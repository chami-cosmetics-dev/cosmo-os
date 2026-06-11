/** Minimum digit length for a scannable pick-list barcode. */
const MIN_BARCODE_DIGITS = 4;

/** True when value looks like a real scannable barcode (not blank / "0" placeholders). */
export function isValidPickListBarcode(value: string | null | undefined): boolean {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= MIN_BARCODE_DIGITS && !/^0+$/.test(digits);
}

/** Normalize for storage/display; returns null when invalid. */
export function normalizePickListBarcode(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !isValidPickListBarcode(trimmed)) return null;
  return trimmed;
}

/** Resolve barcode from the item or another catalog row with the same SKU. */
export function resolvePickListBarcode(
  barcode: string | null | undefined,
  sku: string | null | undefined,
  barcodeBySku: ReadonlyMap<string, string>,
): string | null {
  const direct = normalizePickListBarcode(barcode);
  if (direct) return direct;
  const key = sku?.trim();
  if (!key) return null;
  return normalizePickListBarcode(barcodeBySku.get(key));
}

/** Display barcode on pick lists — digits only, matching location pick list PDFs. */
export function formatPickListBarcode(value: string | null | undefined): string {
  const normalized = normalizePickListBarcode(value);
  if (!normalized) return "—";
  const digits = normalized.replace(/\D/g, "");
  return digits || "—";
}
