import "server-only";

import {
  ItemCreationDigitalStatus,
  ItemCreationOverallStatus,
  ItemCreationPurchasingStatus,
  ItemCreationSeoActivationStatus,
  ItemCreationSeoSetupStatus,
  ItemCreationStoreStockStatus,
  ItemCreationStoreTransferStatus,
  ItemCreationUpdateSource,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { getPriceStatus } from "@/lib/item-creation/helpers";

export const ITEM_CREATION_PERMISSIONS = {
  admin: "item_creation.admin.manage",
  seo: "item_creation.seo.manage",
  digitalMarketing: "item_creation.digital_marketing.manage",
  purchasing: "item_creation.purchasing.manage",
  stores: "item_creation.stores.manage",
} as const;

export const ITEM_CREATION_PRICE_LISTS = {
  STANDARD: process.env.ITEM_CREATION_STANDARD_PRICE_LIST ?? "Standard Selling",
  OGF: process.env.ITEM_CREATION_OGF_PRICE_LIST ?? "OGF Selling",
} as const;

const ITEM_CREATION_SOURCE_VALUES = new Set(["SHOPIFY", "ERP2"]);

type Tx = Prisma.TransactionClient;
type UserContext = NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>;

function isAdmin(context: UserContext) {
  return hasPermission(context, ITEM_CREATION_PERMISSIONS.admin);
}

export function canUseItemCreation(context: UserContext, permission: string) {
  return isAdmin(context) || hasPermission(context, permission);
}

function requireWorkflowPermission(context: UserContext, permission: string) {
  if (!canUseItemCreation(context, permission)) {
    throw new Error("Permission denied");
  }
}

function userId(context: UserContext) {
  return context.user?.id ?? "";
}

function companyId(context: UserContext) {
  const id = context.user?.companyId;
  if (!id) throw new Error("No company associated with your account");
  return id;
}

function trimSku(sku: string) {
  const value = sku.trim();
  if (!value) throw new Error("SKU is required");
  return value;
}

function toDecimal(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const decimal = new Prisma.Decimal(String(value));
  if (decimal.isNaN() || decimal.isNegative()) {
    throw new Error(`${label} must be a positive number`);
  }
  return decimal;
}

function assertHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Google Drive URL must be HTTP or HTTPS");
    }
  } catch {
    throw new Error("Google Drive URL must be a valid HTTP or HTTPS URL");
  }
}

async function activity(
  tx: Tx,
  itemRequestId: string,
  type: string,
  source: ItemCreationUpdateSource,
  actorId?: string | null,
  oldValue?: string | null,
  newValue?: string | null,
  metadata?: Prisma.InputJsonValue
) {
  await tx.itemCreationActivity.create({
    data: {
      itemRequestId,
      type,
      source,
      userId: actorId || null,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      metadata: metadata ?? Prisma.JsonNull,
    },
  });
}

async function getScopedRequest(tx: Tx, id: string, company: string) {
  const request = await tx.itemCreationRequest.findFirst({
    where: { id, companyId: company },
  });
  if (!request) throw new Error("Item Creation request not found");
  return request;
}

