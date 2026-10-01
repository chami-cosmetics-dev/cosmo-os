import "server-only";

import {
  ItemCreationErp,
  ItemCreationShopifyActivationStatus,
  ItemCreationStockReceiptStatus,
  ItemCreationUpdateSource,
  Prisma,
} from "@prisma/client";

import { ITEM_CREATION_PERMISSIONS, ITEM_CREATION_PRICE_LISTS } from "@/lib/item-creation/workflow";
import { getAllOsfErpInstances, type OsfErpCredentials, type OsfErpInstance } from "@/lib/osf/erp-stock";
import { normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { normalizeShopifyStoreHandle } from "@/lib/shopify-admin";

type UserContext = NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>;
type Tx = Prisma.TransactionClient;

const SHOPIFY_API_VERSION = "2024-10";

type ErpSlotSet = {
  erp1: OsfErpInstance | null;
  erp2: OsfErpInstance | null;
};

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
    itemRequestId: string;
    itemCode: string;
    qty: unknown;
    uom?: string;
    rate?: unknown;
  }>;
};

function requestNeedsErp2(creationSources: Prisma.JsonValue | null | undefined) {
  return Array.isArray(creationSources) && creationSources.includes("ERP2");
}

type StockInput = {
  supplier: string;
  company?: string;
  postingDate?: string;
  warehouses: StockWarehouseInput[];
};

function requireItemCreationPermission(context: UserContext, permission: string) {
  if (!hasPermission(context, permission) && !hasPermission(context, ITEM_CREATION_PERMISSIONS.admin)) {
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

async function ensureErp2Item(input: {
  cfg: OsfErpCredentials;
  itemCode: string;
  itemName: string;
  brand: string;
  barcodes: string[];
}) {
  const existing = await getErpDoc<Record<string, unknown>>(input.cfg, "Item", input.itemCode);
  if (existing) return { itemCode: input.itemCode, created: false };

  await ensureErpBrand(input.cfg, input.brand);
  const itemName = input.itemName.trim() || input.itemCode;
  await createErpDoc(input.cfg, "Item", {
    item_code: input.itemCode,
    item_name: itemName,
    item_group: process.env.ITEM_CREATION_ERP_ITEM_GROUP ?? "Products",
    stock_uom: process.env.ITEM_CREATION_ERP_STOCK_UOM ?? "Nos",
    brand: input.brand.trim() || undefined,
    description: `${itemName} in Sri Lanka`,
    barcodes: input.barcodes.map((barcode) => ({ barcode })),
  });
  return { itemCode: input.itemCode, created: true };
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
    select: { id: true, companyId: true, creationSources: true },
  });
  if (requests.length === 0) return { matched: 0, skipped: "no_active_request" };

  let completed = 0;
  let failed = 0;
  let skippedErp2 = 0;
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

    if (!requestNeedsErp2(request.creationSources)) {
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
      const result = await ensureErp2Item({ cfg: erp2.cfg, itemCode, itemName, brand, barcodes });
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
          reconciledExisting: !result.created,
        });
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
  return { matched: requests.length, completed, failed, skippedErp2 };
}

export async function retryErp2ItemCreation(context: UserContext, id: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.admin);
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

async function upsertItemPrice(input: {
  cfg: OsfErpCredentials;
  itemCode: string;
  priceList: string;
  rate: Prisma.Decimal;
}) {
  const existing = await findErpDoc<{ name: string; price_list_rate?: number }>(
    input.cfg,
    "Item Price",
    [
      ["item_code", "=", input.itemCode],
      ["price_list", "=", input.priceList],
    ],
    ["name", "price_list_rate"],
  );
  const body = {
    item_code: input.itemCode,
    price_list: input.priceList,
    price_list_rate: Number(input.rate),
    currency: process.env.ITEM_CREATION_ERP_CURRENCY ?? "LKR",
    uom: process.env.ITEM_CREATION_ERP_STOCK_UOM ?? "Nos",
  };
  const doc = existing
    ? await updateErpDoc<Record<string, unknown>>(input.cfg, "Item Price", existing.name, body)
    : await createErpDoc<Record<string, unknown>>(input.cfg, "Item Price", body);
  const resultRate = new Prisma.Decimal(String(doc.price_list_rate ?? input.rate));
  return { name: String(doc.name ?? existing?.name ?? ""), rate: resultRate };
}

