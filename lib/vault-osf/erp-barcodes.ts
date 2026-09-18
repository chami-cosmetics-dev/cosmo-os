const PAGE = 500;
const MAX_PAGES = 80;
const GET_CONCURRENCY = 8;

export type VaultErpGetJson = <T>(path: string) => Promise<T>;

export type ErpItemBarcodePayload = {
  barcode?: string | null;
  barcodes?: Array<{ barcode?: string | null }>;
};

/** First usable barcode from Item.barcode or the barcodes child table. */
export function firstBarcodeFromErpItem(
  item: ErpItemBarcodePayload | null | undefined,
): string | null {
  if (!item) return null;
  const direct = item.barcode?.trim();
  if (direct) return direct;
  for (const row of item.barcodes ?? []) {
    const barcode = row.barcode?.trim();
    if (barcode) return barcode;
  }
  return null;
}

export function lookupBarcode(map: Map<string, string>, sku: string): string | null {
  const trimmed = sku.trim();
  if (!trimmed) return null;
  return map.get(trimmed) ?? map.get(trimmed.toUpperCase()) ?? null;
}

function rememberBarcode(map: Map<string, string>, sku: string, barcode: string) {
  const trimmed = sku.trim();
  const value = barcode.trim();
  if (!trimmed || !value) return;
  if (!map.has(trimmed)) map.set(trimmed, value);
  const upper = trimmed.toUpperCase();
  if (!map.has(upper)) map.set(upper, value);
}

/**
 * Bulk `Item Barcode` list. Vault API user typically gets 403 PermissionError
 * (`check_parent_permission` on the child doctype). Callers must fill gaps with
 * GET Item/{sku}, which includes the barcodes child table.
 */
export async function fetchItemBarcodeList(getJson: VaultErpGetJson): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const fields = JSON.stringify(["parent", "barcode"]);
  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const path =
        `/api/resource/Item Barcode?fields=${encodeURIComponent(fields)}` +
        `&limit_start=${page * PAGE}&limit_page_length=${PAGE}`;
      const json = await getJson<{ data?: Array<{ parent?: string; barcode?: string }> }>(path);
      const rows = json.data ?? [];
      for (const row of rows) {
        const sku = row.parent?.trim();
        const barcode = row.barcode?.trim();
        if (sku && barcode) rememberBarcode(map, sku, barcode);
      }
      if (rows.length < PAGE) break;
    }
  } catch {
    // Child list often unreadable; GET Item still works.
  }
  return map;
}

/** GET Item/{sku} for SKUs still missing a barcode (child table is on the parent doc). */
export async function fillMissingItemBarcodes(
  getJson: VaultErpGetJson,
  missingSkus: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const sku of missingSkus) {
    const key = sku.trim();
    if (!key) continue;
    const id = key.toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(key);
  }

  for (let i = 0; i < unique.length; i += GET_CONCURRENCY) {
    const chunk = unique.slice(i, i + GET_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (sku) => {
        try {
          const json = await getJson<{ data?: ErpItemBarcodePayload }>(
            `/api/resource/Item/${encodeURIComponent(sku)}`,
          );
          const barcode = firstBarcodeFromErpItem(json.data);
          return barcode ? ({ sku, barcode } as const) : null;
        } catch {
          return null;
        }
      }),
    );
    for (const hit of results) {
      if (hit) rememberBarcode(map, hit.sku, hit.barcode);
    }
  }
  return map;
}