async function evaluateOverallCompletion(tx: Tx, id: string) {
  const request = await tx.itemCreationRequest.findUniqueOrThrow({
    where: { id },
  });
  const isComplete =
    request.seoSetupStatus === ItemCreationSeoSetupStatus.COMPLETED &&
    request.digitalMarketingStatus === ItemCreationDigitalStatus.IMAGE_CREATED &&
    request.purchasingStatus === ItemCreationPurchasingStatus.PRICE_UPDATED &&
    request.storeTransferStatus === ItemCreationStoreTransferStatus.RECEIVED &&
    request.storeStockStatus === ItemCreationStoreStockStatus.STOCK_ADDED &&
    request.seoActivationStatus === ItemCreationSeoActivationStatus.ACTIVATED;

  if (isComplete && request.overallStatus !== ItemCreationOverallStatus.COMPLETED) {
    await tx.itemCreationRequest.update({
      where: { id },
      data: {
        overallStatus: ItemCreationOverallStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await activity(
      tx,
      id,
      "REQUEST_COMPLETED",
      ItemCreationUpdateSource.SYSTEM,
      null,
      request.overallStatus,
      ItemCreationOverallStatus.COMPLETED
    );
  }
}

async function evaluatePurchasingUnlock(tx: Tx, id: string) {
  const request = await tx.itemCreationRequest.findUniqueOrThrow({ where: { id } });
  if (
    request.purchasingStatus === ItemCreationPurchasingStatus.LOCKED &&
    request.seoSetupStatus === ItemCreationSeoSetupStatus.COMPLETED &&
    request.digitalMarketingStatus === ItemCreationDigitalStatus.IMAGE_CREATED
  ) {
    await tx.itemCreationRequest.update({
      where: { id },
      data: { purchasingStatus: ItemCreationPurchasingStatus.WAITING_FOR_PRICES },
    });
    await activity(
      tx,
      id,
      "PURCHASING_UNLOCKED",
      ItemCreationUpdateSource.SYSTEM,
      null,
      request.purchasingStatus,
      ItemCreationPurchasingStatus.WAITING_FOR_PRICES
    );
  }
}

async function unlockStoreStock(tx: Tx, id: string) {
  const request = await tx.itemCreationRequest.findUniqueOrThrow({ where: { id } });
  if (
    request.purchasingStatus === ItemCreationPurchasingStatus.PRICE_UPDATED &&
    request.storeStockStatus === ItemCreationStoreStockStatus.WAITING_FOR_PRICE
  ) {
    await tx.itemCreationRequest.update({
      where: { id },
      data: {
        storeStockStatus: ItemCreationStoreStockStatus.READY_FOR_STOCK,
        stockReadyAt: new Date(),
      },
    });
    await activity(
      tx,
      id,
      "STORE_STOCK_READY",
      ItemCreationUpdateSource.SYSTEM,
      null,
      request.storeStockStatus,
      ItemCreationStoreStockStatus.READY_FOR_STOCK
    );
  }
}

async function unlockSeoActivation(tx: Tx, id: string) {
  const request = await tx.itemCreationRequest.findUniqueOrThrow({ where: { id } });
  if (
    request.storeStockStatus === ItemCreationStoreStockStatus.STOCK_ADDED &&
    request.seoActivationStatus === ItemCreationSeoActivationStatus.LOCKED
  ) {
    await tx.itemCreationRequest.update({
      where: { id },
      data: { seoActivationStatus: ItemCreationSeoActivationStatus.WAITING_ACTIVATION },
    });
    await activity(
      tx,
      id,
      "SEO_ACTIVATION_UNLOCKED",
      ItemCreationUpdateSource.SYSTEM,
      null,
      request.seoActivationStatus,
      ItemCreationSeoActivationStatus.WAITING_ACTIVATION
    );
  }
}

async function evaluatePriceCompletion(tx: Tx, id: string, source: ItemCreationUpdateSource) {
  const request = await tx.itemCreationRequest.findUniqueOrThrow({ where: { id } });
  if (request.purchasingStatus !== ItemCreationPurchasingStatus.WAITING_FOR_PRICES) {
    return;
  }
  const ready = getPriceStatus(request) === "READY";
  if (!ready) return;
  await tx.itemCreationRequest.update({
    where: { id },
    data: {
      purchasingStatus: ItemCreationPurchasingStatus.PRICE_UPDATED,
      priceUpdatedAt: new Date(),
      priceUpdatedSource: source,
    },
  });
  await activity(
    tx,
    id,
    source === ItemCreationUpdateSource.ERP_WEBHOOK
      ? "PRICE_UPDATED_AUTOMATICALLY"
      : "PRICE_UPDATED_MANUALLY",
    source,
    null,
    request.purchasingStatus,
    ItemCreationPurchasingStatus.PRICE_UPDATED
  );
  await unlockStoreStock(tx, id);
}

export async function createItemRequest(
  context: UserContext,
  input: {
    sku: string;
    description: string;
    standardPrice: unknown;
    ogfPrice?: unknown;
    country: string;
    creationSources?: unknown;
  }
) {
  const [request] = await createItemRequests(context, [input]);
  return request;
}

function validateCreateInput(input: {
  sku: string;
  description: string;
  standardPrice: unknown;
  ogfPrice?: unknown;
  country: string;
  creationSources?: unknown;
}) {
  const sku = trimSku(input.sku);
  const standardPrice = toDecimal(input.standardPrice, "Standard Price");
  const ogfPrice = toDecimal(input.ogfPrice, "OGF Price");
  if (!standardPrice) throw new Error("Standard Price is required");
  const description = input.description?.trim();
  const country = input.country?.trim();
  if (!description) throw new Error("Description is required");
  if (!country) throw new Error("Country is required");
  const requestedSources = Array.isArray(input.creationSources)
    ? input.creationSources
    : ["SHOPIFY"];
  const creationSources = [
    ...new Set(
      requestedSources
        .map((source) => String(source).trim().toUpperCase())
        .filter((source) => ITEM_CREATION_SOURCE_VALUES.has(source))
    ),
  ];
  if (creationSources.length === 0) throw new Error("At least one creation source is required");
  return { sku, standardPrice, ogfPrice, description, country, creationSources };
}

function validateDetailsInput(input: {
  sku: string;
  description: string;
  standardPrice: unknown;
  ogfPrice?: unknown;
  country: string;
}) {
  return validateCreateInput(input);
}

export async function createItemRequests(
  context: UserContext,
  inputs: Array<{
    sku: string;
    description: string;
    standardPrice: unknown;
    ogfPrice?: unknown;
    country: string;
    creationSources?: unknown;
  }>
) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.admin);
  const company = companyId(context);
  const validated = inputs.map(validateCreateInput);
  if (validated.length === 0) throw new Error("At least one item is required");
  const duplicateSkus = validated
    .map((item) => item.sku)
    .filter((sku, index, skus) => skus.indexOf(sku) !== index);
  if (duplicateSkus.length > 0) {
    throw new Error(`Duplicate SKU in request: ${Array.from(new Set(duplicateSkus)).join(", ")}`);
  }

  return prisma.$transaction(async (tx) => {
    const active = await tx.itemCreationRequest.findMany({
      where: {
        companyId: company,
        sku: { in: validated.map((item) => item.sku) },
        overallStatus: "IN_PROGRESS",
      },
      select: { sku: true },
    });
    if (active.length > 0) {
      throw new Error(
        `Active Item Creation request already exists for SKU: ${active.map((item) => item.sku).join(", ")}`
      );
    }

    const created = [];
    for (const item of validated) {
      const request = await tx.itemCreationRequest.create({
        data: {
          companyId: company,
          sku: item.sku,
          description: item.description,
          standardPrice: item.standardPrice,
          ogfPrice: item.ogfPrice,
          country: item.country,
          creationSources: item.creationSources,
          createdBy: userId(context),
        },
      });
      await activity(tx, request.id, "REQUEST_CREATED", "USER", userId(context));
      created.push(request);
    }
    return created;
  });
}

export async function listItemRequests(context: UserContext, filters: Record<string, string | null>) {
  if (
    !canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.admin) &&
    !canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.seo) &&
    !canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.digitalMarketing) &&
    !canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.purchasing) &&
    !canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.stores)
  ) {
    throw new Error("Permission denied");
  }

  const where: Prisma.ItemCreationRequestWhereInput = { companyId: companyId(context) };
  const sku = filters.sku?.trim();
  const country = filters.country?.trim();
  if (sku) where.sku = { contains: sku, mode: "insensitive" };
  if (country) where.country = { contains: country, mode: "insensitive" };
  for (const [param, field] of [
    ["overallStatus", "overallStatus"],
    ["seoSetupStatus", "seoSetupStatus"],
    ["digitalMarketingStatus", "digitalMarketingStatus"],
    ["purchasingStatus", "purchasingStatus"],
    ["storeTransferStatus", "storeTransferStatus"],
    ["storeStockStatus", "storeStockStatus"],
    ["seoActivationStatus", "seoActivationStatus"],
  ] as const) {
    const value = filters[param]?.trim();
    if (value) where[field] = value as never;
  }
  const createdFrom = filters.createdFrom?.trim();
  const createdTo = filters.createdTo?.trim();
  if (createdFrom || createdTo) {
    where.createdAt = {
      ...(createdFrom ? { gte: new Date(`${createdFrom}T00:00:00.000`) } : {}),
      ...(createdTo ? { lte: new Date(`${createdTo}T23:59:59.999`) } : {}),
    };
  } else if (filters.createdDate) {
    const start = new Date(`${filters.createdDate}T00:00:00.000`);
    const end = new Date(`${filters.createdDate}T23:59:59.999`);
    where.createdAt = { gte: start, lte: end };
  }

  return prisma.itemCreationRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { activities: { orderBy: { createdAt: "desc" } } },
    take: 250,
  });
}

