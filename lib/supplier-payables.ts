import "server-only";

import { Prisma } from "@prisma/client";

import { getAllOsfErpInstances, OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { isIntercompanyPurchaseSupplier } from "@/lib/osf/erp-purchases";
import { prisma } from "@/lib/prisma";
import { resolveErpSlots } from "@/lib/product-items/erp-priority-sync";

const PAGE_LENGTH = 500;
const MAX_SUPPLIER_PAGES = 80;

type ErpReportColumn = {
  fieldname?: string | null;
  label?: string | null;
};

type ErpReportResponse = {
  message?: {
    columns?: ErpReportColumn[];
    result?: unknown[];
  };
};

type ErpSupplierRow = {
  name?: string | null;
  supplier_name?: string | null;
};

export type SupplierPayableLine = {
  supplierId: string;
  supplierName: string | null;
  company: string;
  poNumber: string | null;
  amount: number;
  total: number;
  poDate: string | null;
  dueDate: string | null;
  daysPastDue: number | null;
  remark: string | null;
  erpSlot: "ERP1" | "ERP2" | null;
  erpLabel: string | null;
  outstanding: number;
  currency: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  itemLines?: Array<{ itemCode: string | null; itemName: string | null; poNumber: string | null; quantity: number; amount: number; availableStock: number }>;
};

export type SupplierPayableGroup = {
  supplierId: string;
  supplierName: string | null;
  totalOutstanding: number;
  currency: string | null;
  lines: SupplierPayableLine[];
};

export type SupplierPayablesLoadResult = {
  reportDate: string;
  refreshedAt: string | null;
  lastAttemptAt: string | null;
  groups: SupplierPayableGroup[];
  errors: string[];
};

function authHeaders(cfg: OsfErpCredentials): Record<string, string> {
  return {
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    Accept: "application/json",
  };
}

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: authHeaders(cfg),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function defaultSupplierPayablesReportDate(): string {
  return dateOnly(new Date());
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  return str || null;
}

function money(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
function isTrue(value: unknown) { return value === true || value === 1 || /^(true|yes|1)$/i.test(String(value ?? "").trim()); }

function matchesSupplierPrefix(line: Pick<SupplierPayableLine, "supplierId" | "supplierName">, prefixes: string[]) {
  const values = [line.supplierId, line.supplierName]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase());
  return prefixes.some((prefix) => {
    const normalized = prefix.trim().toLowerCase();
    return normalized && values.some((value) => value.includes(normalized));
  });
}

function columnIndex(columns: ErpReportColumn[], names: string[]): number {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return columns.findIndex((col) => {
    const fieldname = col.fieldname?.trim().toLowerCase();
    const label = col.label?.trim().toLowerCase();
    return Boolean((fieldname && wanted.has(fieldname)) || (label && wanted.has(label)));
  });
}

function valueFromReportRow(row: unknown, columns: ErpReportColumn[], names: string[]): unknown {
  if (Array.isArray(row)) {
    const idx = columnIndex(columns, names);
    return idx >= 0 ? row[idx] : null;
  }
  if (!row || typeof row !== "object") return null;
  const object = row as Record<string, unknown>;
  for (const name of names) {
    if (object[name] != null) return object[name];
  }
  const lower = new Map(Object.entries(object).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) {
    const found = lower.get(name.toLowerCase());
    if (found != null) return found;
  }
  return null;
}

async function fetchAccountsPayable(input: {
  cfg: OsfErpCredentials;
  company: string;
  reportDate: string;
}): Promise<SupplierPayableLine[]> {
  const filters = JSON.stringify({
    company: input.company,
    report_date: input.reportDate,
    range1: 30,
    range2: 60,
    range3: 90,
    range4: 120,
  });
  const path =
    `/api/method/frappe.desk.query_report.run?report_name=${encodeURIComponent(
      "Accounts Payable",
    )}&filters=${encodeURIComponent(filters)}`;
  const json = await erpGetJson<ErpReportResponse>(input.cfg, path);
  const columns = json.message?.columns ?? [];
  const rows = json.message?.result ?? [];
  const invoiceRows = rows
    .map((row): SupplierPayableLine | null => {
      const voucherType = text(valueFromReportRow(row, columns, ["voucher_type"]));
      const voucherNo = text(valueFromReportRow(row, columns, ["voucher_no", "voucher", "purchase_invoice", "name"]));
      if (
        isTrue(valueFromReportRow(row, columns, ["is_return", "is_return_invoice"])) ||
        (voucherType && !/purchase invoice/i.test(voucherType)) ||
        (!voucherType && (!voucherNo || /^(PAY|PE|JV|JE|Journal)/i.test(voucherNo)))
      ) return null;
      const supplierId = text(valueFromReportRow(row, columns, ["party", "supplier"]));
      if (!supplierId) return null;
      return {
        supplierId,
        supplierName: text(valueFromReportRow(row, columns, ["party_name", "supplier_name"])),
        company: input.company,
        poNumber: voucherNo,
        amount: money(valueFromReportRow(row, columns, ["invoice_amount", "amount", "invoiced"])),
        total: money(valueFromReportRow(row, columns, ["outstanding"])),
        poDate: text(valueFromReportRow(row, columns, ["posting_date", "po_date"])),
        dueDate: text(valueFromReportRow(row, columns, ["due_date"])),
        daysPastDue: (() => {
          const parsed = Number(valueFromReportRow(row, columns, ["days_past_due", "age"]));
          return Number.isFinite(parsed) ? parsed : null;
        })(),
        remark: text(valueFromReportRow(row, columns, ["remarks", "remark", "description"])),
        erpSlot: null,
        erpLabel: null,
        outstanding: money(valueFromReportRow(row, columns, ["outstanding"])),
        currency: text(valueFromReportRow(row, columns, ["currency"])),
      } satisfies SupplierPayableLine;
    })
    .filter((row): row is SupplierPayableLine => Boolean(row));

  const receiptByInvoice = new Map<string, string>();
  const paymentModeByInvoice = new Map<string, string>();
  const itemsByInvoice = new Map<string, Array<{ itemCode: string | null; itemName: string | null; poNumber: string | null; quantity: number; amount: number; availableStock: number }>>();
  for (let index = 0; index < invoiceRows.length; index += 10) {
    const batch = invoiceRows.slice(index, index + 10);
    const resolved = await Promise.all(
      batch.map(async (line) => [
        line.poNumber,
        await fetchPurchaseReceiptForInvoice(input.cfg, input.company, input.reportDate, line.poNumber),
      ] as const),
    );
    for (const [invoice, details] of resolved) {
      if (invoice && details?.receipt) receiptByInvoice.set(invoice, details.receipt);
      if (invoice && details?.paymentMode) paymentModeByInvoice.set(invoice, details.paymentMode);
      if (invoice && details) itemsByInvoice.set(invoice, details.items);
    }
  }
  return invoiceRows
    .map((line) => ({
      ...line,
      poNumber: line.poNumber ? receiptByInvoice.get(line.poNumber) ?? null : null,
      remark: line.poNumber ? paymentModeByInvoice.get(line.poNumber) ?? null : null,
      itemCode: line.poNumber ? itemsByInvoice.get(line.poNumber)?.[0]?.itemCode ?? null : null,
      itemName: line.poNumber ? itemsByInvoice.get(line.poNumber)?.[0]?.itemName ?? null : null,
      itemLines: line.poNumber ? itemsByInvoice.get(line.poNumber) ?? [] : [],
    }))
    .filter((line) => Boolean(line.poNumber));
}

async function fetchPurchaseReceiptForInvoice(
  cfg: OsfErpCredentials,
  company: string,
  reportDate: string,
  invoiceName: string | null,
): Promise<{ receipt: string | null; paymentMode: string | null; itemCode: string | null; itemName: string | null; items: Array<{ itemCode: string | null; itemName: string | null; poNumber: string | null; quantity: number; amount: number; availableStock: number }> } | null> {
  if (!invoiceName) return null;
  const path = `/api/resource/Purchase%20Invoice/${encodeURIComponent(invoiceName)}?fields=${encodeURIComponent(JSON.stringify(["mode_of_payment", "payment_schedule", "items"]))}`;
  try {
    const json = await erpGetJson<{ data?: { mode_of_payment?: string | null; payment_schedule?: Array<{ mode_of_payment?: string | null }>; items?: Array<{ purchase_receipt?: string | null; item_code?: string | null; item_name?: string | null; accepted_qty?: number | string; qty?: number | string; rate?: number | string; amount?: number | string }> } }>(cfg, path);
    const invoiceItems = (json.data?.items ?? []).map((entry) => ({ itemCode: text(entry.item_code), itemName: text(entry.item_name), poNumber: text(entry.purchase_receipt), quantity: money(entry.accepted_qty ?? entry.qty), amount: money(entry.amount) || money(entry.accepted_qty ?? entry.qty) * money(entry.rate), availableStock: 0 })).filter((entry) => entry.itemCode || entry.itemName);
    const receiptNames = [...new Set(invoiceItems.map((entry) => entry.poNumber).filter((value): value is string => Boolean(value)))];
    const receiptItems = (await Promise.all(receiptNames.map(async (receipt) => {
      try {
        const receiptJson = await erpGetJson<{ data?: { items?: Array<{ item_code?: string | null; item_name?: string | null; accepted_qty?: number | string; qty?: number | string; rate?: number | string; amount?: number | string }> } }>(cfg, `/api/resource/Purchase%20Receipt/${encodeURIComponent(receipt)}`);
        return (receiptJson.data?.items ?? []).map((entry) => ({ itemCode: text(entry.item_code), itemName: text(entry.item_name), poNumber: receipt, quantity: money(entry.accepted_qty ?? entry.qty), amount: money(entry.amount) || money(entry.accepted_qty ?? entry.qty) * money(entry.rate), availableStock: 0 })).filter((entry) => entry.itemCode || entry.itemName);
      } catch {
        return [];
      }
    }))).flat();
    const items = receiptItems.length ? receiptItems : invoiceItems;
    const itemCodes = [...new Set(items.map((entry) => entry.itemCode).filter((value): value is string => Boolean(value)))];
    if (itemCodes.length) {
      try {
        const stockFilters = JSON.stringify([["company", "=", company], ["item_code", "in", itemCodes], ["posting_date", "<=", reportDate], ["is_cancelled", "=", 0]]);
        const stockFields = encodeURIComponent(JSON.stringify(["item_code", "actual_qty"]));
        const stockJson = await erpGetJson<{ data?: Array<{ item_code?: string; actual_qty?: number | string }> }>(cfg, `/api/resource/Stock%20Ledger%20Entry?filters=${encodeURIComponent(stockFilters)}&fields=${stockFields}&limit_page_length=10000`);
        const stock = new Map<string, number>();
        for (const entry of stockJson.data ?? []) stock.set(entry.item_code ?? "", (stock.get(entry.item_code ?? "") ?? 0) + money(entry.actual_qty));
        for (const item of items) item.availableStock = stock.get(item.itemCode ?? "") ?? 0;
      } catch {
        // Stock is supplementary; preserve the payable report if the stock lookup fails.
      }
    }
    const item = items[0];
    return {
      receipt: items.map((entry) => entry.poNumber).find(Boolean) ?? null,
      paymentMode: text(json.data?.mode_of_payment) ?? text(json.data?.payment_schedule?.map((entry) => entry.mode_of_payment).find(Boolean)),
      itemCode: item?.itemCode ?? null,
      itemName: item?.itemName ?? null,
      items,
    };
  } catch {
    return null;
  }
}

async function fetchSuppliers(cfg: OsfErpCredentials): Promise<ErpSupplierRow[]> {
  const fields = JSON.stringify(["name", "supplier_name"]);
  const rows: ErpSupplierRow[] = [];
  for (let page = 0; page < MAX_SUPPLIER_PAGES; page += 1) {
    const path =
      `/api/resource/Supplier?fields=${encodeURIComponent(fields)}` +
      `&limit_start=${page * PAGE_LENGTH}&limit_page_length=${PAGE_LENGTH}`;
    const json = await erpGetJson<{ data?: ErpSupplierRow[] }>(cfg, path);
    const batch = json.data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_LENGTH) break;
    if (page === MAX_SUPPLIER_PAGES - 1) {
      throw new OsfErpError(`Supplier list exceeded ${MAX_SUPPLIER_PAGES * PAGE_LENGTH} rows`);
    }
  }
  return rows;
}

