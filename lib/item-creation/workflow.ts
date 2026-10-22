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
import { getPriceStatus, isItemCreationTaxStatus } from "@/lib/item-creation/helpers";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";

export const ITEM_CREATION_PERMISSIONS = {
  admin: "item_creation.admin.manage",
  adminViewer: "item_creation.admin.view",
  manageAll: "item_creation.admin.manage_all",
  seo: "item_creation.seo.manage",
  digitalMarketing: "item_creation.digital_marketing.manage",
  digitalMarketingAdmin: "item_creation.digital_marketing.admin",
  purchasing: "item_creation.purchasing.manage",
  stores: "item_creation.stores.manage",
} as const;

export const ITEM_CREATION_PRICE_LISTS = {
  STANDARD: process.env.ITEM_CREATION_STANDARD_PRICE_LIST ?? "Standard Selling",
  OGF: process.env.ITEM_CREATION_OGF_PRICE_LIST ?? "OGF Price List",
  GCC: process.env.ITEM_CREATION_GCC_PRICE_LIST ?? "GCC PRICE LIST",
} as const;

const ITEM_CREATION_SOURCE_VALUES = new Set(["SHOPIFY", "ERP2"]);

type Tx = Prisma.TransactionClient;
type UserContext = NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>;

export function canManageAllItemCreation(context: UserContext) {
  return hasPermission(context, ITEM_CREATION_PERMISSIONS.manageAll);
}

export function canViewAllItemCreation(context: UserContext) {
  return (
    hasPermission(context, ITEM_CREATION_PERMISSIONS.adminViewer) ||
    hasPermission(context, ITEM_CREATION_PERMISSIONS.manageAll)
  );
}

export function canUseItemCreation(context: UserContext, permission: string) {
  return (
    canManageAllItemCreation(context) ||
    hasPermission(context, permission) ||
    (permission === ITEM_CREATION_PERMISSIONS.digitalMarketing &&
      hasPermission(context, ITEM_CREATION_PERMISSIONS.digitalMarketingAdmin))
  );
}

function requireWorkflowPermission(context: UserContext, permission: string) {
  if (!canUseItemCreation(context, permission)) {
    throw new Error("Permission denied");
  }
}

function requireItemCreationAdminEdit(context: UserContext) {
  if (!canManageAllItemCreation(context)) {
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

function requireDigitalMarketingAdmin(context: UserContext) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.digitalMarketingAdmin);
}

function requireDigitalMarketingPermission(context: UserContext) {
  if (
    !canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.digitalMarketing) &&
    !hasPermission(context, ITEM_CREATION_PERMISSIONS.digitalMarketingAdmin)
  ) {
    throw new Error("Permission denied");
  }
}

