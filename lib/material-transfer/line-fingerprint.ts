/** Stable line bag for matching a Cosmo submit to an ERP Stock Entry. */

export type FingerprintLine = {
  itemCode: string;
  qty: number;
};

/**
 * Sorted `ITEM::qty` tokens — order-independent.
 * Same item on multiple lines is summed (ERP may merge duplicates).
 */
export function materialTransferLineFingerprint(
  lines: Array<{ itemCode?: string | null; qty?: number | null }>,
): string {
  const byCode = new Map<string, number>();
  for (const line of lines) {
    const itemCode = String(line.itemCode ?? "").trim().toUpperCase();
    const qty = Math.round(Number(line.qty));
    if (!itemCode || !Number.isFinite(qty) || qty < 1) continue;
    byCode.set(itemCode, (byCode.get(itemCode) ?? 0) + qty);
  }
  return [...byCode.entries()]
    .map(([itemCode, qty]) => `${itemCode}::${qty}`)
    .sort()
    .join("|");
}

export function fingerprintsMatch(a: string, b: string): boolean {
  return Boolean(a) && a === b;
}

export function fingerprintFromErpItems(
  items: Array<{ item_code?: string | null; qty?: number | null }>,
): string {
  return materialTransferLineFingerprint(
    items.map((item) => ({
      itemCode: item.item_code,
      qty: item.qty,
    })),
  );
}
