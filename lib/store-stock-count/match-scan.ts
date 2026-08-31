import { normalizeSkuKey } from "@/lib/store-stock-count/company-key";

export type MatchScanResult =
  | { kind: "unique"; skuKey: string }
  | { kind: "none" }
  | { kind: "ambiguous"; skuKeys: string[] };

export type MatchScanRow = {
  skuKey: string;
  sku?: string;
  barcodes: string[];
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** UPC/EAN: strip leading zeros so 0227… and 227… match. */
export function barcodeDigitKey(value: string): string {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return digits.replace(/^0+/, "") || "0";
}

function addHit(
  hits: Set<string>,
  skuKey: string,
  code: string,
  candidate: string,
) {
  const trimmed = candidate.trim();
  if (!trimmed) return;
  if (trimmed === code || normalizeSkuKey(trimmed) === normalizeSkuKey(code)) {
    hits.add(skuKey);
    return;
  }
  const codeKey = barcodeDigitKey(code);
  const candKey = barcodeDigitKey(candidate);
  if (codeKey && candKey && codeKey === candKey) hits.add(skuKey);
}

/**
 * Match a scanned/typed barcode against loaded rows.
 * Exact trim, then digit key (ignores leading zeros), then SKU.
 */
export function matchScan(
  rawCode: string,
  rows: MatchScanRow[],
): MatchScanResult {
  const code = rawCode.trim();
  if (!code) return { kind: "none" };

  const hits = new Set<string>();
  for (const row of rows) {
    if (row.sku) addHit(hits, row.skuKey, code, row.sku);
    addHit(hits, row.skuKey, code, row.skuKey);
    for (const bc of row.barcodes) {
      addHit(hits, row.skuKey, code, bc);
    }
  }
  if (hits.size === 1) return { kind: "unique", skuKey: [...hits][0]! };
  if (hits.size > 1) return { kind: "ambiguous", skuKeys: [...hits] };
  return { kind: "none" };
}
