export type StandardPriceMismatchRow = {
  sku: string;
  itemName: string;
  erp1Rate: string;
  erp2Rate: string;
  /** ERP1 Standard Selling minus ERP2, two decimals. */
  diff: string;
};

function normSku(value: string): string {
  return value.trim().toUpperCase();
}

function indexRates(rates: Record<string, string>): Map<string, { sku: string; rate: string }> {
  const out = new Map<string, { sku: string; rate: string }>();
  for (const [sku, rate] of Object.entries(rates)) {
    const key = normSku(sku);
    const money = rate?.trim();
    if (!key || !money || out.has(key)) continue;
    out.set(key, { sku: sku.trim(), rate: money });
  }
  return out;
}

function formatDiff(erp1Rate: string, erp2Rate: string): string | null {
  const a = Number(erp1Rate);
  const b = Number(erp2Rate);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = a - b;
  if (Math.abs(diff) < 0.005) return null;
  return diff.toFixed(2);
}

/** Same SKU, both ERPs have Standard Selling, rates differ. Stock is ignored. */
export function buildStandardPriceMismatches(input: {
  standard1: Record<string, string>;
  standard2: Record<string, string>;
  nameBySku: Map<string, string>;
}): StandardPriceMismatchRow[] {
  const rates1 = indexRates(input.standard1);
  const rates2 = indexRates(input.standard2);
  const rows: StandardPriceMismatchRow[] = [];

  for (const [key, left] of rates1) {
    const right = rates2.get(key);
    if (!right) continue;
    const diff = formatDiff(left.rate, right.rate);
    if (!diff) continue;

    rows.push({
      sku: left.sku,
      itemName: input.nameBySku.get(left.sku) ?? input.nameBySku.get(right.sku) ?? left.sku,
      erp1Rate: left.rate,
      erp2Rate: right.rate,
      diff,
    });
  }

  rows.sort((a, b) => a.sku.localeCompare(b.sku));
  return rows;
}
