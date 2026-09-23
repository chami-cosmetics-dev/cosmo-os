export type SkuGrain = "common" | "variant";

export function defaultSkuMeta(sku: string, title: string | null) {
  return {
    brand: null as string | null,
    commonSkuKey: sku,
    commonSkuTitle: title,
    variantTitle: null as string | null,
  };
}

export type GroupableSkuRow = {
  sku: string;
  title: string | null;
  variantTitle?: string | null;
  commonSkuKey?: string | null;
  commonSkuTitle?: string | null;
  brand?: string | null;
  unitsCurrent?: number;
  unitsPrior?: number;
  unitsInRange?: number;
  speedPerDay?: number;
};

export function parentSkuStem(sku: string): string {
  const trimmed = sku.trim();
  const match = trimmed.match(/^(.*)_\d+$/);
  const stem = match?.[1]?.trim();
  return stem || trimmed;
}

export function commonSkuKeyFor(input: {
  sku: string;
  shopifyProductId?: string | null;
}): string {
  const sku = input.sku.trim();
  const stem = parentSkuStem(sku);
  if (stem !== sku) return stem;
  const productId = input.shopifyProductId?.trim();
  if (productId) return productId;
  return sku;
}

export function skuMatchesSearch(
  sku: string,
  commonSkuKey: string | null | undefined,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const s = sku.trim().toLowerCase();
  const k = (commonSkuKey ?? "").trim().toLowerCase();
  return s === q || s.startsWith(`${q}_`) || k === q || s.startsWith(q);
}

/**
 * Resolve typed SKU / common-key filters to catalog SKUs only.
 * Never keeps the raw typed string — avoids ghost rows like `ord04_1` beside `ORD04_1`.
 */
export function resolveCoverSkuFilter(input: {
  skuFilter?: string[] | null;
  commonSkuKey?: string | null;
  catalog: Iterable<{ sku: string; commonSkuKey: string }>;
}): string[] {
  const searchTerms = input.skuFilter?.map((s) => s.trim()).filter(Boolean) ?? [];
  const commonKey = input.commonSkuKey?.trim() || "";
  const out: string[] = [];
  const seen = new Set<string>();

  for (const entry of input.catalog) {
    const sku = entry.sku.trim();
    if (!sku || seen.has(sku)) continue;
    const byCommon = commonKey.length > 0 && entry.commonSkuKey === commonKey;
    const bySearch =
      searchTerms.length > 0 &&
      searchTerms.some((q) => skuMatchesSearch(entry.sku, entry.commonSkuKey, q));
    if (!byCommon && !bySearch) continue;
    seen.add(sku);
    out.push(sku);
  }

  return out;
}

export function filterRowsByBrand<T extends { brand?: string | null }>(
  rows: T[],
  brand: string | null | undefined,
): T[] {
  const wanted = (brand ?? "").trim().toLowerCase();
  if (!wanted) return rows;
  return rows.filter((row) => (row.brand ?? "").trim().toLowerCase() === wanted);
}

export function groupRowsByCommonSku<T extends GroupableSkuRow>(rows: T[]): Array<T & { childCount: number }> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = (row.commonSkuKey ?? row.sku).trim() || row.sku;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: Array<T & { childCount: number }> = [];
  for (const [, children] of groups) {
    const first = children[0];
    if (!first) continue;
    if (children.length === 1) {
      out.push({ ...first, childCount: 1 });
      continue;
    }
    const unitsCurrent = children.reduce((s, r) => s + (r.unitsCurrent ?? r.unitsInRange ?? 0), 0);
    const unitsPrior = children.reduce((s, r) => s + (r.unitsPrior ?? 0), 0);
    const unitsInRange = children.reduce((s, r) => s + (r.unitsInRange ?? r.unitsCurrent ?? 0), 0);
    const speedPerDay = children.reduce((s, r) => s + (r.speedPerDay ?? 0), 0);
    out.push({
      ...first,
      title: first.commonSkuTitle ?? first.title,
      unitsCurrent,
      unitsPrior,
      unitsInRange,
      speedPerDay: Math.round(speedPerDay * 100) / 100,
      childCount: children.length,
    });
  }
  return out;
}

export function childrenForCommonSku<T extends GroupableSkuRow>(
  rows: T[],
  commonSkuKey: string,
): T[] {
  const key = commonSkuKey.trim();
  return rows.filter((row) => (row.commonSkuKey ?? row.sku).trim() === key);
}
