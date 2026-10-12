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
import { fetchShopifyVariantInfo } from "@/lib/wishlist-buddy/shopify-variant";
import { lookupStockAcrossErps } from "@/lib/wishlist-buddy/stock-lookup";
import {
  demoStockLookup,
  excludedWarehousesFor,
  resolveStockLookupMode,
  resolveStoreHandleForLocation,
} from "@/lib/wishlist-buddy/config";
import { classifyStockLookup, type StockSource } from "@/lib/wishlist-buddy/stock-sources";
import type { StockRequestItem, StockRequestListResponse } from "@/lib/wishlist-buddy/types";
import type {
  NotifyRequestBody,
  StockRequestListFilter,
  StockRequestPatchBody,
} from "@/lib/wishlist-buddy/validation";

const OPEN_STATUSES = [...OPEN_STOCK_REQUEST_STATUSES] as string[];

export class StockRequestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockRequestInputError";
  }
}

/** The Cosmo location connected to this Shopify store (not a shadow location), honouring aliases. */
async function findStoreLocation(storeHandle: string) {
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
 * Checks every ERP warehouse for the request's SKU and saves the result. When stock exists
 * elsewhere, sends the one-time "we're checking availability and will call you" email.
 * No email is sent when there is no stock anywhere or the lookup failed.
 */
export async function runStockLookupForRequest(
  id: string,
  options: { sendAvailabilityEmail: boolean } = { sendAvailabilityEmail: true },
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

  const location = row.companyLocationId
    ? await prisma.companyLocation.findUnique({
        where: { id: row.companyLocationId },
        select: { erpnextWarehouse: true },
      })
    : null;

  let status: "found" | "none" | "error";
  let sources: unknown[] = [];
  let errorText: string | null = null;
  try {
    const result =
      mode === "demo"
        ? demoStockLookup(row.sku)
        : await lookupStockAcrossErps({
            companyId: row.companyId,
            itemCode: row.sku,
            excludeWarehouses: excludedWarehousesFor(
              location?.erpnextWarehouse,
              process.env.WISHLIST_BUDDY_EXCLUDE_WAREHOUSES,
            ),
          });
    status = classifyStockLookup(result);
    sources = result.sources;
    errorText = result.failedInstances.length
      ? result.failedInstances.map((f) => `${f.instanceLabel || "ERP"}: ${f.error}`).join(" | ").slice(0, 2000)
      : null;
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
    },
  });

  if (status !== "found" || !options.sendAvailabilityEmail) return;

  // Claim first so concurrent lookups can't send twice.
  const claimed = await prisma.stockRequest.updateMany({
    where: { id, availabilityEmailSentAt: null, status: "new" },
    data: { availabilityEmailSentAt: new Date() },
  });
  if (claimed.count === 0) return;

  const email = buildCheckingAvailabilityEmail(emailInput(row));
  const sent = await sendCustomerEmail({
    toEmail: row.customerEmail,
    ...email,
    errorLabel: "wishlist-buddy availability",
  });
  if (!sent.success) {
    await prisma.stockRequest.update({ where: { id }, data: { availabilityEmailSentAt: null } });
    console.error("[Wishlist Buddy] availability email failed", { id, message: sent.message });
  }
}

/**
 * Shopify `inventory_levels/update`: when available > 0, email every still-open request for
 * that inventory item once. Order placed / Not interested requests are skipped.
 */
export async function sendRestockEmailsForInventoryItem(input: {
  shopDomain: string;
  inventoryItemId: string;
  available: number;
}): Promise<{ sent: number; failed: number }> {
  if (!(input.available > 0)) return { sent: 0, failed: 0 };
  const storeHandle = normalizeShopifyStoreHandle(input.shopDomain);
  if (!storeHandle) return { sent: 0, failed: 0 };

  const rows = await prisma.stockRequest.findMany({
    where: {
      shopifyStoreHandle: storeHandle,
      shopifyInventoryItemId: input.inventoryItemId,
      status: { in: OPEN_STATUSES },
      restockEmailSentAt: null,
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const claimed = await prisma.stockRequest.updateMany({
      where: { id: row.id, restockEmailSentAt: null, status: { in: OPEN_STATUSES } },
      data: { restockEmailSentAt: new Date(), restockEmailError: null },
    });
    if (claimed.count === 0) continue;

    const email = buildBackInStockEmail(emailInput(row));
    const result = await sendCustomerEmail({
      toEmail: row.customerEmail,
      ...email,
      errorLabel: "wishlist-buddy restock",
    });
    if (result.success) {
      sent += 1;
    } else {
      failed += 1;
      // Release the claim so the next inventory update retries this request.
      await prisma.stockRequest.update({
        where: { id: row.id },
        data: { restockEmailSentAt: null, restockEmailError: (result.message ?? "Send failed").slice(0, 500) },
      });
    }
  }
  return { sent, failed };
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
    lastActionAt: iso(row.lastActionAt),
    lastActionBy: row.lastActionBy,
  };
}

export async function listStockRequests(input: {
  companyId: string;
  status?: StockRequestListFilter;
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
  const where: Prisma.StockRequestWhereInput = {
    companyId: input.companyId,
    ...statusWhere,
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
