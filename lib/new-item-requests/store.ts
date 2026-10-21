import "server-only";

import { v2 as cloudinary } from "cloudinary";
import { NewItemRequestStatus, type Prisma } from "@prisma/client";

import { canSuggestBrands, normalizeBrandName, toStoredBrand } from "@/lib/new-item-requests/brand";
import {
  canAdminNewItemRequests,
  canManageNewItemRequests,
} from "@/lib/new-item-requests/permissions";
import { parseBrandPrioritySheet } from "@/lib/new-item-requests/priority-parse";
import { assertStatusChange } from "@/lib/new-item-requests/status";
import type {
  NewItemRequestBrandGroup,
  NewItemRequestBrandHit,
  NewItemRequestListFilters,
  NewItemRequestStatusValue,
  NewItemRequestView,
} from "@/lib/new-item-requests/types";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";
import { LIMITS } from "@/lib/validation";

export class NewItemRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "NewItemRequestError";
    this.status = status;
  }
}

type UserContext = NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const OWN_LIST_CAP = 300;
const BRAND_DRILL_CAP = 500;
const EXPORT_CAP = 5_000;
const SUGGEST_CAP = 15;

const requestInclude = {
  createdBy: { select: { name: true } },
  statusChangedBy: { select: { name: true } },
} as const;

function requireCompany(context: UserContext) {
  const companyId = context.user?.companyId;
  const userId = context.user?.id;
  if (!companyId || !userId) {
    throw new NewItemRequestError("No company associated with your account", 404);
  }
  return { companyId, userId };
}

function displayName(user: { name: string | null } | null | undefined): string | null {
  const name = user?.name?.trim();
  return name || null;
}

function createdAtFilter(filters: NewItemRequestListFilters): Prisma.DateTimeFilter | undefined {
  const gte = filters.createdFrom ? new Date(`${filters.createdFrom}T00:00:00.000Z`) : undefined;
  const to = filters.createdTo ? new Date(`${filters.createdTo}T00:00:00.000Z`) : undefined;
  const lt = to && !Number.isNaN(to.getTime()) ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : undefined;
  if (!gte && !lt) return undefined;
  return {
    ...(gte && !Number.isNaN(gte.getTime()) ? { gte } : {}),
    ...(lt ? { lt } : {}),
  };
}

async function priorityByNormalized(companyId: string, names: string[]) {
  if (names.length === 0) return new Map<string, string>();
  const rows = await prisma.newItemRequestBrandPriority.findMany({
    where: { companyId, brandNameNormalized: { in: names } },
    select: { brandNameNormalized: true, priority: true },
  });
  return new Map(rows.map((row) => [row.brandNameNormalized, row.priority]));
}

async function vendorNameByNormalized(companyId: string, names: string[]) {
  const wanted = new Set(names);
  if (wanted.size === 0) return new Map<string, string>();
  const vendors = await prisma.vendor.findMany({
    where: { companyId },
    select: { name: true },
  });
  const map = new Map<string, string>();
  for (const vendor of vendors) {
    const key = normalizeBrandName(vendor.name);
    if (wanted.has(key) && !map.has(key)) map.set(key, vendor.name);
  }
  return map;
}

function toView(
  row: {
    id: string;
    brandName: string;
    brandNameNormalized: string;
    brandIsExisting: boolean;
    description: string;
    storeUrl: string | null;
    imageUrl: string | null;
    status: NewItemRequestStatus;
    createdAt: Date;
    statusChangedAt: Date | null;
    createdBy: { name: string | null } | null;
    statusChangedBy: { name: string | null } | null;
  },
  priority: string | null,
): NewItemRequestView {
  return {
    id: row.id,
    brandName: row.brandName,
    brandNameNormalized: row.brandNameNormalized,
    brandIsExisting: row.brandIsExisting,
    priority,
    description: row.description,
    storeUrl: row.storeUrl,
    imageUrl: row.imageUrl,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    createdByName: displayName(row.createdBy),
    statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
    statusChangedByName: displayName(row.statusChangedBy),
  };
}

async function attachPriority(companyId: string, rows: NewItemRequestView[]): Promise<NewItemRequestView[]> {
  const keys = [...new Set(rows.filter((row) => row.brandIsExisting).map((row) => row.brandNameNormalized))];
  const priorities = await priorityByNormalized(companyId, keys);
  return rows.map((row) => ({
    ...row,
    priority: row.brandIsExisting ? (priorities.get(row.brandNameNormalized) ?? null) : null,
  }));
}

async function findVendorName(companyId: string, brandName: string) {
  const vendor = await prisma.vendor.findFirst({
    where: { companyId, name: { equals: brandName, mode: "insensitive" } },
    select: { name: true },
  });
  return vendor?.name ?? null;
}