export async function getItemRequest(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.admin);
  return prisma.itemCreationRequest.findFirstOrThrow({
    where: { id, companyId: companyId(context) },
    include: { activities: { orderBy: { createdAt: "desc" } } },
  });
}

export async function updateItemRequestDetails(
  context: UserContext,
  id: string,
  input: {
    sku: string;
    description: string;
    standardPrice: unknown;
    ogfPrice?: unknown;
    country: string;
    creationSources?: unknown;
  }
) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.admin);
  const company = companyId(context);
  const details = validateDetailsInput(input);

  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, company);
    const existing = await tx.itemCreationRequest.findFirst({
      where: {
        companyId: company,
        sku: details.sku,
        overallStatus: "IN_PROGRESS",
        NOT: { id },
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("An active Item Creation request already exists for this SKU");
    }

    const updated = await tx.itemCreationRequest.update({
      where: { id },
      data: {
        sku: details.sku,
        description: details.description,
        standardPrice: details.standardPrice,
        ogfPrice: details.ogfPrice,
        country: details.country,
      },
    });
    await activity(
      tx,
      id,
      "REQUEST_DETAILS_UPDATED",
      ItemCreationUpdateSource.USER,
      userId(context),
      JSON.stringify({
        sku: request.sku,
        description: request.description,
        standardPrice: request.standardPrice.toString(),
        ogfPrice: request.ogfPrice?.toString() ?? null,
        country: request.country,
      }),
      JSON.stringify({
        sku: details.sku,
        description: details.description,
        standardPrice: details.standardPrice.toString(),
        ogfPrice: details.ogfPrice?.toString() ?? null,
        country: details.country,
      })
    );
    return updated;
  });
}

