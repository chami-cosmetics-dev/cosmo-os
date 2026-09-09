import { OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { vaultErpGetJson } from "@/lib/vault-osf/erp-client";
import { isExcludedErpCompany } from "@/lib/vault-osf/types";

const PAGE = 500;
const MAX_PAGES = 60;

export type SalesInvoiceLine = {
  item_code?: string | null;
  qty?: number | string | null;
  company?: string | null;
  posting_date?: string | null;
  docstatus?: number | null;
};

export type SalesMonthActivity = {
  /** True when this company posted any submitted SI in the month bounds. */
  hadDocuments: boolean;
  /** sku → signed qty */
  qtyBySku: Map<string, number>;
};

export function accumulateSalesLines(
  rows: SalesInvoiceLine[],
  bounds: { start: string; end: string },
  erpCompany: string,
): SalesMonthActivity {
  const qtyBySku = new Map<string, number>();
  let hadDocuments = false;
  for (const row of rows) {
    if (row.docstatus != null && row.docstatus !== 1) continue;
    const company = row.company?.trim() ?? "";
    if (isExcludedErpCompany(company)) continue;
    if (company !== erpCompany) continue;
    const date = row.posting_date?.trim() ?? "";
    if (date < bounds.start || date > bounds.end) continue;
    hadDocuments = true;
    const sku = row.item_code?.trim();
    if (!sku) continue;
    const qty = Number(row.qty);
    if (!Number.isFinite(qty)) continue;
    qtyBySku.set(sku, (qtyBySku.get(sku) ?? 0) + qty);
  }
  return { hadDocuments, qtyBySku };
}

/**
 * Cell for one SKU: ERP qty if the company had invoices that month; else null
 * (blank — overlay import later).
 */
export function salesQtyForSku(activity: SalesMonthActivity, sku: string): number | null {
  if (!activity.hadDocuments) return null;
  return activity.qtyBySku.get(sku) ?? 0;
}

export async function fetchSalesMonth(input: {
  cfg: OsfErpCredentials;
  erpCompany: string;
  bounds: { start: string; end: string };
}): Promise<SalesMonthActivity> {
  const fields = JSON.stringify([
    "name",
    "posting_date",
    "company",
    "docstatus",
    "`tabSales Invoice Item`.item_code",
    "`tabSales Invoice Item`.qty",
  ]);
  const filters = JSON.stringify([
    ["docstatus", "=", 1],
    ["company", "=", input.erpCompany],
    ["posting_date", ">=", input.bounds.start],
    ["posting_date", "<=", input.bounds.end],
  ]);

  const rows: SalesInvoiceLine[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/Sales Invoice?fields=${encodeURIComponent(fields)}` +
      `&filters=${encodeURIComponent(filters)}` +
      `&order_by=${encodeURIComponent("posting_date asc, name asc")}` +
      `&limit_start=${page * PAGE}&limit_page_length=${PAGE}`;
    const json = await vaultErpGetJson<{ data?: SalesInvoiceLine[] }>(input.cfg, path);
    const batch = json.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    if (page === MAX_PAGES - 1) {
      throw new OsfErpError(
        `Sales Invoice scan exceeded ${MAX_PAGES * PAGE} lines for ${input.erpCompany} ${input.bounds.start}`,
      );
    }
  }
  return accumulateSalesLines(rows, input.bounds, input.erpCompany);
}