async function uploadRequestImage(companyId: string, file: File) {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new NewItemRequestError("Invalid file type. Allowed: JPEG, PNG, GIF, WebP", 400);
  }
  if (file.size > LIMITS.newItemRequestImageMaxBytes) {
    throw new NewItemRequestError("File too large. Maximum size is 5MB", 413);
  }
  if (!process.env.CLOUDINARY_URL) {
    throw new NewItemRequestError("Cloudinary is not configured", 503);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `new-item-requests/${companyId}`,
    resource_type: "image",
  });
  if (!result?.secure_url) {
    throw new NewItemRequestError("Could not upload image", 502);
  }
  return { imageUrl: result.secure_url as string, imagePublicId: (result.public_id as string | undefined) ?? null };
}

export async function suggestBrands(companyId: string, q: string): Promise<NewItemRequestBrandHit[]> {
  if (!canSuggestBrands(q)) return [];
  const vendors = await prisma.vendor.findMany({
    where: { companyId, name: { contains: q.trim(), mode: "insensitive" } },
    select: { name: true },
    orderBy: { name: "asc" },
    take: SUGGEST_CAP,
  });
  const priorities = await priorityByNormalized(
    companyId,
    vendors.map((vendor) => normalizeBrandName(vendor.name)),
  );
  return vendors.map((vendor) => ({
    name: vendor.name,
    priority: priorities.get(normalizeBrandName(vendor.name)) ?? null,
  }));
}

export async function createNewItemRequest(
  context: UserContext,
  input: { brandName: string; description: string; storeUrl?: string; image?: File },
): Promise<NewItemRequestView> {
  if (!canManageNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId, userId } = requireCompany(context);
  const vendorName = await findVendorName(companyId, input.brandName);
  const stored = toStoredBrand({ vendorName, typedName: input.brandName });
  if (!stored.brandName) {
    throw new NewItemRequestError("Brand is required", 400);
  }

  let image: { imageUrl: string; imagePublicId: string | null } | null = null;
  if (input.image) {
    image = await uploadRequestImage(companyId, input.image);
  }

  const row = await prisma.newItemRequest.create({
    data: {
      companyId,
      brandName: stored.brandName,
      brandNameNormalized: stored.brandNameNormalized,
      brandIsExisting: stored.brandIsExisting,
      description: input.description,
      storeUrl: input.storeUrl ?? null,
      imageUrl: image?.imageUrl ?? null,
      imagePublicId: image?.imagePublicId ?? null,
      createdByUserId: userId,
    },
    include: requestInclude,
  });
  const [view] = await attachPriority(companyId, [toView(row, null)]);
  return view;
}

function listWhere(
  companyId: string,
  filters: NewItemRequestListFilters,
  extra?: Prisma.NewItemRequestWhereInput,
): Prisma.NewItemRequestWhereInput {
  const createdAt = createdAtFilter(filters);
  const brand = filters.brand ? normalizeBrandName(filters.brand) : undefined;
  return {
    companyId,
    status: filters.status,
    ...(createdAt ? { createdAt } : {}),
    ...(brand ? { brandNameNormalized: brand } : {}),
    ...extra,
  };
}

export async function listOwnRequests(
  context: UserContext,
  filters: NewItemRequestListFilters,
): Promise<NewItemRequestView[]> {
  if (!canManageNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId, userId } = requireCompany(context);
  const rows = await prisma.newItemRequest.findMany({
    where: listWhere(companyId, filters, { createdByUserId: userId }),
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: OWN_LIST_CAP,
  });
  return attachPriority(
    companyId,
    rows.map((row) => toView(row, null)),
  );
}

export async function listCompanyRequests(
  context: UserContext,
  filters: NewItemRequestListFilters,
  take = EXPORT_CAP,
): Promise<NewItemRequestView[]> {
  if (!canAdminNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId } = requireCompany(context);
  const rows = await prisma.newItemRequest.findMany({
    where: listWhere(companyId, filters),
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take,
  });
  return attachPriority(
    companyId,
    rows.map((row) => toView(row, null)),
  );
}

export async function getRequest(context: UserContext, id: string): Promise<NewItemRequestView> {
  if (!canManageNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId, userId } = requireCompany(context);
  const isAdmin = canAdminNewItemRequests(context);
  const row = await prisma.newItemRequest.findFirst({
    where: { id, companyId, ...(isAdmin ? {} : { createdByUserId: userId }) },
    include: requestInclude,
  });
  if (!row) throw new NewItemRequestError("Request not found", 404);
  const [view] = await attachPriority(companyId, [toView(row, null)]);
  return view;
}