export async function deleteItemRequest(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.admin);
  const company = companyId(context);

  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, company);
    await activity(
      tx,
      id,
      "REQUEST_DELETED",
      ItemCreationUpdateSource.USER,
      userId(context),
      request.overallStatus,
      "DELETED"
    );
    await tx.itemCreationRequest.delete({ where: { id } });
  });
}

export async function markSeoItemCreated(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.seo);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.seoSetupStatus !== "PENDING") throw new Error("Only pending SEO requests can be marked item created");
    await tx.itemCreationRequest.update({
      where: { id },
      data: { seoSetupStatus: "ITEM_CREATED", itemCreatedAt: new Date(), itemCreatedBy: userId(context) },
    });
    await activity(tx, id, "SEO_ITEM_CREATED", "USER", userId(context), request.seoSetupStatus, "ITEM_CREATED");
  });
}

export async function markSeoImageUpdated(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.seo);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.seoSetupStatus !== "ITEM_CREATED") throw new Error("Only item-created SEO requests can be marked image updated");
    await tx.itemCreationRequest.update({
      where: { id },
      data: { seoSetupStatus: "COMPLETED", imageUpdatedAt: new Date(), imageUpdatedBy: userId(context) },
    });
    await activity(tx, id, "SEO_IMAGE_UPDATED", "USER", userId(context), request.seoSetupStatus, "COMPLETED");
    await evaluatePurchasingUnlock(tx, id);
  });
}

