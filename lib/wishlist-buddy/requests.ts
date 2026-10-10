import "server-only";

import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit-log";
import { sendCustomerEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { normalizeShopifyStoreHandle } from "@/lib/shopify-admin";
import {
  OPEN_STOCK_REQUEST_STATUSES,
  STOCK_REQUEST_STATUS_LABELS,
  isStockLookupStatus,
  isStockRequestStatus,
} from "@/lib/wishlist-buddy/constants";
import {
  buildBackInStockEmail,
  buildCheckingAvailabilityEmail,
  type StockRequestEmailInput,
} from "@/lib/wishlist-buddy/emails";
import { fetchInventoryItemSku, fetchShopifyVariantInfo } from "@/lib/wishlist-buddy/shopify-variant";
import { lookupStockAcrossErps } from "@/lib/wishlist-buddy/stock-lookup";
import {
  canEditRequest,
  canViewRequest,
  canViewScope,
  scopeFilter,
  STAFF_REQUEST_SOURCE,
  type StockRequestScope,
  type StockRequestViewer,
} from "@/lib/wishlist-buddy/access";
import {
  demoStockLookup,
  excludedWarehousesFor,
  priorityWarehouses,
  resolveStockLookupMode,
  resolveStoreHandleForLocation,
} from "@/lib/wishlist-buddy/config";
import { classifyStockLookup, type StockLookupResult, type StockSource } from "@/lib/wishlist-buddy/stock-sources";
import type { StockRequestItem, StockRequestListResponse } from "@/lib/wishlist-buddy/types";
import type {
  NotifyRequestBody,
  StaffStockRequestCreateBody,
  StockRequestListFilter,
  StockRequestPatchBody,
  StockRequestStockFilter,
} from "@/lib/wishlist-buddy/validation";

const OPEN_STATUSES = [...OPEN_STOCK_REQUEST_STATUSES] as string[];

export class StockRequestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockRequestInputError";
  }
}

/** The viewer may not see or change this request / tab. Routes map it to 403. */
export class StockRequestForbiddenError extends Error {
  constructor(message = "Permission denied") {
    super(message);
    this.name = "StockRequestForbiddenError";
  }
}

/** The Cosmo location connected to this Shopify store (not a shadow location), honouring aliases. */
export async function findStoreLocation(storeHandle: string) {
  const handle = resolveStoreHandleForLocation(storeHandle, process.env.WISHLIST_BUDDY_STORE_ALIASES);
  return prisma.companyLocation.findFirst({
    where: { shopifyAdminStoreHandle: handle, shadowParentLocationId: null },
    orderBy: [{ isMainCompany: "desc" }, { createdAt: "asc" }],
    select: { id: true, companyId: true, erpnextWarehouse: true },
  });
}

export type CreateStockRequestResult =
  | { outcome: "created"; id: string }
  | { outcome: "duplicate"; id: string };

/**
 * Saves a storefront request. Variant details come from the Shopify Admin API, not the form.
 * Callers run `runStockLookupForRequest` afterwards (outside the storefront response).
 */
export async function createStockRequestFromStorefront(input: {
  shopDomain: string;
  loggedInCustomerId: string | null;
  body: NotifyRequestBody;
}): Promise<CreateStockRequestResult> {
  const storeHandle = normalizeShopifyStoreHandle(input.shopDomain);
  if (!storeHandle) throw new StockRequestInputError("Unknown store");
  const location = await findStoreLocation(storeHandle);
  if (!location) throw new StockRequestInputError("This store is not connected to Cosmo OS");

  const variant = await fetchShopifyVariantInfo({ storeHandle, variantId: input.body.variantId });
  if (!variant) throw new StockRequestInputError("Product not found");

  const existing = await prisma.stockRequest.findFirst({
    where: {
      companyId: location.companyId,
      shopifyVariantId: variant.variantId,
      status: { in: OPEN_STATUSES },
      restockEmailSentAt: null,
      OR: [{ customerPhone: input.body.phone }, { customerEmail: input.body.email }],
    },
    select: { id: true },
  });
  if (existing) return { outcome: "duplicate", id: existing.id };

  const created = await prisma.stockRequest.create({
    data: {
      companyId: location.companyId,
      companyLocationId: location.id,
      shopifyStoreHandle: storeHandle,
      shopifyVariantId: variant.variantId,
      shopifyProductId: variant.productId,
      shopifyInventoryItemId: variant.inventoryItemId,
      shopifyCustomerId: input.loggedInCustomerId,
      sku: variant.sku,
      productTitle: variant.productTitle,
      variantTitle: variant.variantTitle,
      productUrl: variant.productUrl,
      shopName: variant.shopName,
      customerName: input.body.name,
      customerEmail: input.body.email,
      customerPhone: input.body.phone,
      stockLookupStatus: variant.sku ? "pending" : "no_sku",
    },
    select: { id: true },
  });
  return { outcome: "created", id: created.id };
}

