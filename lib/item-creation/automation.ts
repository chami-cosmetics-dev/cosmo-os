import "server-only";

import {
  ItemCreationErp,
  ItemCreationStockReceiptStatus,
  ItemCreationUpdateSource,
  Prisma,
} from "@prisma/client";

import { ITEM_CREATION_PERMISSIONS, ITEM_CREATION_PRICE_LISTS } from "@/lib/item-creation/workflow";
import { isItemCreationTaxStatus } from "@/lib/item-creation/helpers";
import { fetchBinActualQty, getAllOsfErpInstances, stockForColumn, type OsfErpCredentials, type OsfErpInstance } from "@/lib/osf/erp-stock";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { resolveTransferItemIdentity } from "@/lib/material-transfer/erp";
import { filterStoreAllocationColumns } from "@/lib/store-allocation/osf-columns";
import { normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { updateShopifyVariantPriceBySku } from "@/lib/shopify-admin";

type UserContext = NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>;
type Tx = Prisma.TransactionClient;

type ErpSlotSet = {
  erp1: OsfErpInstance | null;
  erp2: OsfErpInstance | null;
};

const ITEM_CREATION_PRODUCT_PRIORITY_FIELDS = [
  process.env.ITEM_CREATION_PRODUCT_PRIORITY_FIELD,
  "custom_product_priority",
  "product_priority",
  "custom_priority",
  "custom_item_priority",
  "custom_product_priority_level",
].filter((field): field is string => Boolean(field?.trim()));
const ITEM_CREATION_PRODUCT_PRIORITY_VALUES = [
  process.env.ITEM_CREATION_PRODUCT_PRIORITY_VALUE,
  "Newly added",
  "Newly Added",
].filter((value): value is string => Boolean(value?.trim()));

type ErpItemWebhookPayload = {
  name?: string;
  item_code?: string;
  item_name?: string;
  brand?: string;
  modified?: string;
  barcodes?: Array<{ barcode?: string | null }> | null;
};

type StockWarehouseInput = {
  warehouse: string;
  company?: string;
  items: Array<{
    itemRequestId?: string;
    itemCode: string;
    qty: unknown;
    warehouse?: string;
  }>;
};

function requestNeedsErp2(creationSources: Prisma.JsonValue | null | undefined) {
  return Array.isArray(creationSources) && creationSources.includes("ERP2");
}

async function advanceSeoToItemCreated(
  tx: Tx,
  request: { id: string; seoSetupStatus?: string; creationSources?: Prisma.JsonValue | null },
  metadata: Prisma.InputJsonValue,
) {
  if (request.seoSetupStatus && request.seoSetupStatus !== "PENDING") return false;
  await tx.itemCreationRequest.update({
    where: { id: request.id },
    data: {
      seoSetupStatus: "ITEM_CREATED",
      itemCreatedAt: new Date(),
      itemCreatedBy: null,
    },
  });
  await activity(tx, request.id, "SEO_ITEM_CREATED", "SYSTEM", null, metadata);
  return true;
}

type StockInput = {
  supplier: string;
  company?: string;
  postingDate?: string;
  warehouses: StockWarehouseInput[];
};

type ErpStockOptionRow = {
  name?: string;
  supplier_name?: string | null;
  warehouse_name?: string | null;
  company?: string | null;
};

async function getWarehouseCompany(cfg: OsfErpCredentials, warehouse: string) {
  const doc = await getErpDoc<{ company?: string | null }>(cfg, "Warehouse", warehouse);
  return doc?.company?.trim() || undefined;
}

function requireItemCreationPermission(context: UserContext, permission: string) {
  if (!hasPermission(context, permission) && !hasPermission(context, ITEM_CREATION_PERMISSIONS.manageAll)) {
    throw new Error("Permission denied");
  }
}

function companyId(context: UserContext) {
  const id = context.user?.companyId;
  if (!id) throw new Error("No company associated with your account");
  return id;
}

function userId(context: UserContext) {
  return context.user?.id ?? "";
}

function asDecimal(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${label} is required`);
  }
  const decimal = new Prisma.Decimal(String(value));
  if (decimal.isNaN() || decimal.lte(0)) throw new Error(`${label} must be greater than zero`);
  return decimal;
}

function authHeaders(cfg: OsfErpCredentials) {
  return {
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function unwrapData<T>(json: { data?: T } | T): T {
  if (json && typeof json === "object" && "data" in json) return (json as { data?: T }).data as T;
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
  return unwrapData<T>(json as { data?: T } | T);
}

async function resolveErps(company: string): Promise<ErpSlotSet> {
  const instances = await getAllOsfErpInstances(company);
  return {
    erp1: instances.find((i) => /erp[_\s-]*1\b/i.test(i.label ?? "")) ?? null,
    erp2: instances.find((i) => /erp[_\s-]*2\b/i.test(i.label ?? "")) ?? null,
  };
}

export async function lookupItemCreationStockItems(context: UserContext, query: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  const code = query.trim();
  if (!code) throw new Error("Enter a SKU or barcode");

  const { erp1, erp2 } = await resolveErps(companyId(context));
  const slots = [
    { erp: ItemCreationErp.ERP1, instance: erp1 },
    { erp: ItemCreationErp.ERP2, instance: erp2 },
  ];
  const results = await Promise.allSettled(
    slots.filter((slot) => slot.instance).map(async (slot) => {
      const item = await resolveTransferItemIdentity(slot.instance!.cfg, code);
      if (!item) return null;
      return {
        erp: slot.erp,
        instanceId: slot.instance!.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        barcode: item.barcode || null,
      };
    }),
  );
  const found = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  if (found.length === 0) throw new Error(`No existing item found for ${code}`);
  const uniqueCodes = [...new Set(found.map((item) => item.itemCode))];
  const [columns, ropRows] = await Promise.all([
    resolveOsfColumns(companyId(context)).then(filterStoreAllocationColumns),
    prisma.productOsfRop.findMany({
      where: { companyId: companyId(context), sku: { in: uniqueCodes } },
      select: { sku: true, columnKey: true, ropQty: true },
    }),
  ]);
  const binsByInstance = new Map<string, Map<string, number>>();
  const failedInstances = new Set<string>();
  await Promise.all(
    [...new Set(found.map((item) => item.instanceId))].map(async (instanceId) => {
      const warehouses = [...new Set(columns
        .filter((column) => column.erpnextInstanceId === instanceId)
        .flatMap((column) => column.warehouses))];
      const instance = slots.find((slot) => slot.instance?.id === instanceId)?.instance;
      if (!instance || warehouses.length === 0) return;
      try {
        binsByInstance.set(instanceId, await fetchBinActualQty({ cfg: instance.cfg, warehouses, itemCodes: uniqueCodes }));
      } catch {
        failedInstances.add(instanceId);
      }
    }),
  );
  const ropBySkuColumn = new Map(ropRows.map((row) => [`${row.sku}::${row.columnKey}`, row.ropQty]));
  const enriched = found.map((item) => {
    const itemColumns = columns.filter((column) => column.erpnextInstanceId === item.instanceId);
    const rop = itemColumns.reduce((sum, column) => sum + (ropBySkuColumn.get(`${item.itemCode}::${column.key}`) ?? 0), 0);
    const bins = binsByInstance.get(item.instanceId);
    const currentStock = failedInstances.has(item.instanceId)
      ? null
      : itemColumns.reduce((sum, column) => sum + (stockForColumn(bins ?? new Map(), column.warehouses, item.itemCode) ?? 0), 0);
    const warehouseDetails = new Map<string, { warehouse: string; erp: ItemCreationErp; barcode: string | null; rop: number; stock: number | null }>();
    for (const column of itemColumns) {
      const columnRop = ropBySkuColumn.get(`${item.itemCode}::${column.key}`) ?? 0;
      for (const warehouse of column.warehouses) {
        const key = warehouse;
        const current = warehouseDetails.get(key);
        const warehouseStock = failedInstances.has(item.instanceId)
          ? null
          : bins?.get(`${warehouse}::${item.itemCode}`) ?? 0;
        warehouseDetails.set(key, {
          warehouse,
          erp: item.erp,
          barcode: item.barcode,
          rop: (current?.rop ?? 0) + columnRop,
          stock: current ? (current.stock == null || warehouseStock == null ? null : current.stock) : warehouseStock,
        });
      }
    }
    return { ...item, rop, currentStock, warehouseDetails: [...warehouseDetails.values()] };
  });
  const grouped = new Map<string, {
    itemCode: string;
    itemName: string;
    barcode: string | null;
    rop: number;
    currentStock: number | null;
    warehouseDetails: Array<{ warehouse: string; erp: ItemCreationErp; barcode: string | null; rop: number; stock: number | null }>;
    erps: ItemCreationErp[];
  }>();
  for (const item of enriched) {
    const key = normalizeSkuKey(item.itemCode);
    const current = grouped.get(key) ?? {
      itemCode: item.itemCode,
      itemName: item.itemName,
      barcode: item.barcode,
      rop: 0,
      currentStock: 0,
      warehouseDetails: [],
      erps: [],
    };
    if (!current.erps.includes(item.erp)) current.erps.push(item.erp);
    if (!current.barcode && item.barcode) current.barcode = item.barcode;
    current.rop += item.rop;
    current.currentStock = current.currentStock == null || item.currentStock == null
      ? null
      : current.currentStock + item.currentStock;
    for (const detail of item.warehouseDetails) {
      const existing = current.warehouseDetails.find((row) => row.erp === detail.erp && row.warehouse === detail.warehouse);
      if (existing) {
        if (!existing.barcode && detail.barcode) existing.barcode = detail.barcode;
        existing.rop += detail.rop;
        if (existing.stock == null || detail.stock == null) existing.stock = null;
      } else {
        current.warehouseDetails.push(detail);
      }
    }
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

async function activity(
  tx: Tx,
  itemRequestId: string,
  type: string,
  source: ItemCreationUpdateSource,
  user: string | null,
  metadata?: Prisma.InputJsonValue,
) {
  await tx.itemCreationActivity.create({
    data: {
      itemRequestId,
      type,
      source,
      userId: user,
      metadata: metadata ?? Prisma.JsonNull,
    },
  });
}

async function findErpDoc<T extends { name?: string }>(
  cfg: OsfErpCredentials,
  doctype: string,
  filters: unknown[],
  fields: string[] = ["name"],
): Promise<T | null> {
  const path =
    `/api/resource/${encodeURIComponent(doctype)}?filters=${encodeURIComponent(JSON.stringify(filters))}` +
    `&fields=${encodeURIComponent(JSON.stringify(fields))}&limit_page_length=1`;
  const rows = await erpJson<T[]>(cfg, path);
  return rows[0] ?? null;
}

async function getErpDoc<T>(cfg: OsfErpCredentials, doctype: string, name: string): Promise<T | null> {
  try {
    return await erpJson<T>(cfg, `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("[404]")) return null;
    throw error;
  }
}