export async function markDigitalImageCreated(context: UserContext, id: string, imageDriveUrl: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.digitalMarketing);
  assertHttpUrl(imageDriveUrl);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.digitalMarketingStatus !== "PENDING") throw new Error("Only pending Digital Marketing requests can be completed");
    await tx.itemCreationRequest.update({
      where: { id },
      data: {
        imageDriveUrl: imageDriveUrl.trim(),
        imageCreatedAt: new Date(),
        imageCreatedBy: userId(context),
        digitalMarketingStatus: "IMAGE_CREATED",
      },
    });
    await activity(tx, id, "DIGITAL_DRIVE_URL_UPDATED", "USER", userId(context), request.imageDriveUrl, imageDriveUrl.trim());
    await activity(tx, id, "DIGITAL_IMAGE_CREATED", "USER", userId(context), request.digitalMarketingStatus, "IMAGE_CREATED");
    await evaluatePurchasingUnlock(tx, id);
  });
}

export async function markPriceUpdatedManually(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.purchasing);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.purchasingStatus !== "WAITING_FOR_PRICES") throw new Error("Only waiting purchasing requests can be marked price updated");
    await tx.itemCreationRequest.update({
      where: { id },
      data: {
        purchasingStatus: "PRICE_UPDATED",
        priceUpdatedAt: new Date(),
        priceUpdatedBy: userId(context),
        priceUpdatedSource: "USER",
      },
    });
    await activity(tx, id, "PRICE_UPDATED_MANUALLY", "USER", userId(context), request.purchasingStatus, "PRICE_UPDATED");
    await unlockStoreStock(tx, id);
  });
}

export async function markStoreSent(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.storeTransferStatus !== "PENDING") throw new Error("Only pending store transfers can be marked sent");
    await tx.itemCreationRequest.update({ where: { id }, data: { storeTransferStatus: "SENT", sentAt: new Date(), sentBy: userId(context) } });
    await activity(tx, id, "STORE_SENT", "USER", userId(context), request.storeTransferStatus, "SENT");
  });
}

export async function markStoreReceived(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.storeTransferStatus !== "SENT") throw new Error("Store transfer must be sent before received");
    await tx.itemCreationRequest.update({ where: { id }, data: { storeTransferStatus: "RECEIVED", receivedAt: new Date(), receivedBy: userId(context) } });
    await activity(tx, id, "STORE_RECEIVED", "USER", userId(context), request.storeTransferStatus, "RECEIVED");
    await evaluateOverallCompletion(tx, id);
  });
}

export async function markStockAddedManually(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.storeStockStatus !== "READY_FOR_STOCK") throw new Error("Only ready-for-stock requests can be marked stock added");
    await tx.itemCreationRequest.update({
      where: { id },
      data: { storeStockStatus: "STOCK_ADDED", stockAddedAt: new Date(), stockAddedBy: userId(context), stockAddedSource: "USER" },
    });
    await activity(tx, id, "STOCK_ADDED_MANUALLY", "USER", userId(context), request.storeStockStatus, "STOCK_ADDED");
    await unlockSeoActivation(tx, id);
  });
}

