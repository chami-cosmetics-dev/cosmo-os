import { baseSku } from "@/lib/osf/base-sku";
import {
  MAX_DISTINCT_SKUS,
  NEAR_CAP_RATIO,
  type CompanyCap,
  type CompanyLine,
  type CompanyResult,
  type DetailSource,
  type ExpandedLine,
  type LineStatus,
  type NoOptionReason,
  type NormalizedLine,
  type OrderAvailabilityResponse,
  type OrderDetail,
  type RequestLine,
  type ShopCompanyStock,
  type SkuLine,
  type WarehousePriority,
  type WarehouseStock,
} from "@/lib/order-availability/types";
import { skuKey } from "@/lib/vat-status/types";

const QTY_RE = /^\d{1,5}$/;

/**
 * Paste box → request lines. One SKU per line, optionally followed by a qty
 * after a comma, tab, or single space ("SKU, 3" / "SKU\t3" / "SKU 3").
 * Anything else on a line is read as several SKUs separated by commas or spaces.
 */
export function parseSkuPaste(text: string): RequestLine[] {
  const out: RequestLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length === 2 && QTY_RE.test(parts[1]) && Number(parts[1]) > 0) {
      out.push({ sku: parts[0], qty: Number(parts[1]) });
      continue;
    }
    for (const sku of parts) out.push({ sku });
  }
  return out;
}

export function normalizeRequestLines(
  lines: RequestLine[],
): { ok: true; lines: NormalizedLine[] } | { ok: false; error: string } {
  const byKey = new Map<string, NormalizedLine>();
  for (const line of lines) {
    const sku = line.sku.trim();
    if (!sku) continue;
    const key = skuKey(sku);
    const qty = line.qty ?? 1;
    const existing = byKey.get(key);
    if (existing) existing.qty += qty;
    else byKey.set(key, { key, sku, qty });
  }
  if (byKey.size === 0) return { ok: false, error: "Enter at least one SKU" };
  if (byKey.size > MAX_DISTINCT_SKUS) {
    return {
      ok: false,
      error: `You entered ${byKey.size} SKUs. Check up to ${MAX_DISTINCT_SKUS} at a time — split the order.`,
    };
  }
  return { ok: true, lines: [...byKey.values()] };
}

/** True when the SKU already has a trailing `_N` or `-N` variant suffix. */
export function isVariantSku(sku: string): boolean {
  const trimmed = sku.trim();
  return trimmed.length > 0 && baseSku(trimmed) !== trimmed;
}

/** Exact common SKU, or a `_N` / `-N` variant of it. Does not match ORD040_1 for ORD04. */
export function itemMatchesCommonSku(itemCode: string, commonSku: string): boolean {
  const item = skuKey(itemCode);
  const common = skuKey(commonSku);
  if (!item || !common) return false;
  return item === common || skuKey(baseSku(itemCode)) === common;
}

/**
 * Common SKU (ORD04) → every ERP variant (ORD04_1, ORD04_2).
 * A typed variant stays exact. Variants already on the request are not duplicated.
 */
export function expandCommonSkuLines(
  lines: NormalizedLine[],
  items: Iterable<{ itemCode: string }>,
): ExpandedLine[] {
  const erpItems = [...items];
  const explicitKeys = new Set(lines.map((line) => line.key));
  const out: ExpandedLine[] = [];
  const seen = new Set<string>();

  function push(line: ExpandedLine) {
    if (seen.has(line.key)) return;
    seen.add(line.key);
    out.push(line);
  }

  for (const line of lines) {
    if (isVariantSku(line.sku)) {
      push({ ...line, fromCommonSku: null });
      continue;
    }
    const matches = erpItems
      .filter((item) => itemMatchesCommonSku(item.itemCode, line.sku))
      .sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }));
    if (matches.length === 0) {
      push({ ...line, fromCommonSku: null });
      continue;
    }
    for (const item of matches) {
      const key = skuKey(item.itemCode);
      if (key !== line.key && explicitKeys.has(key)) continue;
      push({
        key,
        sku: item.itemCode,
        qty: line.qty,
        fromCommonSku: key === line.key ? null : line.sku,
      });
    }
  }

  return out;
}

export function classifyLine(available: number, qty: number): LineStatus {
  if (available <= 0) return "missing";
  return available >= qty ? "covered" : "short";
}

/** Unpinned warehouses sort after 1–4. Lower number wins. */
export function prioritySortKey(priority: WarehousePriority | null | undefined): number {
  return priority ?? 5;
}

