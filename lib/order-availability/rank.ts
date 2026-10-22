import {
  MAX_DISTINCT_SKUS,
  NEAR_CAP_RATIO,
  type CompanyCap,
  type CompanyLine,
  type CompanyResult,
  type DetailSource,
  type LineStatus,
  type NoOptionReason,
  type NormalizedLine,
  type OrderAvailabilityResponse,
  type OrderDetail,
  type RequestLine,
  type SkuLine,
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

export function classifyLine(available: number, qty: number): LineStatus {
  if (available <= 0) return "missing";
  return available >= qty ? "covered" : "short";
}

/** Per-company coverage from main-warehouse stock. `binAvailable` is keyed `${warehouse}::${itemCode}`. */
export function buildCompanyResults(input: {
  skuLines: SkuLine[];
  warehousesByCompany: Map<string, string[]>;
  binAvailable: Map<string, number>;
}): CompanyResult[] {
  const found = input.skuLines.filter((line) => line.found && line.itemCode);
  const results: CompanyResult[] = [];

  for (const [company, warehouses] of input.warehousesByCompany) {
    const lines: Record<string, CompanyLine> = {};
    let coveredCount = 0;
    let shortCount = 0;
    let missingCount = 0;
    let totalAvailable = 0;

    for (const line of found) {
      const byWarehouse: WarehouseStock[] = [];
      for (const warehouse of warehouses) {
        const available = input.binAvailable.get(`${warehouse}::${line.itemCode}`) ?? 0;
        if (available > 0) byWarehouse.push({ warehouse, available });
      }
      byWarehouse.sort((a, b) => b.available - a.available || a.warehouse.localeCompare(b.warehouse));
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
      cap: null,
      option: null,
    });
  }

  return results;
}

export function rankCompanies(results: CompanyResult[]): CompanyResult[] {
  return [...results].sort(
    (a, b) =>
      b.coveredCount - a.coveredCount ||
      b.totalAvailable - a.totalAvailable ||
      b.shortCount - a.shortCount ||
      a.company.localeCompare(b.company),
  );
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
  if (context.capError) return { companies: unlabelled, options: [], noOptionReason: "cap_unavailable" };

  const options: string[] = [];
  const companies = unlabelled.map((row) => {
    const eligible =
      row.coveredCount > 0 && (row.cap?.status === "ok" || row.cap?.status === "near");
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

/** Selected company's own stock for covered SKUs, and where the short/missing ones sit elsewhere. */
export function buildDetail(
  response: Pick<OrderAvailabilityResponse, "lines" | "companies">,
  companyName: string,
): OrderDetail | null {
  const selected = response.companies.find((row) => row.company === companyName);
  if (!selected) return null;

  const detail: OrderDetail = { company: companyName, covered: [], toMove: [] };
  for (const line of response.lines) {
    if (!line.found) continue;
    const own = selected.lines[line.key];
    if (!own) continue;
    if (own.status === "covered") {
      detail.covered.push({ key: line.key, sku: line.sku, qty: line.qty, byWarehouse: own.byWarehouse });
      continue;
    }
    const sources: DetailSource[] = [];
    for (const other of response.companies) {
      if (other.company === companyName) continue;
      for (const row of other.lines[line.key]?.byWarehouse ?? []) {
        if (row.available > 0) sources.push({ company: other.company, warehouse: row.warehouse, available: row.available });
      }
    }
    sources.sort(
      (a, b) =>
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
  return detail;
}