async function createErpDoc<T>(cfg: OsfErpCredentials, doctype: string, body: Record<string, unknown>) {
  return erpJson<T>(cfg, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function updateErpDoc<T>(cfg: OsfErpCredentials, doctype: string, name: string, body: Record<string, unknown>) {
  return erpJson<T>(cfg, `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

async function submitErpDoc<T extends Record<string, unknown>>(cfg: OsfErpCredentials, doc: T) {
  return erpJson<T>(cfg, "/api/method/frappe.client.submit", {
    method: "POST",
    body: JSON.stringify({ doc }),
  });
}

function validBarcodes(payload: ErpItemWebhookPayload) {
  return [
    ...new Set(
      (payload.barcodes ?? [])
        .map((row) => row?.barcode?.trim())
        .filter((barcode): barcode is string => Boolean(barcode)),
    ),
  ];
}

async function ensureErpBrand(cfg: OsfErpCredentials, brand: string) {
  const value = brand.trim();
  if (!value) return null;
  const existing = await getErpDoc<Record<string, unknown>>(cfg, "Brand", value);
  if (existing) return value;
  await createErpDoc(cfg, "Brand", { brand: value });
  return value;
}

async function setErpItemProductPriority(cfg: OsfErpCredentials, itemCode: string) {
  let lastError: unknown = null;
  const fields = [...new Set(ITEM_CREATION_PRODUCT_PRIORITY_FIELDS.map((field) => field.trim()).filter(Boolean))];
  const values = [...new Set(ITEM_CREATION_PRODUCT_PRIORITY_VALUES.map((value) => value.trim()).filter(Boolean))];
  for (const field of fields) {
    for (const value of values) {
      try {
        await updateErpDoc<Record<string, unknown>>(cfg, "Item", itemCode, { [field]: value });
        return { field, value };
      } catch (error) {
        lastError = error;
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : "No Product Priority field candidates were accepted";
  throw new Error(`Could not set Product Priority for ${itemCode}: ${message}`);
}

async function setErpItemTaxStatus(cfg: OsfErpCredentials, itemCode: string, taxStatus: string) {
  await updateErpDoc<Record<string, unknown>>(cfg, "Item", itemCode, {
    custom_tax_status: taxStatus,
  });
  return { field: "custom_tax_status", value: taxStatus };
}

async function ensureErp2Item(input: {
  cfg: OsfErpCredentials;
  itemCode: string;
  itemName: string;
  brand: string;
  barcodes: string[];
  taxStatus: string;
}) {
  const existing = await getErpDoc<Record<string, unknown>>(input.cfg, "Item", input.itemCode);
  if (existing) {
    const body: Record<string, unknown> = isVaultOsDeployment() ? {} : { custom_tax_status: input.taxStatus };
    if (input.barcodes.length > 0) {
      body.barcodes = input.barcodes.map((barcode) => ({ barcode }));
    }
    if (Object.keys(body).length > 0) {
      await updateErpDoc<Record<string, unknown>>(input.cfg, "Item", input.itemCode, body);
    }
    await setErpItemProductPriority(input.cfg, input.itemCode);
    return { itemCode: input.itemCode, created: false, barcodeUpdated: input.barcodes.length > 0, taxStatusUpdated: true };
  }

  await ensureErpBrand(input.cfg, input.brand);
  const itemName = input.itemName.trim() || input.itemCode;
  await createErpDoc(input.cfg, "Item", {
    item_code: input.itemCode,
    item_name: itemName,
    item_group: process.env.ITEM_CREATION_ERP_ITEM_GROUP ?? "Products",
    stock_uom: process.env.ITEM_CREATION_ERP_STOCK_UOM ?? "Nos",
    brand: input.brand.trim() || undefined,
    description: `${itemName} in Sri Lanka`,
    ...(isVaultOsDeployment() ? {} : { custom_tax_status: input.taxStatus }),
    barcodes: input.barcodes.map((barcode) => ({ barcode })),
  });
  await setErpItemProductPriority(input.cfg, input.itemCode);
  return { itemCode: input.itemCode, created: true, barcodeUpdated: input.barcodes.length > 0, taxStatusUpdated: true };
}

export async function handleErp1ItemWebhook(companyIds: string[], payload: ErpItemWebhookPayload) {
  const itemCode = payload.item_code?.trim();
  if (!itemCode) throw new Error("item_code is required");
  const now = new Date();
  const itemName = payload.item_name?.trim() || itemCode;
  const brand = payload.brand?.trim() || "";
  const barcodes = validBarcodes(payload);

  const requests = await prisma.itemCreationRequest.findMany({
    where: {
      companyId: { in: companyIds },
      sku: { equals: itemCode, mode: "insensitive" },
      overallStatus: "IN_PROGRESS",
    },
    select: { id: true, companyId: true, creationSources: true, seoSetupStatus: true, taxStatus: true },
  });
  if (requests.length === 0) return { matched: 0, skipped: "no_active_request" };

  let completed = 0;
  let failed = 0;
  let skippedErp2 = 0;
  let advancedSeo = 0;
  let priorityUpdated = 0;
  let priorityFailed = 0;
  let taxStatusUpdated = 0;
  let taxStatusFailed = 0;
  for (const request of requests) {
    await prisma.$transaction(async (tx) => {
      await tx.itemCreationRequest.update({
        where: { id: request.id },
        data: {
          erp1ItemCode: itemCode,
          erp1ItemName: itemName,
          erp1Brand: brand,
          erp1Barcodes: barcodes,
          erp1ItemCreatedAt: now,
          erp2ItemCreationStatus: requestNeedsErp2(request.creationSources) ? "CREATING_ERP2" : "WAITING_ERP1",
          erp2ItemCreationError: null,
        },
      });
      await activity(tx, request.id, "ERP1_ITEM_RECEIVED", "ERP_WEBHOOK", null, {
        itemCode,
        brand,
        barcodes,
        modified: payload.modified ?? null,
      });
    });

    try {
      const { erp1 } = await resolveErps(request.companyId);
      if (!erp1) throw new Error("ERP1 instance is not configured");
      const priority = await setErpItemProductPriority(erp1.cfg, itemCode);
      priorityUpdated += 1;
      await prisma.itemCreationActivity.create({
        data: {
          itemRequestId: request.id,
          type: "ERP1_PRODUCT_PRIORITY_UPDATED",
          source: "SYSTEM",
          metadata: { itemCode, ...priority },
        },
      });
    } catch (error) {
      priorityFailed += 1;
      const message = error instanceof Error ? error.message : "Product Priority update failed";
      await prisma.itemCreationActivity.create({
        data: {
          itemRequestId: request.id,
          type: "ERP1_PRODUCT_PRIORITY_FAILED",
          source: "SYSTEM",
          metadata: { itemCode, error: message.slice(0, 700) },
        },
      });
    }

    if (!isVaultOsDeployment() && Array.isArray(request.creationSources) && request.creationSources.includes("SHOPIFY")) {
      try {
        const { erp1 } = await resolveErps(request.companyId);
        if (!erp1) throw new Error("ERP1 instance is not configured");
        const tax = await setErpItemTaxStatus(erp1.cfg, itemCode, request.taxStatus);
        taxStatusUpdated += 1;
        await prisma.itemCreationActivity.create({
          data: {
            itemRequestId: request.id,
            type: "ERP1_TAX_STATUS_UPDATED",
            source: "SYSTEM",
            metadata: { itemCode, ...tax },
          },
        });
      } catch (error) {
        taxStatusFailed += 1;
        const message = error instanceof Error ? error.message : "Tax status update failed";
        await prisma.itemCreationActivity.create({
          data: {
            itemRequestId: request.id,
            type: "ERP1_TAX_STATUS_FAILED",
            source: "SYSTEM",
            metadata: { itemCode, taxStatus: request.taxStatus, error: message.slice(0, 700) },
          },
        });
      }
    }

    if (!requestNeedsErp2(request.creationSources)) {
      const advanced = await prisma.$transaction((tx) =>
        advanceSeoToItemCreated(tx, request, {
          itemCode,
          reason: "selected creation sources completed",
          creationSources: request.creationSources ?? null,
        }),
      );
      if (advanced) advancedSeo += 1;
      skippedErp2 += 1;
      continue;
    }

    await prisma.itemCreationActivity.create({
      data: {
        itemRequestId: request.id,
        type: "ERP2_ITEM_CREATION_STARTED",
        source: "SYSTEM",
        metadata: { itemCode },
      },
    });

    try {
      const { erp2 } = await resolveErps(request.companyId);
      if (!erp2) throw new Error("ERP2 instance is not configured");
      const result = await ensureErp2Item({
        cfg: erp2.cfg,
        itemCode,
        itemName,
        brand,
        barcodes,
        taxStatus: request.taxStatus,
      });
      await prisma.$transaction(async (tx) => {
        await tx.itemCreationRequest.update({
          where: { id: request.id },
          data: {
            erp2ItemCode: result.itemCode,
            erp2ItemCreatedAt: new Date(),
            erp2ItemCreationStatus: "COMPLETED",
            erp2ItemCreationError: null,
          },
        });
        await activity(tx, request.id, "ERP2_ITEM_CREATED", "SYSTEM", null, {
          itemCode,
          brand,
          barcodes,
          barcodeUpdated: result.barcodeUpdated,
          taxStatusUpdated: result.taxStatusUpdated,
          taxStatus: request.taxStatus,
          reconciledExisting: !result.created,
        });
        const advanced = await advanceSeoToItemCreated(tx, request, {
          itemCode,
          erp2ItemCode: result.itemCode,
          reason: "selected creation sources completed",
          reconciledExisting: !result.created,
          creationSources: request.creationSources ?? null,
        });
        if (advanced) advancedSeo += 1;
      });
      completed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "ERP2 item creation failed";
      await prisma.$transaction(async (tx) => {
        await tx.itemCreationRequest.update({
          where: { id: request.id },
          data: { erp2ItemCreationStatus: "FAILED", erp2ItemCreationError: message.slice(0, 1000) },
        });
        await activity(tx, request.id, "ERP2_ITEM_CREATION_FAILED", "SYSTEM", null, {
          itemCode,
          error: message.slice(0, 700),
        });
      });
    }
  }
  return {
    matched: requests.length,
    completed,
    failed,
    skippedErp2,
    advancedSeo,
    priorityUpdated,
    priorityFailed,
    taxStatusUpdated,
    taxStatusFailed,
  };
}

export async function retryErp2ItemCreation(context: UserContext, id: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.manageAll);
  const request = await prisma.itemCreationRequest.findFirstOrThrow({
    where: { id, companyId: companyId(context) },
  });
  if (!request.erp1ItemCode) throw new Error("ERP1 item has not been received yet");
  if (!requestNeedsErp2(request.creationSources)) {
    throw new Error("ERP 02 was not selected for this Item Creation request");
  }
  return handleErp1ItemWebhook([request.companyId], {
    item_code: request.erp1ItemCode,
    item_name: request.erp1ItemName ?? request.description,
    brand: request.erp1Brand ?? "",
    barcodes: Array.isArray(request.erp1Barcodes)
      ? request.erp1Barcodes.map((barcode) => ({ barcode: String(barcode) }))
      : [],
  });
}

export async function syncItemCreationTaxStatus(context: UserContext, id: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.admin);
  const request = await prisma.itemCreationRequest.findFirstOrThrow({
    where: { id, companyId: companyId(context) },
    select: { id: true, companyId: true, sku: true, taxStatus: true, creationSources: true, erp1ItemCode: true, erp2ItemCode: true },
  });
  if (!isItemCreationTaxStatus(request.taxStatus)) throw new Error("Tax status is invalid");

  const errors: string[] = [];
  const updated: string[] = [];
  const sources = Array.isArray(request.creationSources) ? request.creationSources : [];

  if (sources.includes("SHOPIFY") && request.erp1ItemCode) {
    try {
      const { erp1 } = await resolveErps(request.companyId);
      if (!erp1) throw new Error("ERP1 instance is not configured");
      await setErpItemTaxStatus(erp1.cfg, request.erp1ItemCode, request.taxStatus);
      updated.push("ERP1");
    } catch (error) {
      errors.push(`ERP1: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (sources.includes("ERP2") && request.erp2ItemCode) {
    try {
      const { erp2 } = await resolveErps(request.companyId);
      if (!erp2) throw new Error("ERP2 instance is not configured");
      await setErpItemTaxStatus(erp2.cfg, request.erp2ItemCode, request.taxStatus);
      updated.push("ERP2");
    } catch (error) {
      errors.push(`ERP2: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await prisma.itemCreationActivity.create({
    data: {
      itemRequestId: request.id,
      type: errors.length > 0 ? "TAX_STATUS_UPDATE_FAILED" : "TAX_STATUS_UPDATED",
      source: "USER",
      userId: userId(context),
      metadata: { itemCode: request.sku, taxStatus: request.taxStatus, updated, errors },
    },
  });
  if (errors.length > 0) throw new Error(errors.join("; "));
  return { ok: true, updated };
}

export async function syncItemCreationItemFields(context: UserContext, id: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.admin);
  const request = await prisma.itemCreationRequest.findFirstOrThrow({
    where: { id, companyId: companyId(context) },
    select: {
      id: true,
      companyId: true,
      description: true,
      taxStatus: true,
      creationSources: true,
      erp1ItemCode: true,
      erp2ItemCode: true,
    },
  });
  const updated: string[] = [];
  const errors: string[] = [];
  const body: Record<string, unknown> = {
    item_name: request.description,
    description: `${request.description} in Sri Lanka`,
  };
  if (!isVaultOsDeployment()) body.custom_tax_status = request.taxStatus;
  const sources = Array.isArray(request.creationSources) ? request.creationSources : [];

  const targets = [
    sources.includes("SHOPIFY") && request.erp1ItemCode ? ["ERP1", request.erp1ItemCode] as const : null,
    sources.includes("ERP2") && request.erp2ItemCode ? ["ERP2", request.erp2ItemCode] as const : null,
  ].filter(
    (target): target is readonly ["ERP1", string] | readonly ["ERP2", string] => Boolean(target),
  );
  const erps = await resolveErps(request.companyId);
  for (const [erp, itemCode] of targets) {
    try {
      const cfg = erp === "ERP1" ? erps.erp1?.cfg : erps.erp2?.cfg;
      if (!cfg) throw new Error(`${erp} instance is not configured`);
      await updateErpDoc<Record<string, unknown>>(cfg, "Item", itemCode, body);
      updated.push(erp);
    } catch (error) {
      errors.push(`${erp}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await prisma.itemCreationActivity.create({
    data: {
      itemRequestId: request.id,
      type: errors.length > 0 ? "ITEM_DETAILS_UPDATE_FAILED" : "ITEM_DETAILS_UPDATED",
      source: "USER",
      userId: userId(context),
      metadata: { updated, errors },
    },
  });
  if (errors.length > 0) throw new Error(errors.join("; "));
  return { ok: true, updated };
}

async function upsertItemPrice(input: {
  cfg: OsfErpCredentials;
  itemCode: string;
  priceList: string;
  rate: Prisma.Decimal;
}) {
  const priceList = await resolvePriceListName(input.cfg, input.priceList);
  const existing = await findErpDoc<{ name: string; price_list_rate?: number }>(
    input.cfg,
    "Item Price",
    [
      ["item_code", "=", input.itemCode],
      ["price_list", "=", priceList],
    ],
    ["name", "price_list_rate"],
  );
  const body = {
    item_code: input.itemCode,
    price_list: priceList,
    price_list_rate: Number(input.rate),
    currency: process.env.ITEM_CREATION_ERP_CURRENCY ?? "LKR",
    uom: process.env.ITEM_CREATION_ERP_STOCK_UOM ?? "Nos",
  };
  const doc = existing
    ? await updateErpDoc<Record<string, unknown>>(input.cfg, "Item Price", existing.name, body)
    : await createErpDoc<Record<string, unknown>>(input.cfg, "Item Price", body);
  const resultRate = new Prisma.Decimal(String(doc.price_list_rate ?? input.rate));
  return { name: String(doc.name ?? existing?.name ?? ""), rate: resultRate, priceList };
}

async function resolvePriceListName(cfg: OsfErpCredentials, requestedName: string) {
  const normalized = requestedName.trim().toLowerCase();
  const rows = await erpJson<Array<{ name?: string }>>(
    cfg,
    `/api/resource/Price List?fields=${encodeURIComponent(JSON.stringify(["name"]))}&limit_page_length=500`,
  );
  const match = rows.find((row) => row.name?.trim().toLowerCase() === normalized);
  return match?.name?.trim() || requestedName;
}

async function updateItemCreationShopifyPrice(request: {
  companyId: string;
  sku: string;
  creationSources: Prisma.JsonValue | null;
  standardPrice: Prisma.Decimal;
}) {
  if (isVaultOsDeployment()) {
    return { ok: true, updated: 0, skipped: true as const, reason: "vault_os_shopify_admin_api_unavailable" };
  }
  if (!Array.isArray(request.creationSources) || !request.creationSources.includes("SHOPIFY")) {
    return { ok: true, updated: 0, skipped: true as const };
  }

  const shopifyLocationName = isVaultOsDeployment() ? "SupplementVault.lk" : "Cosmetics.lk";
  const productItems = await prisma.productItem.findMany({
    where: {
      companyId: request.companyId,
      sku: { equals: request.sku, mode: "insensitive" },
      companyLocation: { name: shopifyLocationName },
    },
    select: {
      id: true,
      shopifyProductId: true,
      shopifyVariantId: true,
      companyLocation: { select: { shopifyAdminStoreHandle: true, shopifyShopName: true } },
    },
  });
  const targets = new Map<string, {
    productId: string;
    variantId: string;
    storeHandle: string;
    productItemIds: string[];
  }>();
  for (const item of productItems) {
    const storeHandle = (
      item.companyLocation.shopifyAdminStoreHandle ?? item.companyLocation.shopifyShopName
    )?.trim();
    const productId = item.shopifyProductId.trim();
    const variantId = item.shopifyVariantId.trim();
    if (!storeHandle || !/\d+$/.test(productId) || !/\d+$/.test(variantId)) continue;
    const key = `${storeHandle.toLowerCase()}::${productId}::${variantId}`;
    const current = targets.get(key);
    if (current) {
      current.productItemIds.push(item.id);
    } else {
      targets.set(key, { productId, variantId, storeHandle, productItemIds: [item.id] });
    }
  }
  if (targets.size === 0) {
    return { ok: true, updated: 0, skipped: true as const, reason: "variant_not_found" };
  }

  const updatedIds: string[] = [];
  for (const target of targets.values()) {
    const result = await updateShopifyVariantPriceBySku({
      storeHandle: target.storeHandle,
      sku: request.sku,
      price: request.standardPrice.toString(),
    });
    if (result.updated) updatedIds.push(...target.productItemIds);
  }
  await prisma.productItem.updateMany({
    where: { id: { in: updatedIds } },
    data: { price: request.standardPrice },
  });
  return { ok: true, updated: targets.size, skipped: false as const };
}

export async function updateItemCreationPrices(context: UserContext, id: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.purchasing);
  const scopedCompanyId = companyId(context);
  const request = await prisma.itemCreationRequest.findFirstOrThrow({
    where: { id, companyId: scopedCompanyId },
  });
  if (request.purchasingStatus !== "WAITING_FOR_PRICES") {
    throw new Error("Only waiting purchasing requests can update prices");
  }
  const { erp1, erp2 } = await resolveErps(request.companyId);
  const needsErp2 = requestNeedsErp2(request.creationSources);
  const vaultOs = isVaultOsDeployment();
  const needsErp1Ogf = !vaultOs && (request.addErp1OgfPrice || Boolean(request.ogfPrice && !needsErp2));
  const operations = [
    { key: "erp1Standard" as const, erp: ItemCreationErp.ERP1, cfg: erp1?.cfg ?? null, priceList: ITEM_CREATION_PRICE_LISTS.STANDARD, rate: request.standardPrice },
    ...(needsErp1Ogf
      ? [{ key: "erp1Ogf" as const, erp: ItemCreationErp.ERP1, cfg: erp1?.cfg ?? null, priceList: ITEM_CREATION_PRICE_LISTS.OGF, rate: request.ogfPrice }]
      : []),
    ...(needsErp2
      ? [
          { key: "erp2Standard" as const, erp: ItemCreationErp.ERP2, cfg: erp2?.cfg ?? null, priceList: ITEM_CREATION_PRICE_LISTS.STANDARD, rate: request.standardPrice },
          ...(!vaultOs
            ? [
                { key: "erp2Ogf" as const, erp: ItemCreationErp.ERP2, cfg: erp2?.cfg ?? null, priceList: ITEM_CREATION_PRICE_LISTS.OGF, rate: request.ogfPrice },
                { key: "erp2Gcc" as const, erp: ItemCreationErp.ERP2, cfg: erp2?.cfg ?? null, priceList: ITEM_CREATION_PRICE_LISTS.GCC, rate: request.gccPrice },
              ]
            : []),
        ]
      : []),
  ];

  const staleRunBefore = new Date(Date.now() - 30 * 60 * 1000);
  const claim = await prisma.itemCreationRequest.updateMany({
    where: {
      id,
      companyId: scopedCompanyId,
      purchasingStatus: "WAITING_FOR_PRICES",
      OR: [
        { erp1StandardPriceStatus: { not: "UPDATING" } },
        { erp1StandardPriceStatus: "UPDATING", updatedAt: { lt: staleRunBefore } },
      ],
    },
    data: { erp1StandardPriceStatus: "UPDATING" },
  });
  if (claim.count !== 1) throw new Error("Price update is already in progress for this item");

  await prisma.itemCreationRequest.update({
    where: { id },
    data: {
      erp1OgfPriceStatus: needsErp1Ogf && request.ogfPrice ? "UPDATING" : "NOT_REQUIRED",
      erp2StandardPriceStatus: needsErp2 ? "UPDATING" : "NOT_REQUIRED",
      erp2OgfPriceStatus: !vaultOs && needsErp2 && request.ogfPrice ? "UPDATING" : "NOT_REQUIRED",
      erp2GccPriceStatus: !vaultOs && needsErp2 && request.gccPrice ? "UPDATING" : "NOT_REQUIRED",
      erp1StandardPriceError: null,
      erp1OgfPriceError: null,
      erp2StandardPriceError: null,
      erp2OgfPriceError: null,
      erp2GccPriceError: null,
    },
  });

  const results: Record<string, unknown> = {};
  for (const op of operations) {
    if (!op.rate) continue;
    const eventBase =
      op.key === "erp1Standard"
        ? "ERP1_STANDARD_PRICE"
        : op.key === "erp1Ogf"
          ? "ERP1_OGF_PRICE"
          : op.key === "erp2Standard"
            ? "ERP2_STANDARD_PRICE"
            : op.key === "erp2Ogf"
              ? "ERP2_OGF_PRICE"
              : "ERP2_GCC_PRICE";
    try {
      if (!op.cfg) throw new Error(`${op.erp} instance is not configured`);
      const saved = await upsertItemPrice({
        cfg: op.cfg,
        itemCode: request.sku,
        priceList: op.priceList,
        rate: op.rate,
      });
      const data =
        op.key === "erp1Standard"
          ? { erp1StandardPrice: saved.rate }
          : op.key === "erp1Ogf"
            ? { erp1OgfPrice: saved.rate, erp1OgfPriceStatus: "UPDATED" as const }
            : op.key === "erp2Standard"
              ? { erp2StandardPrice: saved.rate, erp2StandardPriceStatus: "UPDATED" as const }
              : op.key === "erp2Ogf"
                ? { erp2OgfPrice: saved.rate, erp2OgfPriceStatus: "UPDATED" as const }
                : { erp2GccPrice: saved.rate, erp2GccPriceStatus: "UPDATED" as const };
      await prisma.$transaction(async (tx) => {
        await tx.itemCreationRequest.update({ where: { id }, data });
        await activity(tx, id, `${eventBase}_UPDATED`, "SYSTEM", userId(context), {
          erp: op.erp,
          itemCode: request.sku,
          priceList: saved.priceList,
          rate: Number(saved.rate),
          itemPrice: saved.name,
        });
      });
      results[op.key] = { ok: true, rate: saved.rate.toString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Item Price update failed";
      const data =
        op.key === "erp1Standard"
          ? { erp1StandardPriceError: message.slice(0, 1000) }
          : op.key === "erp1Ogf"
            ? { erp1OgfPriceStatus: "FAILED" as const, erp1OgfPriceError: message.slice(0, 1000) }
            : op.key === "erp2Standard"
              ? { erp2StandardPriceStatus: "FAILED" as const, erp2StandardPriceError: message.slice(0, 1000) }
              : op.key === "erp2Ogf"
                ? { erp2OgfPriceStatus: "FAILED" as const, erp2OgfPriceError: message.slice(0, 1000) }
                : { erp2GccPriceStatus: "FAILED" as const, erp2GccPriceError: message.slice(0, 1000) };
      await prisma.$transaction(async (tx) => {
        await tx.itemCreationRequest.update({ where: { id }, data });
        await activity(tx, id, `${eventBase}_FAILED`, "SYSTEM", userId(context), {
          erp: op.erp,
          itemCode: request.sku,
          priceList: op.priceList,
          rate: Number(op.rate),
          error: message.slice(0, 700),
        });
      });
      results[op.key] = { ok: false, error: message };
    }
  }

  await prisma.itemCreationRequest.update({
    where: { id },
    data: {
      erp1StandardPriceStatus: (results.erp1Standard as { ok?: boolean } | undefined)?.ok
        ? "UPDATED"
        : "FAILED",
    },
  });
  let shopifyPriceResult: { ok: boolean; updated: number; skipped: boolean; reason?: string; error?: string } = {
    ok: true,
    updated: 0,
    skipped: true,
  };
  try {
    shopifyPriceResult = await updateItemCreationShopifyPrice(request);
    results.shopify = shopifyPriceResult;
    await prisma.itemCreationActivity.create({
      data: {
        itemRequestId: id,
        type: shopifyPriceResult.skipped
          ? "SHOPIFY_STANDARD_PRICE_SKIPPED"
          : "SHOPIFY_STANDARD_PRICE_UPDATED",
        source: "SYSTEM",
        userId: userId(context),
        metadata: {
          sku: request.sku,
          rate: Number(request.standardPrice),
          updated: shopifyPriceResult.updated,
          skipped: shopifyPriceResult.skipped,
          reason: shopifyPriceResult.reason ?? null,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify price update failed";
    shopifyPriceResult = { ok: false, updated: 0, skipped: false, error: message };
    results.shopify = shopifyPriceResult;
    await prisma.itemCreationActivity.create({
      data: {
        itemRequestId: id,
        type: "SHOPIFY_STANDARD_PRICE_FAILED",
        source: "SYSTEM",
        userId: userId(context),
        metadata: {
          sku: request.sku,
          rate: Number(request.standardPrice),
          error: message.slice(0, 700),
        },
      },
    });
  }
  const refreshed = await prisma.itemCreationRequest.findUniqueOrThrow({ where: { id } });
  const requiredUpdated =
    refreshed.erp1StandardPriceStatus === "UPDATED" &&
    (vaultOs || !(refreshed.addErp1OgfPrice || (refreshed.ogfPrice && !requestNeedsErp2(refreshed.creationSources))) ||
      refreshed.erp1OgfPriceStatus === "UPDATED") &&
    (!requestNeedsErp2(refreshed.creationSources) ||
      (refreshed.erp2StandardPriceStatus === "UPDATED" &&
        (vaultOs || !refreshed.ogfPrice || refreshed.erp2OgfPriceStatus === "UPDATED") &&
        (vaultOs || !refreshed.gccPrice || refreshed.erp2GccPriceStatus === "UPDATED"))) &&
    shopifyPriceResult.ok;
  if (requiredUpdated) {
    await prisma.$transaction(async (tx) => {
      await tx.itemCreationRequest.update({
        where: { id },
        data: {
          purchasingStatus: "PRICE_UPDATED",
          priceUpdatedAt: new Date(),
          priceUpdatedBy: userId(context),
          priceUpdatedSource: "USER",
          pricesUpdatedAt: new Date(),
          pricesUpdatedBy: userId(context),
          storeStockStatus: refreshed.storeStockStatus === "STOCK_ADDED" ? "STOCK_ADDED" : "READY_FOR_STOCK",
          stockReadyAt: refreshed.stockReadyAt ?? new Date(),
        },
      });
      await activity(tx, id, "PRICE_UPDATED_MANUALLY", "USER", userId(context));
      if (refreshed.storeStockStatus !== "STOCK_ADDED") {
        await activity(tx, id, "STORE_STOCK_READY", "SYSTEM", null);
      }
      if (refreshed.storeStockStatus === "STOCK_ADDED" && refreshed.seoActivationStatus === "LOCKED") {
        await tx.itemCreationRequest.update({
          where: { id },
          data: { seoActivationStatus: "WAITING_ACTIVATION" },
        });
        await activity(tx, id, "SEO_ACTIVATION_UNLOCKED", "SYSTEM", null);
      }
    });
  }
  return { ok: requiredUpdated, results };
}

export async function getItemCreationPricing(context: UserContext, id: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.purchasing);
  const request = await prisma.itemCreationRequest.findFirstOrThrow({
    where: { id, companyId: companyId(context) },
    select: {
      standardPrice: true,
      ogfPrice: true,
      gccPrice: true,
      addErp1OgfPrice: true,
      erp1StandardPrice: true,
      erp1OgfPrice: true,
      erp2StandardPrice: true,
      erp2OgfPrice: true,
      erp2GccPrice: true,
      erp1StandardPriceStatus: true,
      erp1OgfPriceStatus: true,
      erp2StandardPriceStatus: true,
      erp2OgfPriceStatus: true,
      erp2GccPriceStatus: true,
      erp1StandardPriceError: true,
      erp1OgfPriceError: true,
      erp2StandardPriceError: true,
      erp2OgfPriceError: true,
      erp2GccPriceError: true,
      pricesUpdatedAt: true,
    },
  });
  return request;
}

async function createPurchaseReceipt(input: {
  cfg: OsfErpCredentials;
  supplier: string;
  warehouse: string;
  company?: string;
  createdByEmail?: string;
  postingDate: string;
  items: Array<{ itemCode: string; qty: Prisma.Decimal; warehouse?: string }>;
}) {
  const body = {
    supplier: input.supplier,
    company: input.company || undefined,
    created_by: input.createdByEmail || undefined,
    items: input.items.map((item) => ({
      item_code: item.itemCode,
      qty: Number(item.qty),
      accepted_qty: Number(item.qty),
      warehouse: item.warehouse ?? input.warehouse,
      rate: 0,
      amount: 0,
    })),
  };
  const created = await createErpDoc<Record<string, unknown>>(input.cfg, "Purchase Receipt", body);
  const name = String(created.name ?? "");
  if (!name) throw new Error("ERPNext did not return a Purchase Receipt name");
  const fullDoc = await getErpDoc<Record<string, unknown>>(input.cfg, "Purchase Receipt", name);
  const submitted = await submitErpDoc<Record<string, unknown>>(input.cfg, {
    ...(fullDoc ?? created),
    doctype: "Purchase Receipt",
  });
  return String(submitted.name ?? name);
}

export async function createStoreAllocationPurchaseReceipts(
  context: UserContext,
  input: {
    supplier: string;
    items: Array<{
      sku: string;
      qty: number;
      warehouse: string;
      erpInstanceId: string;
      company?: string | null;
    }>;
  },
) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  const supplier = input.supplier?.trim();
  if (!supplier) throw new Error("Supplier is required");
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("At least one allocation is required");

  const instances = await getAllOsfErpInstances(companyId(context));
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));
  const groups = new Map<string, { cfg: OsfErpCredentials; company: string; warehouse: string; items: typeof input.items }>();

  for (const item of input.items) {
    const sku = item.sku?.trim();
    const warehouse = item.warehouse?.trim();
    const instance = instanceById.get(item.erpInstanceId);
    if (!sku || !warehouse || !instance) throw new Error("Each allocation needs a valid SKU, warehouse, and ERP instance");
    if (!Number.isFinite(item.qty) || item.qty <= 0) throw new Error(`Quantity for ${sku} must be greater than zero`);
    // The UI company value is a display label and may include the warehouse name.
    // ERPNext requires the exact Company linked to the selected Warehouse.
    const company = await getWarehouseCompany(instance.cfg, warehouse);
    if (!company) throw new Error(`Company is not configured on warehouse ${warehouse}`);
    const key = `${instance.id}:${company}:${warehouse}`;
    const group = groups.get(key) ?? { cfg: instance.cfg, company, warehouse, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  const receipts: string[] = [];
  for (const group of groups.values()) {
    receipts.push(await createPurchaseReceipt({
      cfg: group.cfg,
      supplier,
      warehouse: group.warehouse,
      company: group.company,
      createdByEmail: context.user?.email?.trim() || undefined,
      postingDate: new Date().toISOString().slice(0, 10),
      items: group.items.map((item) => ({
        itemCode: item.sku,
        qty: new Prisma.Decimal(item.qty),
        warehouse: item.warehouse,
      })),
    }));
  }
  return receipts;
}

function validateStockInput(input: StockInput) {
  const supplier = input.supplier?.trim();
  if (!supplier) throw new Error("Supplier is required");
  if (!Array.isArray(input.warehouses) || input.warehouses.length === 0) {
    throw new Error("At least one warehouse group is required");
  }
  return {
    supplier,
    company: input.company?.trim() || undefined,
    postingDate: input.postingDate?.trim() || new Date().toISOString().slice(0, 10),
    warehouses: input.warehouses.map((warehouseGroup) => {
      const warehouse = warehouseGroup.warehouse?.trim();
      if (!warehouse) throw new Error("Warehouse is required");
      if (!Array.isArray(warehouseGroup.items) || warehouseGroup.items.length === 0) {
        throw new Error(`At least one item is required for ${warehouse}`);
      }
      const seen = new Set<string>();
      const items = warehouseGroup.items.map((item) => {
        const itemCode = item.itemCode?.trim();
        const itemRequestId = item.itemRequestId?.trim() || undefined;
        const itemWarehouse = item.warehouse?.trim() || warehouse;
        if (!itemCode) throw new Error("Each stock row needs itemCode");
        const key = normalizeSkuKey(itemCode);
        const stockKey = `${key}:${itemWarehouse}`;
        if (seen.has(stockKey)) throw new Error(`Duplicate item ${itemCode} in warehouse ${itemWarehouse}`);
        seen.add(stockKey);
        return {
          itemRequestId,
          itemCode,
          warehouse: itemWarehouse,
          qty: asDecimal(item.qty, `Qty for ${itemCode}`),
        };
      });
      return { warehouse, company: warehouseGroup.company?.trim() || undefined, items };
    }),
  };
}

export async function createWarehousePurchaseReceipts(
  context: UserContext,
  erp: ItemCreationErp,
  input: StockInput,
) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  const company = companyId(context);
  const parsed = validateStockInput(input);
  const { erp1, erp2 } = await resolveErps(company);
  const cfg = erp === "ERP1" ? erp1?.cfg : erp2?.cfg;
  if (!cfg) throw new Error(`${erp} instance is not configured`);

  const ids = parsed.warehouses
    .flatMap((w) => w.items.map((item) => item.itemRequestId))
    .filter((id): id is string => Boolean(id));
  const requests = ids.length === 0 ? [] : await prisma.itemCreationRequest.findMany({
    where: { id: { in: ids }, companyId: company, overallStatus: "IN_PROGRESS" },
    select: {
      id: true,
      sku: true,
      seoSetupStatus: true,
      digitalMarketingStatus: true,
      storeStockStatus: true,
    },
  });
  const requestById = new Map(requests.map((request) => [request.id, request]));

  type ParsedStockItem = (typeof parsed.warehouses)[number]["items"][number];
  const receiptGroups = new Map<string, { company: string; warehouse: string; items: ParsedStockItem[] }>();
  for (const warehouseGroup of parsed.warehouses) {
    for (const item of warehouseGroup.items) {
      if (item.itemRequestId) {
        const request = requestById.get(item.itemRequestId);
        if (!request) throw new Error(`Item request not found for ${item.itemCode}`);
        if (normalizeSkuKey(request.sku) !== normalizeSkuKey(item.itemCode)) {
          throw new Error(`SKU mismatch for ${item.itemCode}`);
        }
        if (request.seoSetupStatus === "PENDING") {
          throw new Error(`${item.itemCode} cannot receive stock until the item is created`);
        }
        if (request.digitalMarketingStatus !== "IMAGE_CREATED") {
          throw new Error(`${item.itemCode} cannot receive stock until the Digital Marketing image is ready`);
        }
        if (erp === "ERP1" && request.storeStockStatus === "STOCK_ADDED") {
          throw new Error(`${item.itemCode} already has stock added`);
        }
      } else {
        const existing = await findErpDoc<{ name?: string }>(cfg, "Item", [["item_code", "=", item.itemCode]], ["name"]);
        if (!existing) throw new Error(`Existing ERP item not found for ${item.itemCode}`);
      }
    }
    const itemWarehouses = [...new Set(warehouseGroup.items.map((item) => item.warehouse))];
    const warehouseCompanies = await Promise.all(
      itemWarehouses.map(async (warehouse) => ({
        warehouse,
        company: await getWarehouseCompany(cfg, warehouse),
      })),
    );
    const warehouseCompany = warehouseCompanies[0]?.company;
    if (!warehouseCompany) {
      throw new Error(`Company is not configured on warehouse ${warehouseCompanies[0]?.warehouse ?? warehouseGroup.warehouse}`);
    }
    const mismatchedWarehouse = warehouseCompanies.find((entry) => entry.company !== warehouseCompany);
    if (mismatchedWarehouse) {
      throw new Error(`Warehouse ${mismatchedWarehouse.warehouse} belongs to a different company`);
    }
    const receiptGroup = receiptGroups.get(warehouseCompany) ?? {
      company: warehouseCompany,
      warehouse: warehouseGroup.warehouse,
      items: [],
    };
    receiptGroup.items.push(...warehouseGroup.items);
    receiptGroups.set(warehouseCompany, receiptGroup);
  }

  const receiptIds: string[] = [];
  for (const receiptGroup of receiptGroups.values()) {
    const receipt = await prisma.itemCreationStockReceipt.create({
      data: {
        companyId: company,
        erp,
        supplier: parsed.supplier,
        warehouse: receiptGroup.warehouse,
        status: "PENDING",
        createdBy: userId(context),
        items: {
          create: receiptGroup.items.map((item) => ({
            itemRequestId: item.itemRequestId,
            itemCode: item.itemCode,
            qty: item.qty,
          })),
        },
      },
      include: { items: true },
    });
    receiptIds.push(receipt.id);
    await prisma.itemCreationStockReceipt.update({
      where: { id: receipt.id },
      data: { status: "CREATING" },
    });
    await Promise.all(
      receipt.items.filter((item) => item.itemRequestId).map((item) =>
        prisma.itemCreationActivity.create({
          data: {
            itemRequestId: item.itemRequestId!,
            type: "PR_CREATION_STARTED",
            source: "USER",
            userId: userId(context),
            metadata: { erp, supplier: parsed.supplier, warehouse: receiptGroup.warehouse },
          },
        }),
      ),
    );

    try {
      const prName = await createPurchaseReceipt({
        cfg,
        supplier: parsed.supplier,
        warehouse: receiptGroup.warehouse,
        company: receiptGroup.company,
        createdByEmail: context.user?.email?.trim() || undefined,
        postingDate: parsed.postingDate,
        items: receiptGroup.items.map((item) => ({
          itemCode: item.itemCode,
          qty: item.qty,
          warehouse: item.warehouse,
        })),
      });
      await prisma.$transaction(async (tx) => {
        await tx.itemCreationStockReceipt.update({
          where: { id: receipt.id },
          data: {
            purchaseReceipt: prName,
            status: "SUBMITTED",
            error: null,
            submittedAt: new Date(),
          },
        });
        for (const item of receipt.items.filter((row) => row.itemRequestId)) {
          await activity(tx, item.itemRequestId!, "PR_SUBMITTED", "SYSTEM", userId(context), {
            erp,
            purchaseReceipt: prName,
            supplier: parsed.supplier,
            warehouse: receiptGroup.warehouse,
            itemCode: item.itemCode,
            qty: Number(item.qty),
          });
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Purchase Receipt creation failed";
      await prisma.$transaction(async (tx) => {
        await tx.itemCreationStockReceipt.update({
          where: { id: receipt.id },
          data: { status: "FAILED", error: message.slice(0, 1000) },
        });
        for (const item of receipt.items.filter((row) => row.itemRequestId)) {
          await activity(tx, item.itemRequestId!, "PR_FAILED", "SYSTEM", userId(context), {
            erp,
            supplier: parsed.supplier,
            warehouse: receiptGroup.warehouse,
            itemCode: item.itemCode,
            qty: Number(item.qty),
            error: message.slice(0, 700),
          });
        }
      });
    }
  }

  await updateStockCompletion(company, erp, ids, userId(context));
  return prisma.itemCreationStockReceipt.findMany({
    where: { id: { in: receiptIds } },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getItemCreationStockOptions(
  context: UserContext,
  erp: ItemCreationErp,
  options?: { allowStoreAllocation?: boolean },
) {
  if (!options?.allowStoreAllocation) {
    requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  }
  const { erp1, erp2 } = await resolveErps(companyId(context));
  const cfg = erp === "ERP1" ? erp1?.cfg : erp2?.cfg;
  if (!cfg) throw new Error(`${erp} instance is not configured`);
  const erpInstance = erp === "ERP1" ? erp1 : erp2;
  const osfColumns = await resolveOsfColumns(companyId(context));
  const warehousePriorities = new Map<string, number>();
  for (const column of osfColumns) {
    if (!column.active || (column.erpnextInstanceId && column.erpnextInstanceId !== erpInstance?.id)) continue;
    for (const warehouse of column.warehouses) {
      const current = warehousePriorities.get(warehouse);
      if (current == null || column.allocationPriority < current) {
        warehousePriorities.set(warehouse, column.allocationPriority);
      }
    }
  }

  const supplierFields = encodeURIComponent(JSON.stringify(["name", "supplier_name"]));
  const supplierFilters = encodeURIComponent(JSON.stringify([["disabled", "=", 0]]));
  const warehouseFields = encodeURIComponent(JSON.stringify(["name", "warehouse_name", "company"]));
  const warehouseFilters = encodeURIComponent(JSON.stringify([
    ["disabled", "=", 0],
    ["is_group", "=", 0],
  ]));

  const [suppliers, warehouses] = await Promise.all([
    erpJson<ErpStockOptionRow[]>(
      cfg,
      `/api/resource/Supplier?fields=${supplierFields}&filters=${supplierFilters}&limit_page_length=500&order_by=supplier_name%20asc`,
    ),
    erpJson<ErpStockOptionRow[]>(
      cfg,
      `/api/resource/Warehouse?fields=${warehouseFields}&filters=${warehouseFilters}&limit_page_length=1000&order_by=name%20asc`,
    ),
  ]);

  return {
    suppliers: suppliers
      .filter((supplier) => supplier.name)
      .map((supplier) => ({
        name: supplier.name!,
        label: supplier.supplier_name || supplier.name!,
      })),
    warehouses: warehouses
      .filter((warehouse) => warehouse.name)
      .map((warehouse) => ({
        name: warehouse.name!,
        label: warehouse.warehouse_name || warehouse.name!,
        company: warehouse.company ?? null,
        priority: warehousePriorities.get(warehouse.name!) ?? 2,
      })),
  };
}

async function updateStockCompletion(company: string, erp: ItemCreationErp, itemRequestIds: string[], actorId?: string) {
  const uniqueIds = [...new Set(itemRequestIds)];
  for (const id of uniqueIds) {
    const rows = await prisma.itemCreationStockReceiptItem.findMany({
      where: {
        itemRequestId: id,
        stockReceipt: { companyId: company, erp },
      },
      include: { stockReceipt: true },
    });
    if (rows.length === 0) continue;
    const allSubmitted = rows.every((row) => row.stockReceipt.status === "SUBMITTED");
    if (!allSubmitted) continue;
    if (erp === "ERP1") {
      await prisma.$transaction(async (tx) => {
        const request = await tx.itemCreationRequest.findUniqueOrThrow({ where: { id } });
        if (request.storeStockStatus !== "STOCK_ADDED") {
          await tx.itemCreationRequest.update({
            where: { id },
            data: {
              storeStockStatus: "STOCK_ADDED",
              stockAddedAt: new Date(),
              stockAddedBy: actorId ?? null,
              stockAddedSource: "USER",
            },
          });
          await activity(tx, id, "ERP1_STOCK_COMPLETED", "SYSTEM", actorId ?? null);
          if (request.purchasingStatus === "PRICE_UPDATED" && request.seoActivationStatus === "LOCKED") {
            await tx.itemCreationRequest.update({
              where: { id },
              data: { seoActivationStatus: "WAITING_ACTIVATION" },
            });
            await activity(tx, id, "SEO_ACTIVATION_UNLOCKED", "SYSTEM", null);
          }
        }
      });
    } else {
      await prisma.itemCreationActivity.create({
        data: {
          itemRequestId: id,
          type: "ERP2_STOCK_COMPLETED",
          source: "SYSTEM",
          userId: actorId ?? null,
          metadata: Prisma.JsonNull,
        },
      });
    }
  }
}

export async function retryPurchaseReceipt(context: UserContext, receiptId: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  const receipt = await prisma.itemCreationStockReceipt.findFirstOrThrow({
    where: { id: receiptId, companyId: companyId(context) },
    include: { items: true },
  });
  if (receipt.status === ItemCreationStockReceiptStatus.SUBMITTED) return receipt;
  const { erp1, erp2 } = await resolveErps(receipt.companyId);
  const cfg = receipt.erp === "ERP1" ? erp1?.cfg : erp2?.cfg;
  if (!cfg) throw new Error(`${receipt.erp} instance is not configured`);
  await prisma.itemCreationStockReceipt.update({
    where: { id: receipt.id },
    data: { status: "CREATING", error: null },
  });
  try {
    const warehouseCompany = await getWarehouseCompany(cfg, receipt.warehouse);
    if (!warehouseCompany) {
      throw new Error(`Company is not configured on warehouse ${receipt.warehouse}`);
    }
    const prName = await createPurchaseReceipt({
      cfg,
      supplier: receipt.supplier,
      warehouse: receipt.warehouse,
      company: warehouseCompany,
      createdByEmail: context.user?.email?.trim() || undefined,
      postingDate: new Date().toISOString().slice(0, 10),
      items: receipt.items.map((item) => ({
        itemCode: item.itemCode,
        qty: item.qty,
      })),
    });
    await prisma.itemCreationStockReceipt.update({
      where: { id: receipt.id },
      data: { status: "SUBMITTED", purchaseReceipt: prName, submittedAt: new Date(), error: null },
    });
    await updateStockCompletion(
      receipt.companyId,
      receipt.erp,
      receipt.items.map((item) => item.itemRequestId).filter((id): id is string => Boolean(id)),
      userId(context),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase Receipt retry failed";
    await prisma.itemCreationStockReceipt.update({
      where: { id: receipt.id },
      data: { status: "FAILED", error: message.slice(0, 1000) },
    });
    throw error;
  }
  return prisma.itemCreationStockReceipt.findUniqueOrThrow({
    where: { id: receiptId },
    include: { items: true },
  });
}
