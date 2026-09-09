import {
  buildSupplierAllowlist,
  isAllowedSupplier,
  type AllowedSupplier,
  type PurchaseRow,
} from "@/lib/osf/erp-purchases";
import { OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { vaultErpGetJson } from "@/lib/vault-osf/erp-client";
import { isExcludedErpCompany } from "@/lib/vault-osf/types";
import type { LatestPurchase, PurchaseCell } from "@/lib/vault-osf/types";

const PAGE = 500;
const MAX_PAGES = 60;

export type PurchaseInvoiceLine = PurchaseRow & {
  company?: string | null;
  net_amount?: number | string | null;
};

export function accumulateMonthlyPurchases(input: {
  rows: PurchaseInvoiceLine[];
  bounds: { start: string; end: string };
  allowedSuppliers: AllowedSupplier[];
}): Map<string, PurchaseCell> {
  const allowlist = buildSupplierAllowlist(input.allowedSuppliers);
  const map = new Map<string, { qty: number; netValue: number }>();
  for (const row of input.rows) {
    if (isExcludedErpCompany(row.company ?? "")) continue;
    if (!isAllowedSupplier(row, allowlist)) continue;
    const date = row.posting_date?.trim() ?? "";
    if (date < input.bounds.start || date > input.bounds.end) continue;
    const sku = row.item_code?.trim();
    if (!sku) continue;
    const qty = Number(row.qty);
    const net = Number(row.net_amount);
    const qtyVal = Number.isFinite(qty) ? qty : 0;
    const netVal = Number.isFinite(net) ? net : 0;
    const cur = map.get(sku) ?? { qty: 0, netValue: 0 };
    cur.qty += qtyVal;
    cur.netValue += netVal;
    map.set(sku, cur);
  }
  const out = new Map<string, PurchaseCell>();
  for (const [sku, v] of map) {
    out.set(sku, { qty: v.qty, netValue: v.netValue });
  }
  return out;
}

export function purchaseCellForSku(map: Map<string, PurchaseCell>, sku: string): PurchaseCell {
  return map.get(sku) ?? { qty: null, netValue: null };
}

export function mergePurchaseMaps(into: Map<string, PurchaseCell>, add: Map<string, PurchaseCell>) {
  for (const [sku, cell] of add) {
    const prev = into.get(sku);
    if (!prev || prev.qty == null) {
      into.set(sku, cell);
      continue;
    }
    into.set(sku, {
      qty: (prev.qty ?? 0) + (cell.qty ?? 0),
      netValue: (prev.netValue ?? 0) + (cell.netValue ?? 0),
    });
  }
}

export function accumulateLatestPurchase(input: {
  rows: PurchaseInvoiceLine[];
  allowedSuppliers: AllowedSupplier[];
  existing?: Map<string, LatestPurchase>;
}): Map<string, LatestPurchase> {
  const allowlist = buildSupplierAllowlist(input.allowedSuppliers);
  const result = input.existing ?? new Map<string, LatestPurchase>();
  for (const row of input.rows) {
    if (isExcludedErpCompany(row.company ?? "")) continue;
    if (!isAllowedSupplier(row, allowlist)) continue;
    const sku = row.item_code?.trim();
    if (!sku) continue;
    const date = row.posting_date?.trim() || null;
    const rateNum = row.rate != null ? Number(row.rate) : NaN;
    const rate = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : null;
    const supplier = row.supplier_name?.trim() || row.supplier?.trim() || null;
    const prev = result.get(sku);
    if (!prev || (date != null && (prev.date == null || date > prev.date))) {
      result.set(sku, { rate, supplier, date });
    }
  }
  return result;
}

const PI_FIELDS = JSON.stringify([
  "name",
  "supplier",
  "supplier_name",
  "posting_date",
  "company",
  "`tabPurchase Invoice Item`.item_code",
  "`tabPurchase Invoice Item`.qty",
  "`tabPurchase Invoice Item`.rate",
  "`tabPurchase Invoice Item`.net_amount",
]);

async function fetchPurchaseInvoiceLines(input: {
  cfg: OsfErpCredentials;
  filters: unknown[][];
}): Promise<PurchaseInvoiceLine[]> {
  const filters = JSON.stringify(input.filters);
  const rows: PurchaseInvoiceLine[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Purchase Invoice?fields=${encodeURIComponent(PI_FIELDS)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&order_by=${encodeURIComponent("posting_date desc, name desc")}` +
      `&limit_start=${page * PAGE}&limit_page_length=${PAGE}`;
    const json = await vaultErpGetJson<{ data?: PurchaseInvoiceLine[] }>(input.cfg, path);
    const batch = json.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    if (page === MAX_PAGES - 1) {
      throw new OsfErpError(`Purchase Invoice scan exceeded ${MAX_PAGES * PAGE} lines`);
    }
  }
  return rows;
}

export async function fetchMonthlyPurchases(input: {
  cfg: OsfErpCredentials;
  erpCompany: string;
  bounds: { start: string; end: string };
  allowedSuppliers: AllowedSupplier[];
}): Promise<Map<string, PurchaseCell>> {
  const rows = await fetchPurchaseInvoiceLines({
    cfg: input.cfg,
    filters: [
      ["docstatus", "=", 1],
      ["company", "=", input.erpCompany],
      ["posting_date", ">=", input.bounds.start],
      ["posting_date", "<=", input.bounds.end],
    ],
  });
  return accumulateMonthlyPurchases({
    rows,
    bounds: input.bounds,
    allowedSuppliers: input.allowedSuppliers,
  });
}

export async function fetchLatestPurchases(input: {
  cfg: OsfErpCredentials;
  allowedSuppliers: AllowedSupplier[];
  existing?: Map<string, LatestPurchase>;
}): Promise<Map<string, LatestPurchase>> {
  const rows = await fetchPurchaseInvoiceLines({
    cfg: input.cfg,
    filters: [["docstatus", "=", 1]],
  });
  return accumulateLatestPurchase({
    rows,
    allowedSuppliers: input.allowedSuppliers,
    existing: input.existing,
  });
}
