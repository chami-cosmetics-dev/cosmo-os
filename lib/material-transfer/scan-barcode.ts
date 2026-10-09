/** Item code from `erpnext.stock.utils.scan_barcode`. */
export function itemCodeFromScanBarcode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { message?: unknown; item_code?: unknown };
  const message =
    body.message && typeof body.message === "object"
      ? (body.message as { item_code?: unknown })
      : null;
  const code = String(message?.item_code ?? body.item_code ?? "").trim();
  return code || null;
}