function decorateReportLines(input: {
  lines: SupplierPayableLine[];
  company: string;
  erpSlot: "ERP1" | "ERP2" | null;
  erpLabel: string | null;
}): SupplierPayableLine[] {
  return input.lines.map((line) => ({
    ...line,
    company: input.company,
    erpSlot: input.erpSlot,
    erpLabel: input.erpLabel,
  }));
}

function zeroSupplierLines(input: {
  suppliers: ErpSupplierRow[];
  seenSupplierIds: Set<string>;
  erpSlot: "ERP1" | "ERP2" | null;
  erpLabel: string | null;
}): SupplierPayableLine[] {
  return input.suppliers
    .map((supplier): SupplierPayableLine | null => {
      const supplierId = supplier.name?.trim();
      if (!supplierId || input.seenSupplierIds.has(supplierId.toLowerCase())) return null;
      return {
        supplierId,
        supplierName: supplier.supplier_name?.trim() || null,
        company: "-",
        poNumber: null,
        amount: 0,
        total: 0,
        poDate: null,
        dueDate: null,
        daysPastDue: null,
        remark: null,
        erpSlot: input.erpSlot,
        erpLabel: input.erpLabel,
        outstanding: 0,
        currency: null,
      } satisfies SupplierPayableLine;
    })
    .filter((line): line is SupplierPayableLine => Boolean(line));
}

