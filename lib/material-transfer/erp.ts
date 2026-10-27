import "server-only";

import { isVatTaxStatus } from "@/lib/osf/vat-membership";
import { getAllOsfErpInstances, type OsfErpCredentials, type OsfErpInstance } from "@/lib/osf/erp-stock";
import { ERP_TAX_STATUS_FIELD } from "@/lib/osf/erp-tax-status";
import { erpErrorMessage, isTransientErpFetchError } from "@/lib/material-transfer/erp-error";
import { itemCodeFromScanBarcode } from "@/lib/material-transfer/scan-barcode";
import {
  buildCosmoSaveDocCall,
  buildMaterialTransferBody,
  stockEntryNameFromSaveDoc,
} from "@/lib/material-transfer/payload";
import type { TransferLookupItem, TransferSlot, TransferWarehouse } from "@/lib/material-transfer/types";
import {
  companyForWarehouses,
  erp1RequiresVatItems,
  warehouseOptions,
} from "@/lib/material-transfer/warehouses";

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

const ERP_GET_RETRY_DELAYS_MS = [250, 800] as const;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function erpJsonOnce<T>(cfg: OsfErpCredentials, path: string, init?: RequestInit): Promise<T> {
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

async function erpJson<T>(cfg: OsfErpCredentials, path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  // Stock Entry insert is not idempotent. A dropped POST may already be saved.
  const retryable = method === "GET" || method === "HEAD";
  const attempts = retryable ? ERP_GET_RETRY_DELAYS_MS.length + 1 : 1;
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await erpJsonOnce<T>(cfg, path, init);
    } catch (error) {
      last = error;
      const delay = ERP_GET_RETRY_DELAYS_MS[attempt - 1];
      if (!retryable || delay == null || !isTransientErpFetchError(error)) throw error;
      console.warn(
        `[material-transfer] ERP ${method} ${path} closed — retry ${attempt}/${attempts}`,
      );
      await sleep(delay);
    }
  }
  throw last;
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

export async function searchTransferItemsByCode(
  cfg: OsfErpCredentials,
  query: string,
  limit = 15,
): Promise<Array<{ itemCode: string; itemName: string }>> {
  const q = query.trim().replace(/[%_\\]/g, "");
  if (q.length < 2) return [];
  const rows = await listResource<ErpItemRow>(
    cfg,
    "Item",
    [
      ["item_code", "like", `%${q}%`],
      ["disabled", "=", 0],
    ],
    ["item_code", "item_name", "disabled"],
    limit,
  );
  const out: Array<{ itemCode: string; itemName: string }> = [];
  for (const row of rows) {
    if (isDisabled(row.disabled)) continue;
    const itemCode = String(row.item_code ?? row.name ?? "").trim();
    if (!itemCode) continue;
    out.push({
      itemCode,
      itemName: String(row.item_name ?? itemCode).trim() || itemCode,
    });
  }
  return out;
}

export async function resolveTransferItemIdentity(
  cfg: OsfErpCredentials,
  code: string,
  options?: { exactOnly?: boolean },
): Promise<{ itemCode: string; itemName: string; barcode: string } | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const byCode = await findItemByCode(cfg, trimmed);
  const listed = byCode ?? (options?.exactOnly ? null : await findItemByBarcode(cfg, trimmed));
  if (!listed || isDisabled(listed.disabled)) return null;
  const fullName = String(listed.name ?? listed.item_code ?? "").trim();
  const row = (fullName ? await getItem(cfg, fullName) : null) ?? listed;
  if (!row || isDisabled(row.disabled)) return null;
  const itemCode = String(row.item_code ?? row.name ?? "").trim();
  if (!itemCode) return null;
  const scannedBarcode = byCode ? "" : trimmed;
  return {
    itemCode,
    itemName: String(row.item_name ?? itemCode).trim() || itemCode,
    barcode: scannedBarcode || firstBarcode(row),
  };
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

export async function liveSourceQty(
  cfg: OsfErpCredentials,
  itemCode: string,
  warehouse: string,
): Promise<number> {
  const qty = await sourceQty(cfg, itemCode, warehouse);
  return qty == null ? 0 : qty;
}

const BIN_QTY_BATCH = 80;

