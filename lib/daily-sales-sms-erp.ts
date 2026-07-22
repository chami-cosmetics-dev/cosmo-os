/**
 * ERP-backed daily sales for Cosmo/Vault SMS — matches ERP day report:
 * submitted Sales Invoices by posting_date, net_total (excl shipping),
 * including same-day returns (even when original SI is older).
 */
import { prisma } from "@/lib/prisma";

export type ErpDailySalesInvoiceRow = {
  name?: string;
  company?: string | null;
  net_total?: number | string | null;
  is_return?: number | boolean | null;
  docstatus?: number | null;
  posting_date?: string | null;
};

export type ErpDailySalesAgg = {
  total: number;
  /** Count of submitted non-return sales invoices in the range. */
  count: number;
  byLocation: Map<string, number>;
};

const PAGE_LENGTH = 200;
const MAX_PAGES = 50;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeCompanyKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isReturnInvoice(row: ErpDailySalesInvoiceRow): boolean {
  const flag = row.is_return;
  if (flag === 1 || flag === true) return true;
  const net = Number(row.net_total ?? 0);
  return Number.isFinite(net) && net < 0;
}

/** Pure reducer — used by SMS builder and unit tests. */
export function aggregateErpSalesInvoiceRows(
  rows: ErpDailySalesInvoiceRow[],
  companyToLocationId: Map<string, string>,
): ErpDailySalesAgg {
  let total = 0;
  let count = 0;
  const byLocation = new Map<string, number>();

  for (const row of rows) {
    if (row.docstatus != null && row.docstatus !== 1) continue;
    const net = Number(row.net_total ?? 0);
    if (!Number.isFinite(net)) continue;

    total += net;
    if (!isReturnInvoice(row)) count += 1;

    const locationId = companyToLocationId.get(normalizeCompanyKey(row.company));
    if (locationId) {
      byLocation.set(locationId, (byLocation.get(locationId) ?? 0) + net);
    }
  }

  return {
    total: roundMoney(total),
    count,
    byLocation: new Map(
      [...byLocation.entries()].map(([id, value]) => [id, roundMoney(value)]),
    ),
  };
}

async function listSubmittedSalesInvoicesForRange(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
  fromYmd: string,
  toYmd: string,
): Promise<ErpDailySalesInvoiceRow[]> {
  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    Authorization: `token ${apiKey}:${apiSecret}`,
    "Content-Type": "application/json",
  };
  const filters = JSON.stringify([
    ["posting_date", ">=", fromYmd],
    ["posting_date", "<=", toYmd],
    ["docstatus", "=", 1],
  ]);
  const fields = JSON.stringify([
    "name",
    "company",
    "net_total",
    "is_return",
    "docstatus",
    "posting_date",
  ]);

  const all: ErpDailySalesInvoiceRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const start = page * PAGE_LENGTH;
    const url =
      `${base}/api/resource/Sales Invoice` +
      `?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&limit_page_length=${PAGE_LENGTH}&limit_start=${start}` +
      `&order_by=${encodeURIComponent("posting_date asc, name asc")}`;
    const res = await fetch(url, { headers });
    const json = (await res.json()) as { data?: ErpDailySalesInvoiceRow[]; message?: unknown };
    if (!res.ok) {
      throw new Error(
        `ERP Sales Invoice list failed [${res.status}] ${base}: ${JSON.stringify(json).slice(0, 300)}`,
      );
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    all.push(...rows);
    if (rows.length < PAGE_LENGTH) break;
  }
  return all;
}

/**
 * Aggregate submitted SI net_total across all ERP instances for the company.
 * Location mapping uses CompanyLocation.erpnextCompany.
 */
export async function aggregateErpDailySalesRange(
  companyId: string,
  fromYmd: string,
  toYmd: string,
): Promise<ErpDailySalesAgg | null> {
  const instances = await prisma.erpnextInstance.findMany({
    where: { companyId },
    select: { label: true, baseUrl: true, apiKey: true, apiSecret: true },
  });
  if (instances.length === 0) return null;

  const locations = await prisma.companyLocation.findMany({
    where: { companyId, erpnextCompany: { not: null } },
    select: { id: true, erpnextCompany: true },
  });
  const companyToLocationId = new Map<string, string>();
  for (const loc of locations) {
    const key = normalizeCompanyKey(loc.erpnextCompany);
    if (!key || companyToLocationId.has(key)) continue;
    companyToLocationId.set(key, loc.id);
  }

  const allRows: ErpDailySalesInvoiceRow[] = [];
  for (const inst of instances) {
    const rows = await listSubmittedSalesInvoicesForRange(
      inst.baseUrl,
      inst.apiKey,
      inst.apiSecret,
      fromYmd,
      toYmd,
    );
    allRows.push(...rows);
  }

  return aggregateErpSalesInvoiceRows(allRows, companyToLocationId);
}