function emailInput(row: {
  customerName: string;
  productTitle: string;
  variantTitle: string | null;
  productUrl: string | null;
  shopName: string | null;
}): StockRequestEmailInput {
  return {
    customerName: row.customerName,
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    productUrl: row.productUrl,
    shopName: row.shopName,
  };
}

/**
 * ERP stock for a SKU. Website requests exclude the warehouse Shopify sells from (it is sold out
 * there); staff requests include it and list the priority warehouses (Main Warehouse - Cosmo) first.
 */
async function lookupStockForRequest(input: {
  companyId: string;
  sku: string;
  isStaff: boolean;
  companyLocationId: string | null;
  mode: "erp" | "demo";
}): Promise<StockLookupResult> {
  if (input.mode === "demo") return demoStockLookup(input.sku);
  const priority = priorityWarehouses(process.env.WISHLIST_BUDDY_PRIORITY_WAREHOUSES);
  if (input.isStaff) {
    return lookupStockAcrossErps({ companyId: input.companyId, itemCode: input.sku, priorityWarehouses: priority });
  }
  const location = input.companyLocationId
    ? await prisma.companyLocation.findUnique({
        where: { id: input.companyLocationId },
        select: { erpnextWarehouse: true },
      })
    : null;
  return lookupStockAcrossErps({
    companyId: input.companyId,
    itemCode: input.sku,
    excludeWarehouses: excludedWarehousesFor(location?.erpnextWarehouse, process.env.WISHLIST_BUDDY_EXCLUDE_WAREHOUSES),
    priorityWarehouses: priority,
  });
}

function lookupErrorText(result: StockLookupResult): string | null {
  return result.failedInstances.length
    ? result.failedInstances.map((f) => `${f.instanceLabel || "ERP"}: ${f.error}`).join(" | ").slice(0, 2000)
    : null;
}

/**
 * Checks every ERP warehouse for the request's SKU and saves the result. For website requests,
 * when stock exists elsewhere, sends the one-time "we're checking availability and will call you"
 * email. No email is sent when there is no stock anywhere or the lookup failed.
 *
 * `initialStaffLookup`: first check of a staff request. No stock found (or the check failed) marks
 * it `awaitingStock`, so a later ERP restock reminds the creator and emails the customer; stock
 * already available means no reminder.
 */
export async function runStockLookupForRequest(
  id: string,
  options: { sendAvailabilityEmail: boolean; initialStaffLookup?: boolean } = { sendAvailabilityEmail: true },
): Promise<void> {
  const row = await prisma.stockRequest.findUnique({ where: { id } });
  if (!row) return;
  if (!row.sku) {
    await prisma.stockRequest.update({
      where: { id },
      data: { stockLookupStatus: "no_sku", stockLookupAt: new Date(), stockLookupJson: [], stockLookupError: null },
    });
    return;
  }

  const mode = resolveStockLookupMode(process.env.WISHLIST_BUDDY_STOCK_LOOKUP, process.env.NODE_ENV);
  if (mode === "off") {
    await prisma.stockRequest.update({
      where: { id },
      data: { stockLookupStatus: "skipped", stockLookupAt: new Date(), stockLookupJson: [], stockLookupError: null },
    });
    return;
  }

  const isStaff = row.source === STAFF_REQUEST_SOURCE;
  let status: "found" | "none" | "error";
  let sources: unknown[] = [];
  let errorText: string | null = null;
  try {
    const result = await lookupStockForRequest({
      companyId: row.companyId,
      sku: row.sku,
      isStaff,
      companyLocationId: row.companyLocationId,
      mode,
    });
    status = classifyStockLookup(result);
    sources = result.sources;
    errorText = lookupErrorText(result);
  } catch (error) {
    status = "error";
    errorText = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  }

  await prisma.stockRequest.update({
    where: { id },
    data: {
      stockLookupStatus: status,
      stockLookupAt: new Date(),
      stockLookupJson: sources as Prisma.InputJsonValue,
      stockLookupError: errorText,
      ...(isStaff && options.initialStaffLookup ? { awaitingStock: status !== "found" } : {}),
    },
  });

  if (isStaff || status !== "found" || !options.sendAvailabilityEmail || !row.customerEmail) return;
  const toEmail = row.customerEmail;

  // Claim first so concurrent lookups can't send twice.
  const claimed = await prisma.stockRequest.updateMany({
    where: { id, availabilityEmailSentAt: null, status: "new" },
    data: { availabilityEmailSentAt: new Date() },
  });
  if (claimed.count === 0) return;

  const email = buildCheckingAvailabilityEmail(emailInput(row));
  const sent = await sendCustomerEmail({
    toEmail,
    ...email,
    errorLabel: "wishlist-buddy availability",
  });
  if (!sent.success) {
    await prisma.stockRequest.update({ where: { id }, data: { availabilityEmailSentAt: null } });
    console.error("[Wishlist Buddy] availability email failed", { id, message: sent.message });
  }
}