async function sourceQtyByItem(
  cfg: OsfErpCredentials,
  warehouse: string,
  itemCodes: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(itemCodes.map((code) => code.trim()).filter(Boolean))];
  const qtyByItem = new Map<string, number>();
  for (let i = 0; i < unique.length; i += BIN_QTY_BATCH) {
    const batch = unique.slice(i, i + BIN_QTY_BATCH);
    const rows = await listResource<{ item_code?: string; actual_qty?: number | string }>(
      cfg,
      "Bin",
      [
        ["warehouse", "=", warehouse],
        ["item_code", "in", batch],
      ],
      ["item_code", "actual_qty"],
      batch.length,
    );
    for (const row of rows) {
      const itemCode = String(row.item_code ?? "").trim();
      const qty = Number(row.actual_qty);
      if (!itemCode) continue;
      qtyByItem.set(itemCode, Number.isFinite(qty) ? qty : 0);
    }
  }
  return qtyByItem;
}

export async function assertSourceCovers(
  cfg: OsfErpCredentials,
  warehouse: string,
  lines: Array<{ itemCode: string; qty: number }>,
) {
  const needed = lines.filter((line) => line.qty > 0);
  if (needed.length === 0) return;
  const qtyByItem = await sourceQtyByItem(
    cfg,
    warehouse,
    needed.map((line) => line.itemCode),
  );
  for (const line of needed) {
    const available = qtyByItem.get(line.itemCode.trim()) ?? 0;
    if (line.qty > available) {
      throw new MaterialTransferError(
        `${line.itemCode} has ${available} available in ${warehouse}.`,
        409,
      );
    }
  }
}

export async function assertSlotVatLines(cfg: OsfErpCredentials, itemCodes: string[]) {
  await assertVatLines(cfg, itemCodes);
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
  targetWarehouse?: string | null;
  warehouses: TransferWarehouse[];
  company?: string | null;
  skipVatCheck?: boolean;
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
  const requireVat =
    input.slot === "erp1" &&
    !input.skipVatCheck &&
    erp1RequiresVatItems(input.sourceWarehouse, input.targetWarehouse);
  if (requireVat && !isVatTaxStatus(taxStatus)) {
    throw new MaterialTransferError(
      `${itemCode} is ${taxStatus || "not VAT"}. ERP1 takes Vat and Vat / Non Vat only.`,
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
        `${code} is ${taxStatus || "not VAT"}. ERP1 takes Vat and Vat / Non Vat only.`,
      );
    }
  }
}

export function requireErpOwner(user: {
  erpnextUsername?: string | null;
  email?: string | null;
}): string {
  const owner = user.erpnextUsername?.trim() || user.email?.trim() || "";
  if (!owner) {
    throw new MaterialTransferError(
      "Your ERP username is not set. An admin must link it before stock can move.",
    );
  }
  return owner;
}

export async function submitMaterialTransfer(input: {
  cfg: OsfErpCredentials;
  slot: TransferSlot;
  company?: string | null;
  sourceWarehouse: string;
  targetWarehouse: string;
  lines: Array<{ itemCode: string; qty: number; uom?: string | null }>;
  warehouses: TransferWarehouse[];
  owner: string;
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
  if (input.slot === "erp1" && erp1RequiresVatItems(input.sourceWarehouse, input.targetWarehouse)) {
    await assertVatLines(
      input.cfg,
      input.lines.map((line) => line.itemCode),
    );
  }
  await assertSourceCovers(input.cfg, input.sourceWarehouse, input.lines);

  const owner = requireErpOwner({ erpnextUsername: input.owner });
  const body = buildCosmoSaveDocCall({
    owner,
    doc: buildMaterialTransferBody({
      company,
      sourceWarehouse: input.sourceWarehouse,
      targetWarehouse: input.targetWarehouse,
      lines: input.lines,
    }),
  });
  let saved: unknown;
  try {
    saved = await erpJson<unknown>(input.cfg, "/api/method/cosmo_save_doc", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (isTransientErpFetchError(error)) {
      throw new MaterialTransferError(
        "ERP connection closed. Check ERP for a new Stock Entry before trying again.",
        502,
      );
    }
    throw new MaterialTransferError(erpErrorMessage(error), 422);
  }
  const name = stockEntryNameFromSaveDoc(saved);
  if (!name) throw new MaterialTransferError("ERP did not return a Stock Entry number", 502);

  return { name, company };
}

export async function loadTransferSlotWarehouses(companyId: string, slot: TransferSlot) {
  const slots = await resolveTransferSlots(companyId);
  const instance = instanceForSlot(slots, slot);
  const warehouses = await listTransferWarehouses(instance.cfg);
  return { instance, warehouses };
}