function supplierKey(line: Pick<SupplierPayableLine, "supplierId" | "supplierName">): string {
  return (line.supplierId || line.supplierName || "").trim().toLowerCase();
}

function groupLines(lines: SupplierPayableLine[]): SupplierPayableGroup[] {
  const groups = new Map<string, SupplierPayableGroup>();
  for (const line of lines) {
    if (line.outstanding === 0) continue;
    const key = supplierKey(line);
    if (!key) continue;
    const group =
      groups.get(key) ??
      ({
        supplierId: line.supplierId,
        supplierName: line.supplierName,
        totalOutstanding: 0,
        currency: line.currency,
        lines: [],
      } satisfies SupplierPayableGroup);
    group.totalOutstanding += line.outstanding;
    group.currency = group.currency ?? line.currency;
    group.supplierName = group.supplierName ?? line.supplierName;
    group.lines.push(line);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      lines: group.lines.sort((a, b) => {
        const company = a.company.localeCompare(b.company);
        if (company !== 0) return company;
        return (a.erpSlot ?? "").localeCompare(b.erpSlot ?? "");
      }),
    }))
    .sort((a, b) => {
      const byAmount = Math.abs(b.totalOutstanding) - Math.abs(a.totalOutstanding);
      if (byAmount !== 0) return byAmount;
      return a.supplierId.localeCompare(b.supplierId);
    });
}