function compareWarehouseStock(a: WarehouseStock, b: WarehouseStock): number {
  return (
    prioritySortKey(a.priority) - prioritySortKey(b.priority) ||
    b.available - a.available ||
    a.warehouse.localeCompare(b.warehouse)
  );
}

function companyWarehousePriority(
  warehouses: string[],
  warehousePriority: ReadonlyMap<string, WarehousePriority>,
): WarehousePriority | null {
  let best: WarehousePriority | null = null;
  for (const warehouse of warehouses) {
    const priority = warehousePriority.get(warehouse);
    if (priority == null) continue;
    if (best == null || priority < best) best = priority;
  }
  return best;
}

/** Per-company coverage from main-warehouse stock. `binAvailable` is keyed `${warehouse}::${itemCode}`. */
export function buildCompanyResults(input: {
  skuLines: SkuLine[];
  warehousesByCompany: Map<string, string[]>;
  binAvailable: Map<string, number>;
  warehousePriority?: ReadonlyMap<string, WarehousePriority>;
}): CompanyResult[] {
  const found = input.skuLines.filter((line) => line.found && line.itemCode);
  const priorities = input.warehousePriority ?? new Map<string, WarehousePriority>();
  const results: CompanyResult[] = [];

  for (const [company, warehouses] of input.warehousesByCompany) {
    const lines: Record<string, CompanyLine> = {};
    let coveredCount = 0;
    let shortCount = 0;
    let missingCount = 0;
    let totalAvailable = 0;
    const warehousePriority = companyWarehousePriority(warehouses, priorities);

    for (const line of found) {
      const byWarehouse: WarehouseStock[] = [];
      for (const warehouse of warehouses) {
        const available = input.binAvailable.get(`${warehouse}::${line.itemCode}`) ?? 0;
        if (available > 0) {
          byWarehouse.push({ warehouse, available, priority: priorities.get(warehouse) ?? null });
        }
      }
      byWarehouse.sort(compareWarehouseStock);
      const available = byWarehouse.reduce((sum, row) => sum + row.available, 0);
      const status = classifyLine(available, line.qty);
      if (status === "covered") coveredCount += 1;
      else if (status === "short") shortCount += 1;
      else missingCount += 1;
      totalAvailable += Math.min(available, line.qty);
      lines[line.key] = { status, available, byWarehouse };
    }

    results.push({
      company,
      warehouses,
      lines,
      coveredCount,
      shortCount,
      missingCount,
      totalAvailable,
      fullCoverage: found.length > 0 && coveredCount === found.length,
      warehousePriority,
      capExempt: warehousePriority != null,
      cap: null,
      option: null,
    });
  }

  return results;
}

