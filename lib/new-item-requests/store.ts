import "server-only";

import { v2 as cloudinary } from "cloudinary";
import { NewItemRequestStatus, Prisma } from "@prisma/client";

import {
  brandPriorityFromItemStatuses,
  canSearchProducts,
  canSuggestBrands,
  normalizeBrandName,
  normalizeProductName,
  toStoredBrand,
} from "@/lib/new-item-requests/brand";
import {
  canAdminNewItemRequests,
  canManageNewItemRequests,
  canVoteOnNewItemRequests,
} from "@/lib/new-item-requests/permissions";
import { assertStatusChange } from "@/lib/new-item-requests/status";
import type {
  NewItemRequestBrandGroup,
  NewItemRequestBrandHit,
  NewItemRequestListFilters,
  NewItemRequestStatusValue,
  NewItemRequestView,
  NewItemRequestVoteView,
} from "@/lib/new-item-requests/types";
import type { NewItemRequestVoteBody } from "@/lib/validation/new-item-requests";
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
  _count: { select: { votes: true } },
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

async function vendorsByNormalized(companyId: string, names: string[]) {
  const wanted = new Set(names);
  if (wanted.size === 0) return new Map<string, { id: string; name: string }>();
  const vendors = await prisma.vendor.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  const map = new Map<string, { id: string; name: string }>();
  for (const vendor of vendors) {
    const key = normalizeBrandName(vendor.name);
    if (wanted.has(key) && !map.has(key)) map.set(key, vendor);
  }
  return map;
}

async function priorityByVendors(companyId: string, vendors: { id: string; name: string }[]) {
  if (vendors.length === 0) return new Map<string, string>();
  const grouped = await prisma.productItem.groupBy({
    by: ["vendorId", "itemStatusCategory"],
    where: { companyId, vendorId: { in: vendors.map((vendor) => vendor.id) } },
  });
  const categoriesByVendorId = new Map<string, string[]>();
  for (const row of grouped) {
    if (!row.vendorId) continue;
    const list = categoriesByVendorId.get(row.vendorId) ?? [];
    list.push(row.itemStatusCategory);
    categoriesByVendorId.set(row.vendorId, list);
  }
  const map = new Map<string, string>();
  for (const vendor of vendors) {
    const key = normalizeBrandName(vendor.name);
    if (map.has(key)) continue;
    const priority = brandPriorityFromItemStatuses(categoriesByVendorId.get(vendor.id) ?? []);
    if (priority) map.set(key, priority);
  }
  return map;
}

async function priorityByNormalized(companyId: string, names: string[]) {
  const vendors = await vendorsByNormalized(companyId, names);
  return priorityByVendors(companyId, [...vendors.values()]);
}