/**
 * Shopify `inventory_levels/update`: when available > 0, marks every still-open request for that
 * item as restocked (phone-only requests too, so staff can call) and emails those with an email
 * once. Order placed / Not interested requests are skipped.
 *
 * Imported requests have no inventory item ID, so they are matched by the item's SKU, read from
 * Shopify; the ID is then filled in.
 */
export async function sendRestockEmailsForInventoryItem(input: {
  shopDomain: string;
  inventoryItemId: string;
  available: number;
}): Promise<{ restocked: number; sent: number; failed: number }> {
  const none = { restocked: 0, sent: 0, failed: 0 };
  if (!(input.available > 0)) return none;
  const storeHandle = normalizeShopifyStoreHandle(input.shopDomain);
  if (!storeHandle) return none;

  let sku: string | null = null;
  try {
    sku = await fetchInventoryItemSku({ storeHandle, inventoryItemId: input.inventoryItemId });
  } catch (error) {
    console.warn("[Wishlist Buddy] inventory item SKU lookup failed; matching by inventory item only", {
      inventoryItemId: input.inventoryItemId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const match: Prisma.StockRequestWhereInput = {
    shopifyStoreHandle: storeHandle,
    status: { in: OPEN_STATUSES },
    OR: [
      { shopifyInventoryItemId: input.inventoryItemId },
      ...(sku ? [{ shopifyInventoryItemId: null, sku }] : []),
    ],
  };

  const now = new Date();
  const restocked = await prisma.stockRequest.updateMany({
    where: { ...match, restockedAt: null },
    data: { restockedAt: now },
  });
  if (sku) {
    await prisma.stockRequest.updateMany({
      where: { shopifyStoreHandle: storeHandle, shopifyInventoryItemId: null, sku },
      data: { shopifyInventoryItemId: input.inventoryItemId },
    });
  }

  const rows = await prisma.stockRequest.findMany({
    where: {
      shopifyStoreHandle: storeHandle,
      status: { in: OPEN_STATUSES },
      shopifyInventoryItemId: input.inventoryItemId,
      restockEmailSentAt: null,
      customerEmail: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const outcome = await sendBackInStockEmailOnce(row);
    if (outcome === "sent") sent += 1;
    if (outcome === "failed") failed += 1;
  }
  return { restocked: restocked.count, sent, failed };
}

/**
 * Back-in-stock email for one open request, at most once: the row is claimed before sending and
 * released on failure so the next restock event retries it.
 */
async function sendBackInStockEmailOnce(row: {
  id: string;
  customerEmail: string | null;
  customerName: string;
  productTitle: string;
  variantTitle: string | null;
  productUrl: string | null;
  shopName: string | null;
}): Promise<"sent" | "failed" | "skipped"> {
  if (!row.customerEmail) return "skipped";
  const claimed = await prisma.stockRequest.updateMany({
    where: { id: row.id, restockEmailSentAt: null, status: { in: OPEN_STATUSES } },
    data: { restockEmailSentAt: new Date(), restockEmailError: null },
  });
  if (claimed.count === 0) return "skipped";

  const result = await sendCustomerEmail({
    toEmail: row.customerEmail,
    ...buildBackInStockEmail(emailInput(row)),
    errorLabel: "wishlist-buddy restock",
  });
  if (result.success) return "sent";
  await prisma.stockRequest.update({
    where: { id: row.id },
    data: { restockEmailSentAt: null, restockEmailError: (result.message ?? "Send failed").slice(0, 500) },
  });
  return "failed";
}

/**
 * Staff requests waiting for stock: when the SKU has stock in any ERP1/ERP2 warehouse (Main
 * Warehouse - Cosmo included), mark them restocked (reminds the creator via the reminder bubble)
 * and email customers who gave an email. Called from the ERP stock webhook (`skus`) and a cron.
 */
export async function checkStaffRequestsForRestock(input: {
  companyIds?: string[];
  skus?: string[];
  limit?: number;
}): Promise<{ checked: number; restocked: number; sent: number; failed: number }> {
  const totals = { checked: 0, restocked: 0, sent: 0, failed: 0 };
  const mode = resolveStockLookupMode(process.env.WISHLIST_BUDDY_STOCK_LOOKUP, process.env.NODE_ENV);
  if (mode === "off") return totals;

  const waiting = await prisma.stockRequest.findMany({
    where: {
      source: STAFF_REQUEST_SOURCE,
      awaitingStock: true,
      restockedAt: null,
      status: { in: OPEN_STATUSES },
      sku: input.skus?.length ? { in: input.skus } : { not: null },
      ...(input.companyIds?.length ? { companyId: { in: input.companyIds } } : {}),
    },
    select: { id: true, companyId: true, sku: true },
    orderBy: { createdAt: "asc" },
    take: input.limit ?? 500,
  });

  const groups = new Map<string, { companyId: string; sku: string; ids: string[] }>();
  for (const row of waiting) {
    const key = `${row.companyId}::${row.sku}`;
    const group = groups.get(key) ?? { companyId: row.companyId, sku: row.sku!, ids: [] };
    group.ids.push(row.id);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    totals.checked += group.ids.length;
    let result: StockLookupResult;
    try {
      result = await lookupStockForRequest({
        companyId: group.companyId,
        sku: group.sku,
        isStaff: true,
        companyLocationId: null,
        mode,
      });
    } catch (error) {
      console.error("[Wishlist Buddy] staff restock lookup failed", { sku: group.sku, error });
      continue;
    }
    const status = classifyStockLookup(result);
    const now = new Date();
    if (status !== "found") {
      // Keep waiting; record the latest check so staff see it is being watched.
      await prisma.stockRequest.updateMany({
        where: { id: { in: group.ids } },
        data: {
          stockLookupStatus: status,
          stockLookupAt: now,
          stockLookupJson: result.sources as unknown as Prisma.InputJsonValue,
          stockLookupError: lookupErrorText(result),
        },
      });
      continue;
    }

    const marked = await prisma.stockRequest.updateMany({
      where: { id: { in: group.ids }, restockedAt: null },
      data: {
        restockedAt: now,
        restockedWarehouse: result.sources[0]?.warehouse ?? null,
        awaitingStock: false,
        stockLookupStatus: "found",
        stockLookupAt: now,
        stockLookupJson: result.sources as unknown as Prisma.InputJsonValue,
        stockLookupError: lookupErrorText(result),
      },
    });
    totals.restocked += marked.count;

    const rows = await prisma.stockRequest.findMany({
      where: { id: { in: group.ids }, customerEmail: { not: null }, restockEmailSentAt: null },
    });
    for (const row of rows) {
      const outcome = await sendBackInStockEmailOnce(row);
      if (outcome === "sent") totals.sent += 1;
      if (outcome === "failed") totals.failed += 1;
    }
  }
  return totals;
}

/** Restocked staff requests the creator has not acted on yet (still "New"): reminder bubble. */
export async function listRestockedRequestsForCreator(input: {
  companyId: string;
  userId: string;
  limit: number;
}) {
  const where: Prisma.StockRequestWhereInput = {
    companyId: input.companyId,
    source: STAFF_REQUEST_SOURCE,
    createdById: input.userId,
    status: "new",
    restockedAt: { not: null },
  };
  const [rows, totalCount] = await Promise.all([
    prisma.stockRequest.findMany({
      where,
      select: {
        id: true,
        sku: true,
        productTitle: true,
        customerName: true,
        restockedAt: true,
        restockedWarehouse: true,
      },
      orderBy: { restockedAt: "asc" },
      take: input.limit,
    }),
    prisma.stockRequest.count({ where }),
  ]);
  return { rows, totalCount };
}

const listSelect = {
  id: true,
  createdAt: true,
  sku: true,
  productTitle: true,
  variantTitle: true,
  productUrl: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  status: true,
  remark: true,
  soldFromInstanceId: true,
  soldFromWarehouse: true,
  stockLookupStatus: true,
  stockLookupAt: true,
  stockLookupJson: true,
  stockLookupError: true,
  availabilityEmailSentAt: true,
  restockEmailSentAt: true,
  restockEmailError: true,
  restockedAt: true,
  source: true,
  lastActionAt: true,
  lastActionBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.StockRequestSelect;

type StockRequestListRow = Prisma.StockRequestGetPayload<{ select: typeof listSelect }>;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function serializeStockRequest(row: StockRequestListRow): StockRequestItem {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    sku: row.sku,
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    productUrl: row.productUrl,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    status: isStockRequestStatus(row.status) ? row.status : "new",
    remark: row.remark,
    soldFromInstanceId: row.soldFromInstanceId,
    soldFromWarehouse: row.soldFromWarehouse,
    stockLookupStatus: isStockLookupStatus(row.stockLookupStatus) ? row.stockLookupStatus : "pending",
    stockLookupAt: iso(row.stockLookupAt),
    stockSources: Array.isArray(row.stockLookupJson) ? (row.stockLookupJson as unknown as StockSource[]) : [],
    stockLookupError: row.stockLookupError,
    availabilityEmailSentAt: iso(row.availabilityEmailSentAt),
    restockEmailSentAt: iso(row.restockEmailSentAt),
    restockEmailError: row.restockEmailError,
    restockedAt: iso(row.restockedAt),
    source: row.source,
    lastActionAt: iso(row.lastActionAt),
    lastActionBy: row.lastActionBy,
  };
}

export async function listStockRequests(input: {
  companyId: string;
  status?: StockRequestListFilter;
  stock?: StockRequestStockFilter;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<StockRequestListResponse> {
  const page = input.page ?? 1;
  const limit = input.limit ?? 25;
  const search = input.search?.trim();
  const statusWhere: Prisma.StockRequestWhereInput =
    input.status === "open"
      ? { status: { in: OPEN_STATUSES } }
      : input.status
        ? { status: input.status }
        : {};
  const stockWhere: Prisma.StockRequestWhereInput =
    input.stock === "restocked"
      ? { restockedAt: { not: null } }
      : input.stock
        ? { stockLookupStatus: input.stock }
        : {};
  const where: Prisma.StockRequestWhereInput = {
    companyId: input.companyId,
    ...statusWhere,
    ...stockWhere,
    ...(search
      ? {
          OR: [
            { customerName: { contains: search, mode: "insensitive" } },
            { customerEmail: { contains: search, mode: "insensitive" } },
            { customerPhone: { contains: search.replace(/\D/g, "") || search } },
            { sku: { contains: search, mode: "insensitive" } },
            { productTitle: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.stockRequest.findMany({
      where,
      select: listSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockRequest.count({ where }),
  ]);
  return { items: items.map(serializeStockRequest), total, page, limit };
}

export async function updateStockRequest(input: {
  id: string;
  companyId: string;
  actorUserId: string;
  body: StockRequestPatchBody;
}): Promise<StockRequestItem> {
  const before = await prisma.stockRequest.findFirst({
    where: { id: input.id, companyId: input.companyId },
    select: { id: true, status: true, remark: true, soldFromInstanceId: true, soldFromWarehouse: true },
  });
  if (!before) throw new Error("Not found");

  const data: Prisma.StockRequestUpdateInput = {
    lastActionAt: new Date(),
    lastActionBy: { connect: { id: input.actorUserId } },
  };
  if (input.body.status !== undefined) data.status = input.body.status;
  if (input.body.remark !== undefined) data.remark = input.body.remark || null;
  if (input.body.soldFromInstanceId !== undefined) data.soldFromInstanceId = input.body.soldFromInstanceId || null;
  if (input.body.soldFromWarehouse !== undefined) data.soldFromWarehouse = input.body.soldFromWarehouse || null;

  const updated = await prisma.stockRequest.update({
    where: { id: input.id },
    data,
    select: listSelect,
  });

  const statusLabel = isStockRequestStatus(updated.status)
    ? STOCK_REQUEST_STATUS_LABELS[updated.status]
    : updated.status;
  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    module: "orders",
    action: "stock_request_updated",
    entityType: "stock_request",
    entityId: updated.id,
    summary: `Stock request ${updated.sku ?? updated.productTitle} set to ${statusLabel}`,
    beforeData: before,
    afterData: {
      status: updated.status,
      remark: updated.remark,
      soldFromInstanceId: updated.soldFromInstanceId,
      soldFromWarehouse: updated.soldFromWarehouse,
    },
  });

  return serializeStockRequest(updated);
}

/** Staff "refresh stock": re-runs the lookup without re-sending the availability email. */
export async function refreshStockLookup(input: { id: string; companyId: string }): Promise<StockRequestItem> {
  const row = await prisma.stockRequest.findFirst({
    where: { id: input.id, companyId: input.companyId },
    select: { id: true },
  });
  if (!row) throw new Error("Not found");
  await runStockLookupForRequest(row.id, { sendAvailabilityEmail: false });
  return serializeStockRequest(
    await prisma.stockRequest.findUniqueOrThrow({ where: { id: row.id }, select: listSelect }),
  );
}