export function rankCompanies(results: CompanyResult[]): CompanyResult[] {
  return [...results].sort((a, b) => {
    const aHasStock = a.coveredCount > 0 ? 0 : 1;
    const bHasStock = b.coveredCount > 0 ? 0 : 1;
    return (
      aHasStock - bHasStock ||
      prioritySortKey(a.warehousePriority) - prioritySortKey(b.warehousePriority) ||
      b.coveredCount - a.coveredCount ||
      b.totalAvailable - a.totalAvailable ||
      b.shortCount - a.shortCount ||
      a.company.localeCompare(b.company)
    );
  });
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeOrderValue(skuLines: SkuLine[]): {
  value: number;
  isLowerBound: boolean;
  unpricedSkus: string[];
} {
  let value = 0;
  const unpricedSkus: string[] = [];
  for (const line of skuLines) {
    if (!line.found) continue;
    if (line.unitPrice == null || !Number.isFinite(line.unitPrice)) {
      unpricedSkus.push(line.sku);
      continue;
    }
    value += line.qty * line.unitPrice;
  }
  return { value: roundMoney(value), isLowerBound: unpricedSkus.length > 0, unpricedSkus };
}

export function capStatus(input: { limit: number; usedMtd: number | null; orderValue: number }): CompanyCap {
  const { limit, usedMtd, orderValue } = input;
  if (usedMtd == null) return { usedMtd: null, orderValue, headroomAfter: null, status: "unknown" };
  const headroomAfter = roundMoney(limit - usedMtd - orderValue);
  let status: CompanyCap["status"] = "ok";
  if (usedMtd >= limit) status = "reached";
  else if (headroomAfter < 0) status = "would_exceed";
  else if (headroomAfter < limit * NEAR_CAP_RATIO) status = "near";
  return { usedMtd, orderValue, headroomAfter, status };
}

/** Label the best companies that can take the order within their cap as Option A, B, C… */
export function pickOptions(
  ranked: CompanyResult[],
  optionCount: number,
  context: { foundCount: number; capError: string | null },
): { companies: CompanyResult[]; options: string[]; noOptionReason: NoOptionReason | null } {
  const unlabelled = ranked.map((row) => ({ ...row, option: null }));
  if (context.foundCount === 0) return { companies: unlabelled, options: [], noOptionReason: "no_found_skus" };
  const capReady = !context.capError;
  if (!capReady && !unlabelled.some((row) => row.capExempt && row.coveredCount > 0)) {
    return { companies: unlabelled, options: [], noOptionReason: "cap_unavailable" };
  }

  const options: string[] = [];
  const companies = unlabelled.map((row) => {
    const withinCap = row.cap?.status === "ok" || row.cap?.status === "near";
    const eligible = row.coveredCount > 0 && (row.capExempt || (capReady && withinCap));
    if (!eligible || options.length >= optionCount) return row;
    const option = String.fromCharCode(65 + options.length);
    options.push(row.company);
    return { ...row, option };
  });

  let noOptionReason: NoOptionReason | null = null;
  if (options.length === 0) {
    noOptionReason = companies.some((row) => row.coveredCount > 0) ? "all_over_cap" : "no_coverage";
  }
  return { companies, options, noOptionReason };
}

function collectShopSources(shops: ShopCompanyStock[], companyName: string, key: string): DetailSource[] {
  const sources: DetailSource[] = [];
  for (const other of shops) {
    if (other.company === companyName) continue;
    for (const row of other.lines[key]?.byWarehouse ?? []) {
      if (row.available > 0) {
        sources.push({
          company: other.company,
          warehouse: row.warehouse,
          available: row.available,
          priority: row.priority,
        });
      }
    }
  }
  sources.sort(
    (a, b) =>
      b.available - a.available || a.company.localeCompare(b.company) || a.warehouse.localeCompare(b.warehouse),
  );
  return sources;
}

/** Selected company's own stock for covered SKUs, and where the short/missing ones sit elsewhere. */
export function buildDetail(
  response: Pick<OrderAvailabilityResponse, "lines" | "companies" | "shopCompanies">,
  companyName: string,
): OrderDetail | null {
  const selected = response.companies.find((row) => row.company === companyName);
  if (!selected) return null;
  const shopCompanies = response.shopCompanies ?? [];
  const ownShops = shopCompanies.find((row) => row.company === companyName);

  const detail: OrderDetail = { company: companyName, covered: [], toMove: [], shops: [] };
  for (const line of response.lines) {
    if (!line.found) continue;
    const own = selected.lines[line.key];
    if (!own) continue;
    if (own.status === "covered") {
      detail.covered.push({ key: line.key, sku: line.sku, qty: line.qty, byWarehouse: own.byWarehouse });
    } else {
      const sources: DetailSource[] = [];
      for (const other of response.companies) {
        if (other.company === companyName) continue;
        for (const row of other.lines[line.key]?.byWarehouse ?? []) {
          if (row.available > 0) {
            sources.push({
              company: other.company,
              warehouse: row.warehouse,
              available: row.available,
              priority: row.priority,
            });
          }
        }
      }
      sources.sort(
        (a, b) =>
          prioritySortKey(a.priority) - prioritySortKey(b.priority) ||
          b.available - a.available ||
          a.company.localeCompare(b.company) ||
          a.warehouse.localeCompare(b.warehouse),
      );
      detail.toMove.push({
        key: line.key,
        sku: line.sku,
        qty: line.qty,
        status: own.status,
        ownAvailable: own.available,
        sources,
        availableAnywhere: sources.length > 0,
      });
    }

    const ownShop = ownShops?.lines[line.key];
    const shopOwn = (ownShop?.byWarehouse ?? []).filter((row) => row.available > 0);
    const shopSources = collectShopSources(shopCompanies, companyName, line.key);
    if (shopOwn.length > 0 || shopSources.length > 0) {
      detail.shops.push({
        key: line.key,
        sku: line.sku,
        qty: line.qty,
        own: shopOwn,
        ownAvailable: ownShop?.available ?? 0,
        sources: shopSources,
      });
    }
  }
  return detail;
}