export async function updateItemCreationPrices(context: UserContext, id: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.purchasing);
  const request = await prisma.itemCreationRequest.findFirstOrThrow({
    where: { id, companyId: companyId(context) },
  });
  if (request.purchasingStatus !== "WAITING_FOR_PRICES") {
    throw new Error("Only waiting purchasing requests can update prices");
  }
  const { erp1, erp2 } = await resolveErps(request.companyId);
  const operations = [
    { key: "erp1Standard" as const, erp: ItemCreationErp.ERP1, cfg: erp1?.cfg ?? null, priceList: ITEM_CREATION_PRICE_LISTS.STANDARD, rate: request.standardPrice },
    { key: "erp2Standard" as const, erp: ItemCreationErp.ERP2, cfg: erp2?.cfg ?? null, priceList: ITEM_CREATION_PRICE_LISTS.STANDARD, rate: request.standardPrice },
    { key: "erp2Ogf" as const, erp: ItemCreationErp.ERP2, cfg: erp2?.cfg ?? null, priceList: ITEM_CREATION_PRICE_LISTS.OGF, rate: request.ogfPrice },
  ];

  await prisma.itemCreationRequest.update({
    where: { id },
    data: {
      erp1StandardPriceStatus: "UPDATING",
      erp2StandardPriceStatus: "UPDATING",
      erp2OgfPriceStatus: request.ogfPrice ? "UPDATING" : "NOT_REQUIRED",
      erp1StandardPriceError: null,
      erp2StandardPriceError: null,
      erp2OgfPriceError: null,
    },
  });

  const results: Record<string, unknown> = {};
  for (const op of operations) {
    if (!op.rate) continue;
    const eventBase =
      op.key === "erp1Standard"
        ? "ERP1_STANDARD_PRICE"
        : op.key === "erp2Standard"
          ? "ERP2_STANDARD_PRICE"
          : "ERP2_OGF_PRICE";
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
          ? { erp1StandardPrice: saved.rate, erp1StandardPriceStatus: "UPDATED" as const }
          : op.key === "erp2Standard"
            ? { erp2StandardPrice: saved.rate, erp2StandardPriceStatus: "UPDATED" as const }
            : { erp2OgfPrice: saved.rate, erp2OgfPriceStatus: "UPDATED" as const };
      await prisma.$transaction(async (tx) => {
        await tx.itemCreationRequest.update({ where: { id }, data });
        await activity(tx, id, `${eventBase}_UPDATED`, "SYSTEM", userId(context), {
          erp: op.erp,
          itemCode: request.sku,
          priceList: op.priceList,
          rate: Number(saved.rate),
          itemPrice: saved.name,
        });
      });
      results[op.key] = { ok: true, rate: saved.rate.toString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Item Price update failed";
      const data =
        op.key === "erp1Standard"
          ? { erp1StandardPriceStatus: "FAILED" as const, erp1StandardPriceError: message.slice(0, 1000) }
          : op.key === "erp2Standard"
            ? { erp2StandardPriceStatus: "FAILED" as const, erp2StandardPriceError: message.slice(0, 1000) }
            : { erp2OgfPriceStatus: "FAILED" as const, erp2OgfPriceError: message.slice(0, 1000) };
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

  const refreshed = await prisma.itemCreationRequest.findUniqueOrThrow({ where: { id } });
  const requiredUpdated =
    refreshed.erp1StandardPriceStatus === "UPDATED" &&
    refreshed.erp2StandardPriceStatus === "UPDATED" &&
    (!refreshed.ogfPrice || refreshed.erp2OgfPriceStatus === "UPDATED");
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
          storeStockStatus: "READY_FOR_STOCK",
          stockReadyAt: new Date(),
        },
      });
      await activity(tx, id, "PRICE_UPDATED_MANUALLY", "USER", userId(context));
      await activity(tx, id, "STORE_STOCK_READY", "SYSTEM", null);
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
      erp1StandardPrice: true,
      erp2StandardPrice: true,
      erp2OgfPrice: true,
      erp1StandardPriceStatus: true,
      erp2StandardPriceStatus: true,
      erp2OgfPriceStatus: true,
      erp1StandardPriceError: true,
      erp2StandardPriceError: true,
      erp2OgfPriceError: true,
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
  postingDate: string;
  items: Array<{ itemCode: string; qty: Prisma.Decimal; uom?: string; rate?: Prisma.Decimal | null }>;
}) {
  const body = {
    supplier: input.supplier,
    company: input.company || undefined,
    posting_date: input.postingDate,
    items: input.items.map((item) => ({
      item_code: item.itemCode,
      qty: Number(item.qty),
      warehouse: input.warehouse,
      uom: item.uom || process.env.ITEM_CREATION_ERP_STOCK_UOM || "Nos",
      rate: Number(item.rate ?? 0),
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
        const itemRequestId = item.itemRequestId?.trim();
        if (!itemCode || !itemRequestId) throw new Error("Each stock row needs itemRequestId and itemCode");
        const key = normalizeSkuKey(itemCode);
        if (seen.has(key)) throw new Error(`Duplicate item ${itemCode} in warehouse ${warehouse}`);
        seen.add(key);
        return {
          itemRequestId,
          itemCode,
          qty: asDecimal(item.qty, `Qty for ${itemCode}`),
          uom: item.uom?.trim() || undefined,
          rate: item.rate == null || item.rate === "" ? null : asDecimal(item.rate, `Rate for ${itemCode}`),
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

  const ids = parsed.warehouses.flatMap((w) => w.items.map((item) => item.itemRequestId));
  const requests = await prisma.itemCreationRequest.findMany({
    where: { id: { in: ids }, companyId: company, overallStatus: "IN_PROGRESS" },
    select: { id: true, sku: true, storeStockStatus: true },
  });
  const requestById = new Map(requests.map((request) => [request.id, request]));

  const receiptIds: string[] = [];
  for (const warehouseGroup of parsed.warehouses) {
    for (const item of warehouseGroup.items) {
      const request = requestById.get(item.itemRequestId);
      if (!request) throw new Error(`Item request not found for ${item.itemCode}`);
      if (normalizeSkuKey(request.sku) !== normalizeSkuKey(item.itemCode)) {
        throw new Error(`SKU mismatch for ${item.itemCode}`);
      }
      if (erp === "ERP1" && request.storeStockStatus !== "READY_FOR_STOCK") {
        throw new Error(`${item.itemCode} is not ready for stock`);
      }
    }

    const receipt = await prisma.itemCreationStockReceipt.create({
      data: {
        companyId: company,
        erp,
        supplier: parsed.supplier,
        warehouse: warehouseGroup.warehouse,
        status: "PENDING",
        createdBy: userId(context),
        items: {
          create: warehouseGroup.items.map((item) => ({
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
      receipt.items.map((item) =>
        prisma.itemCreationActivity.create({
          data: {
            itemRequestId: item.itemRequestId,
            type: "PR_CREATION_STARTED",
            source: "USER",
            userId: userId(context),
            metadata: { erp, supplier: parsed.supplier, warehouse: warehouseGroup.warehouse },
          },
        }),
      ),
    );

    try {
      const prName = await createPurchaseReceipt({
        cfg,
        supplier: parsed.supplier,
        warehouse: warehouseGroup.warehouse,
        company: warehouseGroup.company ?? parsed.company,
        postingDate: parsed.postingDate,
        items: warehouseGroup.items.map((item) => ({
          itemCode: item.itemCode,
          qty: item.qty,
          uom: item.uom,
          rate: item.rate,
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
        for (const item of receipt.items) {
          await activity(tx, item.itemRequestId, "PR_SUBMITTED", "SYSTEM", userId(context), {
            erp,
            purchaseReceipt: prName,
            supplier: parsed.supplier,
            warehouse: warehouseGroup.warehouse,
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
        for (const item of receipt.items) {
          await activity(tx, item.itemRequestId, "PR_FAILED", "SYSTEM", userId(context), {
            erp,
            supplier: parsed.supplier,
            warehouse: warehouseGroup.warehouse,
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
              shopifyActivationStatus: "WAITING",
            },
          });
          await activity(tx, id, "ERP1_STOCK_COMPLETED", "SYSTEM", actorId ?? null);
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
    const prName = await createPurchaseReceipt({
      cfg,
      supplier: receipt.supplier,
      warehouse: receipt.warehouse,
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
    await updateStockCompletion(receipt.companyId, receipt.erp, receipt.items.map((item) => item.itemRequestId), userId(context));
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

function getShopifyToken() {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is not configured");
  return token;
}

async function shopifyJson<T>(storeHandle: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://${storeHandle}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": getShopifyToken(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text().catch(() => "");
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(`Shopify ${init?.method ?? "GET"} ${path} [${res.status}]: ${text.slice(0, 700)}`);
  return data;
}

async function findShopifyProductBySku(company: string, sku: string) {
  const item = await prisma.productItem.findFirst({
    where: { companyId: company, sku: { equals: sku, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    select: {
      shopifyProductId: true,
      shopifyVariantId: true,
      companyLocation: { select: { shopifyAdminStoreHandle: true, shopifyShopName: true } },
    },
  });
  if (!item) throw new Error(`No Shopify ProductItem found for SKU ${sku}`);
  const storeHandle = normalizeShopifyStoreHandle(
    item.companyLocation.shopifyAdminStoreHandle ?? item.companyLocation.shopifyShopName ?? "",
  );
  if (!storeHandle) throw new Error(`No Shopify Admin store handle configured for SKU ${sku}`);
  return {
    storeHandle,
    productId: item.shopifyProductId.replace(/\D/g, ""),
    variantId: item.shopifyVariantId.replace(/\D/g, ""),
  };
}

async function activateShopifyProduct(storeHandle: string, productId: string) {
  const got = await shopifyJson<{ product?: { id: number; status?: string } }>(
    storeHandle,
    `/products/${productId}.json?fields=id,status`,
  );
  if (got?.product?.status?.toLowerCase() === "active") return { alreadyActive: true };
  await shopifyJson(storeHandle, `/products/${productId}.json`, {
    method: "PUT",
    body: JSON.stringify({ product: { id: Number(productId), status: "active" } }),
  });
  const confirmed = await shopifyJson<{ product?: { status?: string } }>(
    storeHandle,
    `/products/${productId}.json?fields=id,status`,
  );
  if (confirmed?.product?.status?.toLowerCase() !== "active") {
    throw new Error("Shopify did not confirm ACTIVE status");
  }
  return { alreadyActive: false };
}

export async function activateItemCreationShopify(context: UserContext, id: string) {
  requireItemCreationPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  const request = await prisma.itemCreationRequest.findFirstOrThrow({
    where: { id, companyId: companyId(context) },
  });
  if (request.storeStockStatus !== "STOCK_ADDED") throw new Error("ERP1 stock must be completed first");

  await prisma.itemCreationRequest.update({
    where: { id },
    data: { shopifyActivationStatus: "ACTIVATING", shopifyActivationError: null },
  });
  await prisma.itemCreationActivity.create({
    data: {
      itemRequestId: id,
      type: "SHOPIFY_ACTIVATION_STARTED",
      source: "USER",
      userId: userId(context),
      metadata: { itemCode: request.sku },
    },
  });

  try {
    const found =
      request.shopifyProductId && request.shopifyVariantId
        ? { storeHandle: "", productId: request.shopifyProductId, variantId: request.shopifyVariantId }
        : await findShopifyProductBySku(request.companyId, request.sku);
    const storeHandle = found.storeHandle || (await findShopifyProductBySku(request.companyId, request.sku)).storeHandle;
    const result = await activateShopifyProduct(storeHandle, found.productId);
    await prisma.$transaction(async (tx) => {
      await tx.itemCreationRequest.update({
        where: { id },
        data: {
          shopifyProductId: found.productId,
          shopifyVariantId: found.variantId,
          shopifyActivationStatus: "ACTIVE",
          shopifyActivatedAt: new Date(),
          shopifyActivationError: null,
          overallStatus: "COMPLETED",
          completedAt: new Date(),
        },
      });
      await activity(tx, id, "STORES_DONE", "USER", userId(context), { itemCode: request.sku });
      await activity(tx, id, "SHOPIFY_ACTIVATED", "SYSTEM", userId(context), {
        itemCode: request.sku,
        productId: found.productId,
        variantId: found.variantId,
        alreadyActive: result.alreadyActive,
      });
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify activation failed";
    await prisma.$transaction(async (tx) => {
      await tx.itemCreationRequest.update({
        where: { id },
        data: {
          shopifyActivationStatus: ItemCreationShopifyActivationStatus.FAILED,
          shopifyActivationError: message.slice(0, 1000),
        },
      });
      await activity(tx, id, "SHOPIFY_ACTIVATION_FAILED", "SYSTEM", userId(context), {
        itemCode: request.sku,
        error: message.slice(0, 700),
      });
    });
    throw error;
  }
}