async function getDigitalMarketingUsers(company: string) {
  return prisma.user.findMany({
    where: {
      companyId: company,
      userRoles: {
        some: {
          role: {
            rolePermissions: {
              some: { permission: { key: ITEM_CREATION_PERMISSIONS.digitalMarketing } },
            },
          },
        },
      },
      NOT: {
        userRoles: {
          some: {
            role: {
              OR: [
                { name: { in: ["admin", "super_admin"] } },
                {
                  rolePermissions: {
                    some: {
                      permission: {
                        key: {
                          in: [
                            ITEM_CREATION_PERMISSIONS.admin,
                            ITEM_CREATION_PERMISSIONS.manageAll,
                          ],
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
    select: { id: true, knownName: true, name: true, email: true },
    orderBy: [{ knownName: "asc" }, { name: "asc" }, { email: "asc" }],
  });
}

function displayUserName(user: { knownName: string | null; name: string | null; email: string | null }) {
  return user.knownName?.trim() || user.name?.trim() || user.email?.trim() || "User";
}

function findBrandAllocation(
  description: string,
  allocations: Array<{ brand: string; userId: string }>,
) {
  const normalizedDescription = description.toLocaleLowerCase();
  return [...allocations]
    .filter((allocation) => normalizedDescription.includes(allocation.brand.toLocaleLowerCase()))
    .sort((a, b) => b.brand.length - a.brand.length)[0] ?? null;
}

function trimSku(sku: string) {
  const value = sku.trim();
  if (!value) throw new Error("SKU is required");
  return value;
}

function normalizeSkuForComparison(sku: string) {
  return sku.trim().toUpperCase();
}

async function assertSkusDoNotExistInErp(company: string, skus: string[]) {
  const instances = await getAllOsfErpInstances(company);
  if (instances.length === 0) {
    throw new Error("No configured ERP instance is available to validate the SKU");
  }

  const uniqueSkus = [...new Map(skus.map((sku) => [normalizeSkuForComparison(sku), sku])).values()];
  const fields = encodeURIComponent(JSON.stringify(["name", "item_code"]));
  const batchSize = 100;

  for (const instance of instances) {
    for (let start = 0; start < uniqueSkus.length; start += batchSize) {
      const batch = uniqueSkus.slice(start, start + batchSize);
      const filters = encodeURIComponent(JSON.stringify([["item_code", "in", batch]]));
      const path =
        `/api/resource/Item?filters=${filters}` +
        `&fields=${fields}&limit_page_length=${batch.length}`;
      let response: Response;
      try {
        response = await fetch(`${instance.cfg.baseUrl}${path}`, {
          headers: {
            Authorization: `token ${instance.cfg.apiKey}:${instance.cfg.apiSecret}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not validate SKUs in ${instance.label ?? "ERP"}: ${detail}`);
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        throw new Error(
          `Could not validate SKUs in ${instance.label ?? "ERP"} (${response.status})${detail ? `: ${detail}` : ""}`,
        );
      }

      const json = (await response.json()) as {
        data?: Array<{ name?: string | null; item_code?: string | null }>;
      };
      const existing = (json.data ?? []).find((row) => {
        const code = row.item_code ?? row.name ?? "";
        return batch.some((sku) => normalizeSkuForComparison(sku) === normalizeSkuForComparison(code));
      });
      if (existing) {
        const code = existing.item_code ?? existing.name ?? "the requested SKU";
        throw new Error(`SKU ${code} already exists in ${instance.label ?? "ERP"}`);
      }
    }
  }
}

function samePriceList(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function toDecimal(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const decimal = new Prisma.Decimal(String(value));
  if (decimal.isNaN() || decimal.isNegative()) {
    throw new Error(`${label} must be a positive number`);
  }
  return decimal;
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  return false;
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
    request.seoSetupStatus !== ItemCreationSeoSetupStatus.PENDING &&
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
    request.purchasingStatus === ItemCreationPurchasingStatus.PRICE_UPDATED &&
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
  await unlockSeoActivation(tx, id);
}

export async function createItemRequest(
  context: UserContext,
  input: {
    sku: string;
    description: string;
    standardPrice: unknown;
    ogfPrice?: unknown;
    gccPrice?: unknown;
    addErp1OgfPrice?: unknown;
    country?: string;
    taxStatus?: unknown;
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
  gccPrice?: unknown;
  addErp1OgfPrice?: unknown;
  country?: string;
  taxStatus?: unknown;
  creationSources?: unknown;
}) {
  const sku = trimSku(input.sku);
  const standardPrice = toDecimal(input.standardPrice, "Standard Price");
  const vaultOs = isVaultOsDeployment();
  const ogfPrice = vaultOs ? null : toDecimal(input.ogfPrice, "OGF Price");
  const gccPrice = vaultOs ? null : toDecimal(input.gccPrice, "GCC Price");
  const requestedErp1OgfPrice = vaultOs ? false : toBoolean(input.addErp1OgfPrice);
  if (!standardPrice) throw new Error("Standard Price is required");
  const description = input.description?.trim();
  const country = input.country?.trim() ?? "";
  const taxStatus = input.taxStatus ?? "Vat / Non Vat";
  if (!description) throw new Error("Description is required");
  if (!isItemCreationTaxStatus(taxStatus)) throw new Error("Tax status is invalid");
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
  const addErp1OgfPrice = requestedErp1OgfPrice || Boolean(ogfPrice && !creationSources.includes("ERP2"));
  if (addErp1OgfPrice && !ogfPrice) throw new Error("OGF Price is required when adding OGF to ERP1");
  return { sku, standardPrice, ogfPrice, gccPrice, addErp1OgfPrice, description, country, taxStatus, creationSources };
}

function validateDetailsInput(input: {
  sku: string;
  description: string;
  standardPrice: unknown;
  ogfPrice?: unknown;
  gccPrice?: unknown;
  addErp1OgfPrice?: unknown;
  country?: string;
  taxStatus?: unknown;
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
    gccPrice?: unknown;
    addErp1OgfPrice?: unknown;
    country?: string;
    taxStatus?: unknown;
    creationSources?: unknown;
  }>
) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.admin);
  const company = companyId(context);
  const validated = inputs.map(validateCreateInput);
  if (validated.length === 0) throw new Error("At least one item is required");
  const duplicateSkus = validated
    .map((item) => item.sku)
    .filter(
      (sku, index, skus) =>
        skus.findIndex((candidate) => normalizeSkuForComparison(candidate) === normalizeSkuForComparison(sku)) !== index,
    );
  if (duplicateSkus.length > 0) {
    throw new Error(`Duplicate SKU in request: ${Array.from(new Set(duplicateSkus)).join(", ")}`);
  }
  await assertSkusDoNotExistInErp(company, validated.map((item) => item.sku));

  return prisma.$transaction(async (tx) => {
    const brandAllocations = await tx.itemCreationBrandAllocation.findMany({
      where: { companyId: company },
      select: { brand: true, userId: true },
    });
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
      const allocation = findBrandAllocation(item.description, brandAllocations);
      const request = await tx.itemCreationRequest.create({
        data: {
          companyId: company,
          sku: item.sku,
          description: item.description,
          standardPrice: item.standardPrice,
          ogfPrice: item.ogfPrice,
          gccPrice: item.gccPrice,
          addErp1OgfPrice: item.addErp1OgfPrice,
          country: item.country,
          taxStatus: item.taxStatus,
          creationSources: item.creationSources,
          digitalMarketingBrand: allocation?.brand ?? null,
          digitalMarketingAssigneeId: allocation?.userId ?? null,
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
  const hasTeamView =
    canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.seo) ||
    canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.digitalMarketing) ||
    canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.digitalMarketingAdmin) ||
    canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.purchasing) ||
    canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.stores);
  const hasCreatePermission = canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.admin);
  if (!canViewAllItemCreation(context) && !hasTeamView && !hasCreatePermission) {
    throw new Error("Permission denied");
  }

  if (!canViewAllItemCreation(context) && !hasTeamView) return [];

  const where: Prisma.ItemCreationRequestWhereInput = { companyId: companyId(context) };
  const hasAdminView = canViewAllItemCreation(context);
  const hasDigitalAdminView = canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.digitalMarketingAdmin);
  const hasDigitalView = canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.digitalMarketing);
  const hasOtherTeamView =
    canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.seo) ||
    canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.purchasing) ||
    canUseItemCreation(context, ITEM_CREATION_PERMISSIONS.stores);
  if (hasDigitalView && !hasDigitalAdminView && !hasAdminView && !hasOtherTeamView) {
    where.digitalMarketingStatus = "PENDING";
    where.AND = [
      {
        OR: [
          { digitalMarketingAssigneeId: userId(context) },
          { digitalMarketingAssigneeId: null },
        ],
      },
    ];
  }
  const sku = filters.sku?.trim();
  const search = filters.search?.trim();
  const country = filters.country?.trim();
  if (search) {
    where.OR = [
      { sku: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  } else if (sku) {
    where.sku = { contains: sku, mode: "insensitive" };
  }
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
  if (!search && (createdFrom || createdTo)) {
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
    include: {
      activities: { orderBy: { createdAt: "desc" } },
      digitalMarketingAssignee: {
        select: { id: true, knownName: true, name: true, email: true },
      },
    },
    take: 250,
  });
}

export async function listItemCreationBrandAllocations(context: UserContext) {
  requireDigitalMarketingAdmin(context);
  const company = companyId(context);
  const [allocations, users] = await Promise.all([
    prisma.itemCreationBrandAllocation.findMany({
      where: { companyId: company },
      include: { user: { select: { id: true, knownName: true, name: true, email: true } } },
      orderBy: { brand: "asc" },
    }),
    getDigitalMarketingUsers(company),
  ]);
  return {
    allocations: allocations.map((allocation) => ({
      id: allocation.id,
      brand: allocation.brand,
      userId: allocation.userId,
      userName: displayUserName(allocation.user),
    })),
    users: users.map((user) => ({ id: user.id, name: displayUserName(user) })),
  };
}

export async function saveItemCreationBrandAllocations(
  context: UserContext,
  input: unknown,
) {
  requireDigitalMarketingAdmin(context);
  const company = companyId(context);
  if (!Array.isArray(input)) throw new Error("Brand allocations must be an array");

  const users = await getDigitalMarketingUsers(company);
  const allowedUsers = new Set(users.map((user) => user.id));
  const normalized = input.map((entry) => {
    const value = entry as { brand?: unknown; userId?: unknown };
    const brand = String(value.brand ?? "").trim();
    const userIdValue = String(value.userId ?? "").trim();
    if (!brand) throw new Error("Brand is required");
    if (!allowedUsers.has(userIdValue)) throw new Error("Allocated user must have Digital Marketing permission");
    return { brand, userId: userIdValue };
  });
  const seen = new Set<string>();
  for (const allocation of normalized) {
    const key = allocation.brand.toLocaleLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate brand allocation: ${allocation.brand}`);
    seen.add(key);
  }

  await prisma.$transaction(async (tx) => {
    await tx.itemCreationBrandAllocation.deleteMany({ where: { companyId: company } });
    if (normalized.length > 0) {
      await tx.itemCreationBrandAllocation.createMany({
        data: normalized.map((allocation) => ({ ...allocation, companyId: company })),
      });
    }
  });
  return listItemCreationBrandAllocations(context);
}

export async function assignItemCreationDigitalMarketingUser(
  context: UserContext,
  id: string,
  assigneeId: string | null,
) {
  requireDigitalMarketingAdmin(context);
  const company = companyId(context);
  const normalizedAssigneeId = assigneeId?.trim() || null;
  if (normalizedAssigneeId) {
    const users = await getDigitalMarketingUsers(company);
    if (!users.some((user) => user.id === normalizedAssigneeId)) {
      throw new Error("Allocated user must have Digital Marketing permission");
    }
  }

  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, company);
    const updated = await tx.itemCreationRequest.update({
      where: { id },
      data: { digitalMarketingAssigneeId: normalizedAssigneeId },
    });
    await activity(
      tx,
      id,
      "DIGITAL_MARKETING_ASSIGNEE_UPDATED",
      ItemCreationUpdateSource.USER,
      userId(context),
      request.digitalMarketingAssigneeId,
      normalizedAssigneeId,
    );
    return updated;
  });
}

export async function getItemRequest(context: UserContext, id: string) {
  if (!canViewAllItemCreation(context)) throw new Error("Permission denied");
  return prisma.itemCreationRequest.findFirstOrThrow({
    where: { id, companyId: companyId(context) },
    include: {
      activities: { orderBy: { createdAt: "desc" } },
      digitalMarketingAssignee: {
        select: { id: true, knownName: true, name: true, email: true },
      },
    },
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
    gccPrice?: unknown;
    addErp1OgfPrice?: unknown;
    country: string;
    taxStatus?: unknown;
    creationSources?: unknown;
  }
) {
  requireItemCreationAdminEdit(context);
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
        gccPrice: details.gccPrice,
        addErp1OgfPrice: details.addErp1OgfPrice,
        country: details.country,
        taxStatus: details.taxStatus,
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
        gccPrice: request.gccPrice?.toString() ?? null,
        addErp1OgfPrice: request.addErp1OgfPrice,
        country: request.country,
        taxStatus: request.taxStatus,
      }),
      JSON.stringify({
        sku: details.sku,
        description: details.description,
        standardPrice: details.standardPrice.toString(),
        ogfPrice: details.ogfPrice?.toString() ?? null,
        gccPrice: details.gccPrice?.toString() ?? null,
        addErp1OgfPrice: details.addErp1OgfPrice,
        country: details.country,
        taxStatus: details.taxStatus,
      })
    );
    return updated;
  });
}

export async function deleteItemRequest(context: UserContext, id: string) {
  requireItemCreationAdminEdit(context);
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
  requireDigitalMarketingPermission(context);
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

async function resetItemCreationAfterStageRevert(
  tx: Tx,
  id: string,
  resetSeo: boolean,
  actorId: string,
  request: {
    seoSetupStatus: string;
    digitalMarketingStatus: string;
    purchasingStatus: string;
    storeTransferStatus: string;
    storeStockStatus: string;
    seoActivationStatus: string;
  },
) {
  await tx.itemCreationRequest.update({
    where: { id },
    data: {
      ...(resetSeo
        ? {
            seoSetupStatus: "PENDING",
            itemCreatedAt: null,
            itemCreatedBy: null,
            imageUpdatedAt: null,
            imageUpdatedBy: null,
          }
        : {}),
      digitalMarketingStatus: "PENDING",
      imageDriveUrl: null,
      imageCreatedAt: null,
      imageCreatedBy: null,
      purchasingStatus: "LOCKED",
      priceUpdatedAt: null,
      priceUpdatedBy: null,
      priceUpdatedSource: null,
      storeTransferStatus: "PENDING",
      sentAt: null,
      sentBy: null,
      receivedAt: null,
      receivedBy: null,
      storeStockStatus: "WAITING_FOR_PRICE",
      stockReadyAt: null,
      stockAddedAt: null,
      stockAddedBy: null,
      stockAddedSource: null,
      seoActivationStatus: "LOCKED",
      activatedAt: null,
      activatedBy: null,
      shopifyActivationStatus: "LOCKED",
      shopifyActivatedAt: null,
      shopifyActivationError: null,
      overallStatus: "IN_PROGRESS",
      completedAt: null,
    },
  });
  await activity(
    tx,
    id,
    resetSeo ? "SEO_STAGE_REVERTED" : "DIGITAL_MARKETING_STAGE_REVERTED",
    ItemCreationUpdateSource.USER,
    actorId,
    JSON.stringify({
      seoSetupStatus: request.seoSetupStatus,
      digitalMarketingStatus: request.digitalMarketingStatus,
      purchasingStatus: request.purchasingStatus,
      storeTransferStatus: request.storeTransferStatus,
      storeStockStatus: request.storeStockStatus,
      seoActivationStatus: request.seoActivationStatus,
    }),
    resetSeo ? "PENDING" : "DIGITAL_MARKETING_PENDING",
  );
}

export async function revertSeoStage(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.seo);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.seoSetupStatus === "PENDING") {
      throw new Error("SEO is already at the initial stage");
    }
    await resetItemCreationAfterStageRevert(tx, id, true, userId(context), request);
  });
}

export async function revertDigitalMarketingStage(context: UserContext, id: string) {
  requireDigitalMarketingPermission(context);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (request.digitalMarketingStatus === "PENDING") {
      throw new Error("Digital Marketing is already at the initial stage");
    }
    await resetItemCreationAfterStageRevert(tx, id, false, userId(context), request);
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
    await unlockSeoActivation(tx, id);
  });
}

export async function markStoreSent(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (
      request.seoSetupStatus === ItemCreationSeoSetupStatus.PENDING ||
      request.digitalMarketingStatus !== ItemCreationDigitalStatus.IMAGE_CREATED
    ) {
      throw new Error("Stores unlock after the item is created and Digital Marketing image is ready");
    }
    if (request.storeTransferStatus !== "PENDING") throw new Error("Only pending store transfers can be marked sent");
    await tx.itemCreationRequest.update({ where: { id }, data: { storeTransferStatus: "SENT", sentAt: new Date(), sentBy: userId(context) } });
    await activity(tx, id, "STORE_SENT", "USER", userId(context), request.storeTransferStatus, "SENT");
  });
}

export async function markStoreReceived(context: UserContext, id: string) {
  requireWorkflowPermission(context, ITEM_CREATION_PERMISSIONS.stores);
  return prisma.$transaction(async (tx) => {
    const request = await getScopedRequest(tx, id, companyId(context));
    if (
      request.seoSetupStatus === ItemCreationSeoSetupStatus.PENDING ||
      request.digitalMarketingStatus !== ItemCreationDigitalStatus.IMAGE_CREATED
    ) {
      throw new Error("Stores unlock after the item is created and Digital Marketing image is ready");
    }
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
    if (
      request.seoSetupStatus === ItemCreationSeoSetupStatus.PENDING ||
      request.digitalMarketingStatus !== ItemCreationDigitalStatus.IMAGE_CREATED
    ) {
      throw new Error("Stores unlock after the item is created and Digital Marketing image is ready");
    }
    if (request.storeStockStatus === "STOCK_ADDED") throw new Error("Stock is already marked added");
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
    await tx.itemCreationRequest.update({
      where: { id },
      data: {
        seoActivationStatus: "ACTIVATED",
        activatedAt: new Date(),
        activatedBy: userId(context),
        shopifyActivationStatus: "ACTIVE",
        shopifyActivatedAt: new Date(),
        shopifyActivationError: null,
      },
    });
    await activity(
      tx,
      id,
      "SHOPIFY_ACTIVATION_MARKED_MANUALLY",
      "USER",
      userId(context),
      request.seoActivationStatus,
      "ACTIVATED",
      { shopifyRequestSent: false },
    );
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
      if (samePriceList(priceList, ITEM_CREATION_PRICE_LISTS.STANDARD)) {
        await tx.itemCreationRequest.update({
          where: { id: request.id },
          data: { erpStandardPrice: price, standardPriceSeenAt: new Date() },
        });
        await activity(tx, request.id, "ERP_STANDARD_PRICE_DETECTED", "ERP_WEBHOOK", null, String(request.erpStandardPrice ?? ""), String(price), { sku, priceList, erpPrice: Number(price) });
      } else if (!isVaultOsDeployment() && samePriceList(priceList, ITEM_CREATION_PRICE_LISTS.OGF)) {
        await tx.itemCreationRequest.update({
          where: { id: request.id },
          data: { erpOgfPrice: price, ogfPriceSeenAt: new Date() },
        });
        await activity(tx, request.id, "ERP_OGF_PRICE_DETECTED", "ERP_WEBHOOK", null, String(request.erpOgfPrice ?? ""), String(price), { sku, priceList, erpPrice: Number(price) });
      } else if (!isVaultOsDeployment() && samePriceList(priceList, ITEM_CREATION_PRICE_LISTS.GCC)) {
        await tx.itemCreationRequest.update({
          where: { id: request.id },
          data: { erp2GccPrice: price, gccPriceSeenAt: new Date() },
        });
        await activity(tx, request.id, "ERP_GCC_PRICE_DETECTED", "ERP_WEBHOOK", null, String(request.erp2GccPrice ?? ""), String(price), { sku, priceList, erpPrice: Number(price) });
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
      where: { sku, overallStatus: "IN_PROGRESS", NOT: { storeStockStatus: "STOCK_ADDED" } },
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
