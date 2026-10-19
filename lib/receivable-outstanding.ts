import "server-only";

import { Prisma } from "@prisma/client";

import { getAllOsfErpInstances, OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";

type ReportColumn = { fieldname?: string | null; label?: string | null };
type ReportResponse = { message?: { columns?: ReportColumn[]; result?: unknown[] } };

export type ReceivableRow = {
  invoiceNo: string;
  customer: string;
  company: string;
  erpSlot: "ERP1" | "ERP2" | null;
  currency: string | null;
  invoiceDate: string | null;
  invoiceAmount: number;
  outstanding: number;
  orderId: string | null;
  dispatchDate: string | null;
  shippingService: string | null;
  shippingServiceType: "Rider" | "Courier" | null;
  cosmoOrderStatus: string | null;
  reason: string | null;
  age: number | null;
  ageingBucket: "1-2 Days" | "3-4 Days" | "5-7 Days" | "08-30 Days" | "31+ Days" | "No Dispatch";
  ageing1To2: number;
  ageing3To4: number;
  ageing5To7: number;
  ageing8To30: number;
  ageing31Plus: number;
  isPosOrder?: boolean;
};

export type ReceivableResult = {
  reportDate: string;
  refreshedAt: string | null;
  lastAttemptAt: string | null;
  rows: ReceivableRow[];
  errors: string[];
};

function headers(cfg: OsfErpCredentials) {
  return { Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`, Accept: "application/json" };
}
async function get<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const response = await fetch(`${cfg.baseUrl}${path}`, { headers: headers(cfg), cache: "no-store" });
  if (!response.ok) throw new OsfErpError(`ERPNext GET ${path} [${response.status}]`);
  return (await response.json()) as T;
}
async function fetchErpCompanies(cfg: OsfErpCredentials): Promise<string[]> {
  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const json = await get<{ data?: Array<{ name?: string }> }>(cfg, `/api/resource/Company?fields=${fields}&limit_page_length=1000`);
  return (json.data ?? []).map((row) => textValue(row.name)).filter((name): name is string => Boolean(name));
}
function value(row: unknown, columns: ReportColumn[], names: string[]): unknown {
  if (Array.isArray(row)) {
    const index = columns.findIndex((column) => names.includes((column.fieldname ?? "").toLowerCase()) || names.includes((column.label ?? "").toLowerCase()));
    return index >= 0 ? row[index] : null;
  }
  if (!row || typeof row !== "object") return null;
  const object = row as Record<string, unknown>;
  const lower = new Map(Object.entries(object).map(([key, item]) => [key.toLowerCase(), item]));
  return names.map((name) => lower.get(name.toLowerCase())).find((item) => item != null) ?? null;
}
function textValue(item: unknown): string | null {
  const result = item == null ? "" : String(item).trim();
  return result || null;
}
function numberValue(item: unknown): number {
  const result = Number(item);
  return Number.isFinite(result) ? result : 0;
}
function isTrue(item: unknown) { return item === true || item === 1 || /^(true|yes|1)$/i.test(String(item ?? "").trim()); }
function isExcludedOrderStage(stage: string | null | undefined) { return /^(returned[_ ]to[_ ]store|returned|cancelled|canceled)$/i.test(stage ?? ""); }
function dateAge(reportDate: string, dispatchDate: string | null): number | null {
  if (!dispatchDate) return null;
  const report = Date.parse(`${reportDate}T00:00:00Z`);
  const dispatch = Date.parse(`${dispatchDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(report) || !Number.isFinite(dispatch)) return null;
  return Math.max(0, Math.floor((report - dispatch) / 86400000));
}
function ageBucket(age: number | null): ReceivableRow["ageingBucket"] {
  if (age == null) return "No Dispatch";
  if (age <= 2) return "1-2 Days";
  if (age <= 4) return "3-4 Days";
  if (age <= 7) return "5-7 Days";
  if (age <= 30) return "08-30 Days";
  return "31+ Days";
}
function ageingValues(outstanding: number, bucket: ReceivableRow["ageingBucket"]) {
  return {
    ageing1To2: bucket === "1-2 Days" ? outstanding : 0,
    ageing3To4: bucket === "3-4 Days" ? outstanding : 0,
    ageing5To7: bucket === "5-7 Days" ? outstanding : 0,
    ageing8To30: bucket === "08-30 Days" ? outstanding : 0,
    ageing31Plus: bucket === "31+ Days" ? outstanding : 0,
  };
}

async function fetchAccountsReceivable(input: { cfg: OsfErpCredentials; company: string; reportDate: string }) {
  const filters = encodeURIComponent(JSON.stringify({
    company: input.company,
    report_date: input.reportDate,
    range1: 30,
    range2: 60,
    range3: 90,
    range4: 120,
  }));
  const path = `/api/method/frappe.desk.query_report.run?report_name=${encodeURIComponent("Accounts Receivable")}&filters=${filters}`;
  const json = await get<ReportResponse>(input.cfg, path);
  const columns = json.message?.columns ?? [];
  const reportRows = (json.message?.result ?? []).map((row) => {
    const voucherType = textValue(value(row, columns, ["voucher_type"]));
    const invoiceNo = textValue(value(row, columns, ["voucher_no", "invoice", "name"]));
    const returnAgainst = textValue(value(row, columns, ["return_against", "return_against_invoice", "credit_note"]));
    const invoiceAmount = numberValue(value(row, columns, ["invoiced", "invoice_amount", "amount"]));
    const invoiceStatus = textValue(value(row, columns, ["status", "docstatus"]));
    if (!invoiceNo || isTrue(value(row, columns, ["is_return", "is_return_invoice"])) || returnAgainst || /cancelled|canceled/i.test(invoiceStatus ?? "") || (voucherType && !/sales invoice/i.test(voucherType))) return null;
    const outstanding = numberValue(value(row, columns, ["outstanding"]));
    return {
      invoiceNo,
      customer: textValue(value(row, columns, ["party", "customer", "customer_name"])) ?? "Unknown",
      company: input.company,
      erpSlot: null,
      currency: textValue(value(row, columns, ["currency"])),
      invoiceDate: textValue(value(row, columns, ["posting_date", "invoice_date"])),
      invoiceAmount,
      outstanding,
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (reportRows.length > 0) return reportRows;

  const invoiceFilters = JSON.stringify([
    ["company", "=", input.company],
    ["posting_date", "<=", input.reportDate],
    ["docstatus", "=", 1],
    ["is_return", "=", 0],
    ["outstanding_amount", ">", 0],
  ]);
  const invoiceFields = JSON.stringify(["name", "customer", "posting_date", "grand_total", "outstanding_amount", "currency", "is_return", "status", "docstatus"]);
  const invoices = await get<{ data?: Array<{ name?: string; customer?: string; posting_date?: string; grand_total?: number | string; outstanding_amount?: number | string; currency?: string; is_return?: boolean | number; status?: string; docstatus?: number }> }>(input.cfg, `/api/resource/Sales%20Invoice?filters=${encodeURIComponent(invoiceFilters)}&fields=${encodeURIComponent(invoiceFields)}&limit_page_length=1000`);
  return (invoices.data ?? []).filter((invoice) => !isTrue(invoice.is_return) && invoice.docstatus !== 2 && !/cancelled|canceled/i.test(invoice.status ?? "") && numberValue(invoice.outstanding_amount) > 0).map((invoice) => ({
    invoiceNo: textValue(invoice.name) ?? "",
    customer: textValue(invoice.customer) ?? "Unknown",
    company: input.company,
    erpSlot: null,
    currency: textValue(invoice.currency),
    invoiceDate: textValue(invoice.posting_date),
    invoiceAmount: numberValue(invoice.grand_total),
    outstanding: numberValue(invoice.outstanding_amount),
  }));
}

function enrich(row: Awaited<ReturnType<typeof fetchAccountsReceivable>>[number], reportDate: string, erpSlot: "ERP1" | "ERP2" | null, order?: { id: string; posProfile: string | null; dispatchedAt: Date | null; fulfillmentStage: string; cancelReason: string | null; dispatchedByCourierService: { name: string | null } | null; dispatchedByRider: { name: string | null } | null; dispatchedByRiderId: string | null }) {
  const dispatchDate = order?.dispatchedAt?.toISOString().slice(0, 10) ?? null;
  const age = dateAge(reportDate, dispatchDate ?? row.invoiceDate);
  const ageingBucket = ageBucket(age);
  const shippingServiceType = order?.dispatchedByCourierService ? "Courier" : order?.dispatchedByRider || order?.dispatchedByRiderId ? "Rider" : null;
  return { ...row, erpSlot, orderId: order?.id ?? null, dispatchDate, shippingService: order?.dispatchedByCourierService?.name ?? order?.dispatchedByRider?.name ?? order?.dispatchedByRiderId ?? null, shippingServiceType, cosmoOrderStatus: order?.fulfillmentStage ?? null, reason: order?.cancelReason ?? null, isPosOrder: Boolean(order?.posProfile), age, ageingBucket, ...ageingValues(row.outstanding, ageingBucket) } satisfies ReceivableRow;
}

function jsonRows(value: Prisma.JsonValue | null): ReceivableRow[] { return Array.isArray(value) ? (value as ReceivableRow[]) : []; }

export async function loadCachedReceivables(companyId: string, reportDate: string): Promise<ReceivableResult> {
  const snapshots = await prisma.receivableOutstandingSnapshot.findMany({ where: { companyId, reportDate }, orderBy: [{ erpCompany: "asc" }] });
  const rows = snapshots.flatMap((snapshot) => jsonRows(snapshot.rows));
  return {
    reportDate,
    refreshedAt: snapshots.map((row) => row.lastSuccessAt?.toISOString() ?? null).filter(Boolean).sort().at(-1) ?? null,
    lastAttemptAt: snapshots.map((row) => row.lastAttemptAt.toISOString()).sort().at(-1) ?? null,
    rows,
    errors: snapshots.map((row) => row.error).filter((row): row is string => Boolean(row)),
  };
}

export async function refreshReceivables(companyId: string, reportDate: string): Promise<ReceivableResult> {
  const [instances, locations, orders] = await Promise.all([
    getAllOsfErpInstances(companyId),
    prisma.companyLocation.findMany({ where: { companyId, erpnextInstanceId: { not: null }, erpnextCompany: { not: null } }, select: { erpnextInstanceId: true, erpnextCompany: true } }),
    prisma.order.findMany({ where: { companyId, erpnextInvoiceId: { not: null } }, select: { id: true, erpnextInvoiceId: true, posProfile: true, dispatchedAt: true, fulfillmentStage: true, cancelReason: true, dispatchedByRiderId: true, dispatchedByCourierService: { select: { name: true } }, dispatchedByRider: { select: { name: true } } } }),
  ]);
  const orderMap = new Map(orders.filter((order) => order.erpnextInvoiceId).map((order) => [order.erpnextInvoiceId!.toLowerCase(), order]));
  const slots = resolveErpSlots(instances);
  const now = new Date();
  for (const instance of instances) {
    const erpSlot = slots.erp1?.id === instance.id ? "ERP1" : slots.erp2?.id === instance.id ? "ERP2" : null;
    let companies = [...new Set(locations.filter((location) => location.erpnextInstanceId === instance.id).map((location) => location.erpnextCompany).filter((company): company is string => Boolean(company)))];
    if (companies.length === 0) {
      try {
        companies = await fetchErpCompanies(instance.cfg);
      } catch {
        companies = [];
      }
    }
    for (const erpCompany of companies) {
      try {
        const reportRows = await fetchAccountsReceivable({ cfg: instance.cfg, company: erpCompany, reportDate });
        const rows = reportRows.map((row) => enrich(row, reportDate, erpSlot, orderMap.get(row.invoiceNo.toLowerCase()))).filter((row) => !isExcludedOrderStage(row.cosmoOrderStatus));
        await prisma.receivableOutstandingSnapshot.upsert({ where: { companyId_erpnextInstanceId_erpCompany_reportDate: { companyId, erpnextInstanceId: instance.id, erpCompany, reportDate } }, create: { companyId, erpnextInstanceId: instance.id, erpSlot, erpLabel: instance.label, erpCompany, reportDate, rows: rows as unknown as Prisma.InputJsonValue, lastSuccessAt: now, lastAttemptAt: now }, update: { erpSlot, erpLabel: instance.label, rows: rows as unknown as Prisma.InputJsonValue, error: null, lastSuccessAt: now, lastAttemptAt: now } });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const errorMessage = `${erpSlot ?? instance.label} / ${erpCompany}: ${detail}`;
        await prisma.receivableOutstandingSnapshot.upsert({ where: { companyId_erpnextInstanceId_erpCompany_reportDate: { companyId, erpnextInstanceId: instance.id, erpCompany, reportDate } }, create: { companyId, erpnextInstanceId: instance.id, erpSlot, erpLabel: instance.label, erpCompany, reportDate, error: errorMessage, lastAttemptAt: now }, update: { error: errorMessage, lastAttemptAt: now } });
      }
    }
  }
  return loadCachedReceivables(companyId, reportDate);
}
