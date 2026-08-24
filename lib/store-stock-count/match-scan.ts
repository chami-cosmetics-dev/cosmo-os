export type MatchScanResult =
  | { kind: "unique"; skuKey: string }
  | { kind: "none" }
  | { kind: "ambiguous"; skuKeys: string[] };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Match a scanned/typed barcode against loaded rows.
 * Exact trim match first; if none, digits-only equality when both sides have digits.
 */
export function matchScan(
  rawCode: string,
  rows: Array<{ skuKey: string; barcodes: string[] }>,
): MatchScanResult {
  const code = rawCode.trim();
  if (!code) return { kind: "none" };

  const exact = new Set<string>();
  for (const row of rows) {
    for (const bc of row.barcodes) {
      if (bc.trim() === code) exact.add(row.skuKey);
    }
  }
  if (exact.size === 1) return { kind: "unique", skuKey: [...exact][0]! };
  if (exact.size > 1) return { kind: "ambiguous", skuKeys: [...exact] };

  const dig = digitsOnly(code);
  if (!dig) return { kind: "none" };

  const digitHits = new Set<string>();
  for (const row of rows) {
    for (const bc of row.barcodes) {
      const bd = digitsOnly(bc);
      if (bd && bd === dig) digitHits.add(row.skuKey);
    }
  }
  if (digitHits.size === 1) return { kind: "unique", skuKey: [...digitHits][0]! };
  if (digitHits.size > 1) return { kind: "ambiguous", skuKeys: [...digitHits] };
  return { kind: "none" };
}
