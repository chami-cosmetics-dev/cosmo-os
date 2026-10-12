import "server-only";

import { isVatTaxStatus } from "@/lib/osf/vat-membership";
import { getAllOsfErpInstances, type OsfErpCredentials, type OsfErpInstance } from "@/lib/osf/erp-stock";
import { ERP_TAX_STATUS_FIELD } from "@/lib/osf/erp-tax-status";
import { erpErrorMessage } from "@/lib/material-transfer/erp-error";
import { itemCodeFromScanBarcode } from "@/lib/material-transfer/scan-barcode";
import { buildMaterialTransferBody } from "@/lib/material-transfer/payload";
import type { TransferLookupItem, TransferSlot, TransferWarehouse } from "@/lib/material-transfer/types";
import { companyForWarehouses, warehouseOptions } from "@/lib/material-transfer/warehouses";

export class MaterialTransferError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MaterialTransferError";
    this.status = status;
  }
}

type SlotSet = {
  erp1: OsfErpInstance | null;
  erp2: OsfErpInstance | null;
};

function authHeaders(cfg: OsfErpCredentials): Record<string, string> {
  return {
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function unwrapData<T>(json: unknown): T {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

async function erpJson<T>(cfg: OsfErpCredentials, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(cfg), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(`ERPNext ${init?.method ?? "GET"} ${path} [${res.status}]: ${text.slice(0, 700)}`);
  }
  return unwrapData<T>(json);
}

async function listResource<T>(
  cfg: OsfErpCredentials,
  doctype: string,
  filters: unknown[],
  fields: string[],
  limit = 500,
): Promise<T[]> {
  const params = new URLSearchParams({
    filters: JSON.stringify(filters),
    fields: JSON.stringify(fields),
    limit_page_length: String(limit),
  });
  const rows = await erpJson<T[]>(
    cfg,
    `/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`,
  );
  return Array.isArray(rows) ? rows : [];
}

function slotFromLabel(label: string | null | undefined): TransferSlot | null {
  if (/erp[_\s-]*1\b/i.test(label ?? "")) return "erp1";
  if (/erp[_\s-]*2\b/i.test(label ?? "")) return "erp2";
  return null;
}

export async function resolveTransferSlots(companyId: string): Promise<SlotSet> {
  const instances = await getAllOsfErpInstances(companyId);
  return {
    erp1: instances.find((row) => slotFromLabel(row.label) === "erp1") ?? null,
    erp2: instances.find((row) => slotFromLabel(row.label) === "erp2") ?? null,
  };
}

function instanceForSlot(slots: SlotSet, slot: TransferSlot): OsfErpInstance {
  const instance = slot === "erp1" ? slots.erp1 : slots.erp2;
  if (!instance) {
    throw new MaterialTransferError(`${slot === "erp1" ? "ERP1" : "ERP2"} is not configured`);
  }
  return instance;
}

function isDisabled(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

export async function listTransferWarehouses(cfg: OsfErpCredentials): Promise<TransferWarehouse[]> {
  const rows = await listResource<{
    name?: string;
    company?: string;
    disabled?: unknown;
    is_group?: unknown;
  }>(cfg, "Warehouse", [["is_group", "=", 0]], ["name", "company", "disabled", "is_group"]);
  const out: TransferWarehouse[] = [];
  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    const company = String(row.company ?? "").trim();
    if (!name || !company || isDisabled(row.disabled) || isDisabled(row.is_group)) continue;
    out.push({ name, company });
  }
  return out;
}

type ErpItemRow = {
  name?: string;
  item_code?: string;
  item_name?: string;
  stock_uom?: string;
  barcode?: string;
  barcodes?: Array<{ barcode?: string | null }>;
  disabled?: unknown;
  [ERP_TAX_STATUS_FIELD]?: string | null;
};

function firstBarcode(row: ErpItemRow): string {
  const direct = String(row.barcode ?? "").trim();
  if (direct) return direct;
  for (const child of row.barcodes ?? []) {
    const value = String(child?.barcode ?? "").trim();
    if (value) return value;
  }
  return "";
}

async function getItem(cfg: OsfErpCredentials, name: string): Promise<ErpItemRow | null> {
  try {
    return await erpJson<ErpItemRow>(
      cfg,
      `/api/resource/Item/${encodeURIComponent(name)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("[404]")) return null;
    throw error;
  }
}

async function findItemByCode(cfg: OsfErpCredentials, code: string): Promise<ErpItemRow | null> {
  const rows = await listResource<ErpItemRow>(
    cfg,
    "Item",
    [["item_code", "=", code]],
    ["name", "item_code", "item_name", "stock_uom", "disabled", ERP_TAX_STATUS_FIELD],
    1,
  );
  return rows[0] ?? null;
}

async function findItemByBarcode(cfg: OsfErpCredentials, code: string): Promise<ErpItemRow | null> {
  try {
    const json = await erpJson<unknown>(cfg, "/api/method/erpnext.stock.utils.scan_barcode", {
      method: "POST",
      body: JSON.stringify({ search_value: code }),
    });
    const itemCode = itemCodeFromScanBarcode(json);
    if (!itemCode) return null;
    return (await getItem(cfg, itemCode)) ?? (await findItemByCode(cfg, itemCode));
  } catch {
    return null;
  }
}

async function sourceQty(
  cfg: OsfErpCredentials,
  itemCode: string,
  warehouse: string,
): Promise<number | null> {
  const rows = await listResource<{ actual_qty?: number | string }>(
    cfg,
    "Bin",
    [
      ["item_code", "=", itemCode],
      ["warehouse", "=", warehouse],
    ],
    ["actual_qty"],
    1,
  );
  const raw = rows[0]?.actual_qty;
  if (raw == null || raw === "") return 0;
  const qty = Number(raw);
  return Number.isFinite(qty) ? qty : null;
}

function itemFromRow(row: ErpItemRow, barcode: string, availableQty: number | null): TransferLookupItem {
  const itemCode = String(row.item_code ?? row.name ?? "").trim();
  return {
    itemCode,
    itemName: String(row.item_name ?? itemCode).trim() || itemCode,
    barcode: barcode.trim() || firstBarcode(row),
    uom: String(row.stock_uom ?? "").trim() || "Nos",
    taxStatus: row[ERP_TAX_STATUS_FIELD]?.trim() || null,
    availableQty,
  };
}

export async function lookupTransferItem(input: {
  cfg: OsfErpCredentials;
  slot: TransferSlot;
  code: string;
  sourceWarehouse: string;
  warehouses: TransferWarehouse[];
  company?: string | null;
}): Promise<TransferLookupItem> {
  const code = input.code.trim();
  const options = warehouseOptions(input.slot, input.warehouses, input.company ?? null);
  if (!options.some((row) => row.name === input.sourceWarehouse)) {
    throw new MaterialTransferError("Source warehouse is not available for this transfer");
  }

  const byCode = await findItemByCode(input.cfg, code);
  const listed = byCode ?? (await findItemByBarcode(input.cfg, code));
  const fullName = String(listed?.name ?? listed?.item_code ?? "").trim();
  const row = (fullName ? await getItem(input.cfg, fullName) : null) ?? listed;
  if (!row || isDisabled(row.disabled)) {
    throw new MaterialTransferError(`No item found for ${code}`);
  }
  const itemCode = String(row.item_code ?? row.name ?? "").trim();
  if (!itemCode) throw new MaterialTransferError(`No item found for ${code}`);

  const taxStatus = row[ERP_TAX_STATUS_FIELD]?.trim() || null;
  if (input.slot === "erp1" && !isVatTaxStatus(taxStatus)) {
    throw new MaterialTransferError(
      `${itemCode} is ${taxStatus || "not VAT"}. ERP1 transfers VAT items only.`,
    );
  }

  const availableQty = await sourceQty(input.cfg, itemCode, input.sourceWarehouse);
  const scannedBarcode = byCode ? "" : code;
  return itemFromRow(row, scannedBarcode, availableQty);
}

async function assertVatLines(cfg: OsfErpCredentials, itemCodes: string[]) {
  const unique = [...new Set(itemCodes.map((code) => code.trim()).filter(Boolean))];
  const rows = await listResource<ErpItemRow>(
    cfg,
    "Item",
    [["item_code", "in", unique]],
    ["item_code", "disabled", ERP_TAX_STATUS_FIELD],
    unique.length,
  );
  const byCode = new Map(rows.map((row) => [String(row.item_code ?? "").trim(), row]));
  for (const code of unique) {
    const row = byCode.get(code);
    if (!row || isDisabled(row.disabled)) {
      throw new MaterialTransferError(`${code} was not found on ERP1`);
    }
    const taxStatus = row[ERP_TAX_STATUS_FIELD]?.trim() || null;
    if (!isVatTaxStatus(taxStatus)) {
      throw new MaterialTransferError(
        `${code} is ${taxStatus || "not VAT"}. ERP1 transfers VAT items only.`,
      );
    }
  }
}

export async function submitMaterialTransfer(input: {
  cfg: OsfErpCredentials;
  slot: TransferSlot;
  company?: string | null;
  sourceWarehouse: string;
  targetWarehouse: string;
  lines: Array<{ itemCode: string; qty: number; uom?: string | null }>;
  warehouses: TransferWarehouse[];
}): Promise<{ name: string; company: string }> {
  const options = warehouseOptions(input.slot, input.warehouses, input.company ?? null);
  let company: string;
  try {
    company = companyForWarehouses(input.sourceWarehouse, input.targetWarehouse, options);
  } catch (error) {
    throw new MaterialTransferError(error instanceof Error ? error.message : "Invalid warehouses");
  }
  if (input.slot === "erp2") {
    const selected = (input.company ?? "").trim();
    if (!selected) throw new MaterialTransferError("Select a company");
    if (selected !== company) {
      throw new MaterialTransferError("Warehouses do not belong to the selected company");
    }
  }
  if (input.lines.length === 0) throw new MaterialTransferError("Add at least one item");
  if (input.slot === "erp1") {
    await assertVatLines(
      input.cfg,
      input.lines.map((line) => line.itemCode),
    );
  }

  const body = buildMaterialTransferBody({
    company,
    sourceWarehouse: input.sourceWarehouse,
    targetWarehouse: input.targetWarehouse,
    lines: input.lines,
  });
  const created = await erpJson<{ name?: string }>(input.cfg, "/api/resource/Stock%20Entry", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const name = String(created.name ?? "").trim();
  if (!name) throw new MaterialTransferError("ERP did not return a Stock Entry number", 502);

  try {
    const full = await erpJson<Record<string, unknown>>(
      input.cfg,
      `/api/resource/Stock%20Entry/${encodeURIComponent(name)}`,
    );
    await erpJson(input.cfg, "/api/method/frappe.client.submit", {
      method: "POST",
      body: JSON.stringify({ doc: { ...full, doctype: "Stock Entry" } }),
    });
  } catch (error) {
    await erpJson(input.cfg, `/api/resource/Stock%20Entry/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    throw new MaterialTransferError(erpErrorMessage(error), 422);
  }

  return { name, company };
}

export async function loadTransferSlotWarehouses(companyId: string, slot: TransferSlot) {
  const slots = await resolveTransferSlots(companyId);
  const instance = instanceForSlot(slots, slot);
  const warehouses = await listTransferWarehouses(instance.cfg);
  return { instance, warehouses };
}