function jsonArray<T>(value: Prisma.JsonValue | null): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function loadCachedSupplierPayables(
  companyId: string,
  reportDate: string,
): Promise<SupplierPayablesLoadResult> {
  const snapshots = await prisma.supplierPayableSnapshot.findMany({
    where: { companyId, reportDate },
    orderBy: [{ erpCompany: "asc" }, { erpSlot: "asc" }],
  });
  const lines = snapshots.flatMap((snapshot) => jsonArray<SupplierPayableLine>(snapshot.rows));
  const refreshedAt = snapshots
    .map((snapshot) => snapshot.lastSuccessAt?.toISOString() ?? null)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  const lastAttemptAt = snapshots
    .map((snapshot) => snapshot.lastAttemptAt.toISOString())
    .sort()
    .at(-1) ?? null;
  return {
    reportDate,
    refreshedAt,
    lastAttemptAt,
    groups: groupLines(lines),
    errors: snapshots.map((snapshot) => snapshot.error).filter((error): error is string => Boolean(error)),
  };
}

export async function refreshSupplierPayables(
  companyId: string,
  reportDate: string,
): Promise<SupplierPayablesLoadResult> {
  const [instances, locations] = await Promise.all([
    getAllOsfErpInstances(companyId),
    prisma.companyLocation.findMany({
      where: { companyId, erpnextInstanceId: { not: null }, erpnextCompany: { not: null } },
      select: { erpnextInstanceId: true, erpnextCompany: true, supplierPrefix: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const slots = resolveErpSlots(instances);
  const now = new Date();

  for (const instance of instances) {
    const erpSlot =
      slots.erp1?.id === instance.id ? "ERP1" : slots.erp2?.id === instance.id ? "ERP2" : null;
    const erpCompanies = [
      ...new Set(
        locations
          .filter((location) => location.erpnextInstanceId === instance.id)
          .map((location) => location.erpnextCompany?.trim())
          .filter((company): company is string => Boolean(company)),
      ),
    ];
    const seenSupplierIds = new Set<string>();
    for (const erpCompany of erpCompanies) {
      try {
        const reportLines = await fetchAccountsPayable({
          cfg: instance.cfg,
          company: erpCompany,
          reportDate,
        });
        const supplierPrefixes = locations
          .filter(
            (location) =>
              location.erpnextInstanceId === instance.id &&
              location.erpnextCompany?.trim() === erpCompany &&
              location.supplierPrefix?.trim(),
          )
          .map((location) => location.supplierPrefix!.trim());
        const filteredReportLines = reportLines.filter(
          (line) =>
            !matchesSupplierPrefix(line, supplierPrefixes) &&
            !isIntercompanyPurchaseSupplier(line.supplierId, line.supplierName),
        );
        for (const line of filteredReportLines) {
          seenSupplierIds.add(line.supplierId.toLowerCase());
        }
        const rows = decorateReportLines({
          lines: filteredReportLines,
          company: erpCompany,
          erpSlot,
          erpLabel: instance.label,
        });
        await prisma.supplierPayableSnapshot.upsert({
          where: {
            companyId_erpnextInstanceId_erpCompany_reportDate: {
              companyId,
              erpnextInstanceId: instance.id,
              erpCompany,
              reportDate,
            },
          },
          create: {
            companyId,
            erpnextInstanceId: instance.id,
            erpSlot,
            erpLabel: instance.label,
            erpCompany,
            reportDate,
            rows: rows as unknown as Prisma.InputJsonValue,
            error: null,
            lastSuccessAt: now,
            lastAttemptAt: now,
          },
          update: {
            erpSlot,
            erpLabel: instance.label,
            rows: rows as unknown as Prisma.InputJsonValue,
            error: null,
            lastSuccessAt: now,
            lastAttemptAt: now,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const existing = await prisma.supplierPayableSnapshot.findUnique({
          where: {
            companyId_erpnextInstanceId_erpCompany_reportDate: {
              companyId,
              erpnextInstanceId: instance.id,
              erpCompany,
              reportDate,
            },
          },
          select: { rows: true },
        });
        for (const line of jsonArray<SupplierPayableLine>(existing?.rows ?? null)) {
          seenSupplierIds.add(line.supplierId.toLowerCase());
        }
        await prisma.supplierPayableSnapshot.upsert({
          where: {
            companyId_erpnextInstanceId_erpCompany_reportDate: {
              companyId,
              erpnextInstanceId: instance.id,
              erpCompany,
              reportDate,
            },
          },
          create: {
            companyId,
            erpnextInstanceId: instance.id,
            erpSlot,
            erpLabel: instance.label,
            erpCompany,
            reportDate,
            error: message,
            lastAttemptAt: now,
          },
          update: {
            erpSlot,
            erpLabel: instance.label,
            error: message,
            lastAttemptAt: now,
          },
        });
      }
    }
    try {
      const suppliers = await fetchSuppliers(instance.cfg);
      const rows = zeroSupplierLines({
        suppliers,
        seenSupplierIds,
        erpSlot,
        erpLabel: instance.label,
      });
      await prisma.supplierPayableSnapshot.upsert({
        where: {
          companyId_erpnextInstanceId_erpCompany_reportDate: {
            companyId,
            erpnextInstanceId: instance.id,
            erpCompany: "__all_suppliers__",
            reportDate,
          },
        },
        create: {
          companyId,
          erpnextInstanceId: instance.id,
          erpSlot,
          erpLabel: instance.label,
          erpCompany: "__all_suppliers__",
          reportDate,
          suppliers: suppliers as unknown as Prisma.InputJsonValue,
          rows: rows as unknown as Prisma.InputJsonValue,
          error: null,
          lastSuccessAt: now,
          lastAttemptAt: now,
        },
        update: {
          erpSlot,
          erpLabel: instance.label,
          suppliers: suppliers as unknown as Prisma.InputJsonValue,
          rows: rows as unknown as Prisma.InputJsonValue,
          error: null,
          lastSuccessAt: now,
          lastAttemptAt: now,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.supplierPayableSnapshot.upsert({
        where: {
          companyId_erpnextInstanceId_erpCompany_reportDate: {
            companyId,
            erpnextInstanceId: instance.id,
            erpCompany: "__all_suppliers__",
            reportDate,
          },
        },
        create: {
          companyId,
          erpnextInstanceId: instance.id,
          erpSlot,
          erpLabel: instance.label,
          erpCompany: "__all_suppliers__",
          reportDate,
          error: message,
          lastAttemptAt: now,
        },
        update: {
          erpSlot,
          erpLabel: instance.label,
          error: message,
          lastAttemptAt: now,
        },
      });
    }
  }

  return loadCachedSupplierPayables(companyId, reportDate);
}