export async function activateItem(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.seo);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.seoActivationStatus !== "WAITING_ACTIVATION") throw new Error("Only waiting-activation requests can be activated");
    await tx.itemCreationRequest.update({ where: { id }, data: { seoActivationStatus: "ACTIVATED", activatedAt: new Date(), activatedBy: userId(context) } });
    await activity(tx, id, "SEO_ITEM_ACTIVATED", "USER", userId(context), request.seoActivationStatus, "ACTIVATED");
    await evaluateOverallCompletion(tx, id);
  });
}

export async function recordErpItemPrice(input: {
  item_code: string;
  price_list: string;
  price_list_rate: unknown;
  name?: string;
  currency?: string;
  valid_from?: string;
  modified?: string;
}) {
  const sku = trimSku(input.item_code);
  const price = toDecimal(input.price_list_rate, "price_list_rate");
  if (!price) throw new Error("price_list_rate is required");
  const priceList = input.price_list?.trim();
  if (!priceList) throw new Error("price_list is required");

  return prisma.$transaction(async (tx) => {
    const requests = await tx.itemCreationRequest.findMany({
      where: { sku, overallStatus: "IN_PROGRESS" },
    });
    for (const request of requests) {
      if (priceList === ITEM_CREATION_PRICE_LISTS.STANDARD) {
        await tx.itemCreationRequest.update({
          where: { id: request.id },
          data: { erpStandardPrice: price, standardPriceSeenAt: new Date() },
        });
        await activity(tx, request.id, "ERP_STANDARD_PRICE_DETECTED", "ERP_WEBHOOK", null, String(request.erpStandardPrice ?? ""), String(price), { sku, priceList, erpPrice: Number(price) });
      } else if (priceList === ITEM_CREATION_PRICE_LISTS.OGF) {
        await tx.itemCreationRequest.update({
          where: { id: request.id },
          data: { erpOgfPrice: price, ogfPriceSeenAt: new Date() },
        });
        await activity(tx, request.id, "ERP_OGF_PRICE_DETECTED", "ERP_WEBHOOK", null, String(request.erpOgfPrice ?? ""), String(price), { sku, priceList, erpPrice: Number(price) });
      }
      await evaluatePriceCompletion(tx, request.id, "ERP_WEBHOOK");
    }
    return { matched: requests.length };
  });
}

export async function recordErpStockMovement(input: {
  item_code: string;
  actual_qty: unknown;
  posting_date?: string;
  posting_time?: string;
  warehouse?: string;
  voucher_type?: string;
  voucher_no?: string;
}) {
  const sku = trimSku(input.item_code);
  const qty = Number(input.actual_qty);
  if (!Number.isFinite(qty) || qty <= 0) return { matched: 0, ignored: "non_positive_qty" };
  const movementAt = input.posting_date
    ? new Date(`${input.posting_date}T${input.posting_time || "00:00:00"}`)
    : new Date();

  return prisma.$transaction(async (tx) => {
    const requests = await tx.itemCreationRequest.findMany({
      where: { sku, overallStatus: "IN_PROGRESS", storeStockStatus: "READY_FOR_STOCK" },
    });
    let matched = 0;
    for (const request of requests) {
      if (request.stockReadyAt && movementAt < request.stockReadyAt) continue;
      await tx.itemCreationRequest.update({
        where: { id: request.id },
        data: { storeStockStatus: "STOCK_ADDED", stockAddedAt: new Date(), stockAddedSource: "ERP_WEBHOOK" },
      });
      await activity(tx, request.id, "STOCK_ADDED_AUTOMATICALLY", "ERP_WEBHOOK", null, request.storeStockStatus, "STOCK_ADDED", {
        itemCode: sku,
        qty,
        warehouse: input.warehouse ?? "",
        voucherType: input.voucher_type ?? "",
        voucherNo: input.voucher_no ?? "",
      });
      await unlockSeoActivation(tx, request.id);
      matched += 1;
    }
    return { matched };
  });
}