function toView(
  row: {
    id: string;
    brandName: string;
    brandNameNormalized: string;
    brandIsExisting: boolean;
    productName: string;
    description: string;
    storeUrl: string | null;
    imageUrl: string | null;
    customerName: string | null;
    customerPhone: string | null;
    status: NewItemRequestStatus;
    createdAt: Date;
    statusChangedAt: Date | null;
    createdBy: { name: string | null } | null;
    statusChangedBy: { name: string | null } | null;
    _count?: { votes: number };
  },
  priority: string | null,
): NewItemRequestView {
  return {
    id: row.id,
    brandName: row.brandName,
    brandNameNormalized: row.brandNameNormalized,
    brandIsExisting: row.brandIsExisting,
    priority,
    productName: row.productName,
    description: row.description,
    storeUrl: row.storeUrl,
    imageUrl: row.imageUrl,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    voteCount: row._count?.votes ?? 0,
    voterNames: [],
    votes: [],
    hasVoted: false,
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

async function attachVotes(
  companyId: string,
  userId: string,
  rows: NewItemRequestView[],
): Promise<NewItemRequestView[]> {
  if (rows.length === 0) return rows;
  const votes = await prisma.newItemRequestVote.findMany({
    where: { companyId, requestId: { in: rows.map((row) => row.id) } },
    select: {
      requestId: true,
      userId: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      createdAt: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const votesByRequest = new Map<string, NewItemRequestVoteView[]>();
  const voted = new Set<string>();
  for (const vote of votes) {
    if (vote.userId === userId) voted.add(vote.requestId);
    const list = votesByRequest.get(vote.requestId) ?? [];
    list.push({
      userName: vote.user.name?.trim() || "Unknown",
      customerName: vote.customerName,
      customerPhone: vote.customerPhone,
      customerEmail: vote.customerEmail,
      createdAt: vote.createdAt.toISOString(),
    });
    votesByRequest.set(vote.requestId, list);
  }
  return rows.map((row) => {
    const requestVotes = votesByRequest.get(row.id) ?? [];
    return {
      ...row,
      voteCount: requestVotes.length || row.voteCount,
      voterNames: requestVotes.map((vote) => vote.userName),
      votes: requestVotes,
      hasVoted: voted.has(row.id),
    };
  });
}

async function attachMeta(
  companyId: string,
  userId: string,
  rows: NewItemRequestView[],
): Promise<NewItemRequestView[]> {
  const withPriority = await attachPriority(companyId, rows);
  return attachVotes(companyId, userId, withPriority);
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
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: SUGGEST_CAP,
  });
  const priorities = await priorityByVendors(companyId, vendors);
  return vendors.map((vendor) => ({
    name: vendor.name,
    priority: priorities.get(normalizeBrandName(vendor.name)) ?? null,
  }));
}

export async function createNewItemRequest(
  context: UserContext,
  input: {
    brandName: string;
    productName: string;
    description?: string;
    storeUrl: string;
    customerName?: string;
    customerPhone?: string;
    image?: File;
  },
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
  const productName = input.productName.trim();
  if (!productName) {
    throw new NewItemRequestError("Product name is required", 400);
  }

  let image: { imageUrl: string; imagePublicId: string | null } | null = null;
  if (input.image) {
    image = await uploadRequestImage(companyId, input.image);
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.newItemRequest.create({
      data: {
        companyId,
        brandName: stored.brandName,
        brandNameNormalized: stored.brandNameNormalized,
        brandIsExisting: stored.brandIsExisting,
        productName,
        productNameNormalized: normalizeProductName(productName),
        description: input.description?.trim() ?? "",
        storeUrl: input.storeUrl,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        imageUrl: image?.imageUrl ?? null,
        imagePublicId: image?.imagePublicId ?? null,
        createdByUserId: userId,
      },
    });
    if (canVoteOnNewItemRequests(context)) {
      await tx.newItemRequestVote.create({
        data: {
          companyId,
          requestId: created.id,
          userId,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
        },
      });
    }
    return tx.newItemRequest.findUniqueOrThrow({
      where: { id: created.id },
      include: requestInclude,
    });
  });
  const [view] = await attachMeta(companyId, userId, [toView(row, null)]);
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
  return listCompanyRequests(context, filters, OWN_LIST_CAP);
}

export async function listCompanyRequests(
  context: UserContext,
  filters: NewItemRequestListFilters,
  take = EXPORT_CAP,
): Promise<NewItemRequestView[]> {
  if (!canManageNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId, userId } = requireCompany(context);
  const rows = await prisma.newItemRequest.findMany({
    where: listWhere(companyId, filters),
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take,
  });
  return attachMeta(
    companyId,
    userId,
    rows.map((row) => toView(row, null)),
  );
}

export async function getRequest(context: UserContext, id: string): Promise<NewItemRequestView> {
  if (!canManageNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  const { companyId, userId } = requireCompany(context);
  const row = await prisma.newItemRequest.findFirst({
    where: { id, companyId },
    include: requestInclude,
  });
  if (!row) throw new NewItemRequestError("Request not found", 404);
  const [view] = await attachMeta(companyId, userId, [toView(row, null)]);
  return view;
}

export async function suggestProducts(context: UserContext, q: string): Promise<NewItemRequestView[]> {
  if (!canManageNewItemRequests(context)) {
    throw new NewItemRequestError("Permission denied", 403);
  }
  if (!canSearchProducts(q)) return [];
  const { companyId, userId } = requireCompany(context);
  const term = q.trim();
  const rows = await prisma.newItemRequest.findMany({
    where: {
      companyId,
      status: "open",
      OR: [
        { productName: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ],
    },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: SUGGEST_CAP,
  });
  return attachMeta(
    companyId,
    userId,
    rows.map((row) => toView(row, null)),
  );
}

export async function voteOnRequest(
  context: UserContext,
  id: string,
  body: NewItemRequestVoteBody,
): Promise<NewItemRequestView> {
  if (!canVoteOnNewItemRequests(context)) {
    throw new NewItemRequestError("Only merchants can vote", 403);
  }
  const { companyId, userId } = requireCompany(context);
  const row = await prisma.newItemRequest.findFirst({
    where: { id, companyId },
    include: requestInclude,
  });
  if (!row) throw new NewItemRequestError("Request not found", 404);
  if (row.status !== "open") {
    throw new NewItemRequestError("Can only vote on open requests", 409);
  }
  try {
    await prisma.newItemRequestVote.create({
      data: {
        companyId,
        requestId: row.id,
        userId,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        customerEmail: body.customerEmail ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new NewItemRequestError("Already voted. Remove your vote first.", 409);
    }
    throw error;
  }
  return getRequest(context, id);
}

export async function unvoteOnRequest(context: UserContext, id: string): Promise<NewItemRequestView> {
  if (!canVoteOnNewItemRequests(context)) {
    throw new NewItemRequestError("Only merchants can vote", 403);
  }
  const { companyId, userId } = requireCompany(context);
  const row = await prisma.newItemRequest.findFirst({
    where: { id, companyId },
    select: { id: true, status: true },
  });
  if (!row) throw new NewItemRequestError("Request not found", 404);
  if (row.status !== "open") {
    throw new NewItemRequestError("Can only remove a vote from an open request", 409);
  }
  await prisma.newItemRequestVote.deleteMany({
    where: { companyId, requestId: row.id, userId },
  });
  return getRequest(context, id);
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
    select: {
      brandName: true,
      brandNameNormalized: true,
      createdAt: true,
      _count: { select: { votes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const groups = new Map<string, { brandName: string; count: number; voteCount: number }>();
  for (const row of rows) {
    const existing = groups.get(row.brandNameNormalized);
    if (existing) {
      existing.count += 1;
      existing.voteCount += row._count.votes;
    } else {
      groups.set(row.brandNameNormalized, {
        brandName: row.brandName,
        count: 1,
        voteCount: row._count.votes,
      });
    }
  }

  const keys = [...groups.keys()];
  const vendors = await vendorsByNormalized(companyId, keys);
  const priorities = await priorityByVendors(companyId, [...vendors.values()]);

  return keys
    .map((key) => {
      const group = groups.get(key)!;
      const vendorName = vendors.get(key)?.name ?? null;
      const isExisting = Boolean(vendorName);
      return {
        brandName: vendorName ?? group.brandName,
        brandNameNormalized: key,
        isExisting,
        isNew: !isExisting,
        priority: isExisting ? (priorities.get(key) ?? null) : null,
        requestCount: group.count,
        voteCount: group.voteCount,
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
    voteCount: requests.reduce((sum, row) => sum + row.voteCount, 0),
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
    const [view] = await attachMeta(companyId, userId, [toView(row, null)]);
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
  const [view] = await attachMeta(companyId, userId, [toView(updated, null)]);
  return view;
}
