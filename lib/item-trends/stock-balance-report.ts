import "server-only";

import { getAllOsfErpInstances, OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";

/**
 * Live current stock for Stock Trends, read from ERPNext's "Stock Balance
 * Summary - Item Wise" report on every configured ERP instance.
 *
 * The report is a Prepared Report, so a plain run only returns the last
 * snapshot someone generated. Before every read we enqueue a fresh one — the
 * "Rebuild" button on ERP 1 (older Frappe) and "Generate New Report" on ERP 2
 * (newer Frappe) — wait for it to complete, then read that exact snapshot.
 */
export const STOCK_BALANCE_REPORT_NAME = "Stock Balance Summary - Item Wise";

/**
 * Filters the report is generated with. Empty = the report's own defaults
 * (every company/warehouse on the instance, balance as of today), matching the
 * manual xlsx exports compared in scripts/compare-erp-xlsx-snapshot.ts.
 */
const STOCK_BALANCE_REPORT_FILTERS: Record<string, unknown> = {};

const POLL_INTERVAL_MS = 2000;
/** Stays under the 300s route maxDuration with room for the ledger fetch + response. */
const POLL_TIMEOUT_MS = 240_000;
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Enqueue endpoints, newest Frappe first. Frappe v15 ("Generate New Report")
 * exposes make_prepared_report; v12–v14 ("Rebuild") use background_enqueue_run.
 * Both take { report_name, filters } and return { name } of the new Prepared Report.
 */
const ENQUEUE_METHODS = [
  "frappe.core.doctype.prepared_report.prepared_report.make_prepared_report",
  "frappe.desk.query_report.background_enqueue_run",
];

export type StockBalanceRow = { sku: string; warehouse: string; qty: number };

async function erpRequest<T>(cfg: OsfErpCredentials, path: string, body?: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const method = body ? "POST" : "GET";

  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new OsfErpError(`ERPNext ${method} ${path} [${res.status}]: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new OsfErpError(`ERPNext ${method} ${cfg.baseUrl}${path} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Starts a fresh Prepared Report and returns its name. */
async function enqueueStockBalanceReport(cfg: OsfErpCredentials): Promise<string> {
  const errors: string[] = [];
  for (const method of ENQUEUE_METHODS) {
    try {
      const json = await erpRequest<{ message?: { name?: string } }>(cfg, `/api/method/${method}`, {
        report_name: STOCK_BALANCE_REPORT_NAME,
        filters: JSON.stringify(STOCK_BALANCE_REPORT_FILTERS),
      });
      const name = json.message?.name;
      if (name) return name;
      errors.push(`${method}: no Prepared Report name in response`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new OsfErpError(
    `Could not generate "${STOCK_BALANCE_REPORT_NAME}" on ${cfg.baseUrl}: ${errors.join(" | ")}`,
  );
}

async function waitForPreparedReport(cfg: OsfErpCredentials, name: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const path = `/api/resource/Prepared Report/${encodeURIComponent(name)}`;
  for (;;) {
    const json = await erpRequest<{ data?: { status?: string; error_message?: string } }>(cfg, path);
    const status = json.data?.status ?? "";
    if (status === "Completed") return;
    if (status === "Error" || status === "Failed") {
      throw new OsfErpError(
        `"${STOCK_BALANCE_REPORT_NAME}" (${name}) failed on ${cfg.baseUrl}: ${(json.data?.error_message ?? "").slice(0, 300)}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new OsfErpError(
        `"${STOCK_BALANCE_REPORT_NAME}" (${name}) on ${cfg.baseUrl} still "${status}" after ${POLL_TIMEOUT_MS / 1000}s`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

type ReportColumn = string | { fieldname?: string; label?: string };

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Old-style string columns are "Label:Type/Options:Width"; fieldname is the scrubbed label. */
function columnKeys(col: ReportColumn): { fieldname: string; label: string } {
  if (typeof col === "string") {
    const label = col.split(":")[0] ?? "";
    return { fieldname: normalizeHeader(label).replace(/ /g, "_"), label };
  }
  return { fieldname: col.fieldname ?? "", label: col.label ?? "" };
}

function findColumn(columns: ReportColumn[], labels: string[], fieldnames: string[]): number {
  const keys = columns.map(columnKeys);
  const byLabel = keys.findIndex((k) => labels.includes(normalizeHeader(k.label)));
  if (byLabel >= 0) return byLabel;
  return keys.findIndex((k) => fieldnames.includes(k.fieldname));
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Turns a query_report.run payload into per-warehouse balances. Rows may be
 * dicts keyed by fieldname or positional arrays; "All Warehouses…" roll-up rows
 * and blank/total rows are dropped so balances aren't double counted.
 */
export function parseStockBalanceReport(columns: ReportColumn[], result: unknown[]): StockBalanceRow[] {
  const itemIdx = findColumn(columns, ["item", "item code"], ["item_code", "item"]);
  const warehouseIdx = findColumn(columns, ["warehouse"], ["warehouse"]);
  const qtyIdx = findColumn(columns, ["balance qty"], ["bal_qty", "balance_qty"]);
  if (itemIdx < 0 || warehouseIdx < 0 || qtyIdx < 0) {
    throw new OsfErpError(
      `"${STOCK_BALANCE_REPORT_NAME}" is missing an Item, Warehouse or Balance Qty column ` +
        `(got: ${columns.map((c) => columnKeys(c).label || columnKeys(c).fieldname).join(", ")})`,
    );
  }
  const keys = columns.map(columnKeys);

  const cell = (row: unknown, idx: number): unknown => {
    if (Array.isArray(row)) return row[idx];
    if (row && typeof row === "object") return (row as Record<string, unknown>)[keys[idx].fieldname];
    return undefined;
  };

  const out: StockBalanceRow[] = [];
  for (const row of result) {
    const sku = String(cell(row, itemIdx) ?? "").trim();
    const warehouse = String(cell(row, warehouseIdx) ?? "").trim();
    const qty = toNumber(cell(row, qtyIdx));
    if (!sku || !warehouse || Number.isNaN(qty)) continue;
    if (warehouse.toLowerCase().startsWith("all warehouses")) continue;
    out.push({ sku, warehouse, qty });
  }
  return out;
}

async function readPreparedReport(cfg: OsfErpCredentials, name: string): Promise<StockBalanceRow[]> {
  const json = await erpRequest<{ message?: { columns?: ReportColumn[]; result?: unknown[] } }>(
    cfg,
    "/api/method/frappe.desk.query_report.run",
    {
      report_name: STOCK_BALANCE_REPORT_NAME,
      filters: JSON.stringify({ ...STOCK_BALANCE_REPORT_FILTERS, prepared_report_name: name }),
    },
  );
  const columns = json.message?.columns;
  const result = json.message?.result;
  if (!Array.isArray(columns) || !Array.isArray(result)) {
    throw new OsfErpError(`"${STOCK_BALANCE_REPORT_NAME}" (${name}) on ${cfg.baseUrl} returned no result`);
  }
  return parseStockBalanceReport(columns, result);
}

/** Generates a fresh report on one ERP instance, waits for it, and returns its rows. */
export async function fetchLiveStockBalance(cfg: OsfErpCredentials): Promise<StockBalanceRow[]> {
  const started = Date.now();
  const name = await enqueueStockBalanceReport(cfg);
  await waitForPreparedReport(cfg, name);
  const rows = await readPreparedReport(cfg, name);
  console.log(`[stock-balance-report] ${cfg.baseUrl} ${name}: ${rows.length} rows in ${Date.now() - started}ms`);
  return rows;
}

/**
 * Concurrent callers for the same company (e.g. the table and a series lookup
 * landing together) share one generation per ERP instead of each queuing their own.
 */
const inFlight = new Map<string, Promise<StockBalanceRow[]>>();

/** Fresh per-warehouse balances merged across every ERP instance configured for the company. */
export async function getLiveStockBalances(companyId: string): Promise<StockBalanceRow[]> {
  const existing = inFlight.get(companyId);
  if (existing) return existing;

  const promise = (async () => {
    const instances = await getAllOsfErpInstances(companyId);
    const perInstance = await Promise.all(instances.map((instance) => fetchLiveStockBalance(instance.cfg)));
    return perInstance.flat();
  })().finally(() => inFlight.delete(companyId));

  inFlight.set(companyId, promise);
  return promise;
}