export async function listBrandGroups(
  context: UserContext,
  filters: NewItemRequestListFilters,
): Promise<NewItemRequestBrandGroup[]> {
  if (!canAdminNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId } = requireCompany(context);
  const rows = await prisma.newItemRequest.findMany({
    where: listWhere(companyId, filters),
    select: { brandName: true, brandNameNormalized: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const groups = new Map<
    string,
    { brandName: string; count: number }
  >();
  for (const row of rows) {
    const existing = groups.get(row.brandNameNormalized);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(row.brandNameNormalized, { brandName: row.brandName, count: 1 });
    }
  }

  const keys = [...groups.keys()];
  const [vendors, priorities] = await Promise.all([
    vendorNameByNormalized(companyId, keys),
    priorityByNormalized(companyId, keys),
  ]);

  return keys
    .map((key) => {
      const group = groups.get(key)!;
      const vendorName = vendors.get(key) ?? null;
      const isExisting = Boolean(vendorName);
      return {
        brandName: vendorName ?? group.brandName,
        brandNameNormalized: key,
        isExisting,
        isNew: !isExisting,
        priority: isExisting ? (priorities.get(key) ?? null) : null,
        requestCount: group.count,
      };
    })
    .sort((a, b) => b.requestCount - a.requestCount || a.brandName.localeCompare(b.brandName));
}

export async function listRequestsForBrand(
  context: UserContext,
  brandNormalized: string,
  filters: NewItemRequestListFilters,
): Promise<{ brand: NewItemRequestBrandGroup; requests: NewItemRequestView[] }> {
  if (!canAdminNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId } = requireCompany(context);
  const normalized = normalizeBrandName(decodeURIComponent(brandNormalized));
  const exists = await prisma.newItemRequest.findFirst({
    where: { companyId, brandNameNormalized: normalized },
    select: { id: true },
  });
  if (!exists) throw new NewItemRequestError("Brand not found", 404);

  const requests = await listCompanyRequests(context, { ...filters, brand: normalized }, BRAND_DRILL_CAP);
  const groups = await listBrandGroups(context, { ...filters, brand: normalized });
  const brand = groups[0] ?? {
    brandName: normalized,
    brandNameNormalized: normalized,
    isExisting: false,
    isNew: true,
    priority: null,
    requestCount: requests.length,
  };
  return { brand, requests };
}

export async function setNewItemRequestStatus(
  context: UserContext,
  id: string,
  status: Exclude<NewItemRequestStatusValue, "open">,
): Promise<NewItemRequestView> {
  if (!canAdminNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId, userId } = requireCompany(context);
  const row = await prisma.newItemRequest.findFirst({
    where: { id, companyId },
    include: requestInclude,
  });
  if (!row) throw new NewItemRequestError("Request not found", 404);

  const decision = assertStatusChange(row.status, status);
  if (decision.ok === "reject") {
    throw new NewItemRequestError("Cannot change this status", 409);
  }
  if (decision.ok === "noop") {
    const [view] = await attachPriority(companyId, [toView(row, null)]);
    return view;
  }

  const updated = await prisma.newItemRequest.update({
    where: { id: row.id },
    data: {
      status,
      statusChangedByUserId: userId,
      statusChangedAt: new Date(),
    },
    include: requestInclude,
  });
  const [view] = await attachPriority(companyId, [toView(updated, null)]);
  return view;
}

export async function getPriorityMeta(context: UserContext) {
  if (!canAdminNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId } = requireCompany(context);
  const [count, latest] = await Promise.all([
    prisma.newItemRequestBrandPriority.count({ where: { companyId } }),
    prisma.newItemRequestBrandPriority.findFirst({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  return { count, uploadedAt: latest?.updatedAt.toISOString() ?? null };
}

export async function replaceBrandPriorities(context: UserContext, sheetRows: unknown[][]) {
  if (!canAdminNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId, userId } = requireCompany(context);
  const parsed = parseBrandPrioritySheet(sheetRows);
  if (!parsed.ok) {
    throw new NewItemRequestError(parsed.error, 400);
  }
  await prisma.$transaction(async (tx) => {
    await tx.newItemRequestBrandPriority.deleteMany({ where: { companyId } });
    await tx.newItemRequestBrandPriority.createMany({
      data: parsed.rows.map((row) => ({
        companyId,
        brandName: row.brandName,
        brandNameNormalized: row.brandNameNormalized,
        priority: row.priority,
        uploadedByUserId: userId,
      })),
    });
  });
  return { count: parsed.rows.length };
}
