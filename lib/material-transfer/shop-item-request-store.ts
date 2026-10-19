import "server-only";

import { prisma } from "@/lib/prisma";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import { assertUniqueItemCodes } from "@/lib/material-transfer/shop-item-request";
import {
  loadShopRequestStocks,
  resolveShopRequestLines,
} from "@/lib/material-transfer/shop-item-request-lookup";
import type { ShopAvailability, ShopRequestView } from "@/lib/material-transfer/shop-item-request";

type RequestStatus = "pending" | "done";
type RequestScope = "shop" | "all";

const requestInclude = {
  createdBy: { select: { name: true } },
  doneBy: { select: { name: true } },
  lines: { orderBy: { id: "asc" as const } },
} as const;

type RequestRow = {
  id: string;
  outletName: string;
  status: RequestStatus;
  createdAt: Date;
  doneAt: Date | null;
  createdBy: { name: string | null } | null;
  doneBy: { name: string | null } | null;
  lines: Array<{
    itemCode: string;
    itemName: string;
    barcode: string;
    neededQty: number;
    shopAvailability: string | null;
  }>;
};

export type ShopRequestDto = ShopRequestView;

function displayName(user: { name: string | null } | null): string | null {
  const name = user?.name?.trim();
  return name || null;
}

function availabilityOf(value: string | null): ShopAvailability {
  if (value === "allowed" || value === "not_allowed") return value;
  return null;
}

function toDto(row: RequestRow, stocks: Map<string, ShopRequestView["lines"][number]["stocks"]>): ShopRequestDto {
  return {
    id: row.id,
    outletName: row.outletName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    createdByName: displayName(row.createdBy),
    doneAt: row.doneAt?.toISOString() ?? null,
    doneByName: displayName(row.doneBy),
    lines: row.lines.map((line) => ({
      itemCode: line.itemCode,
      itemName: line.itemName,
      barcode: line.barcode,
      neededQty: line.neededQty,
      shopAvailability: availabilityOf(line.shopAvailability),
      stocks: stocks.get(line.itemCode) ?? [],
    })),
  };
}

async function stocksFor(companyId: string, rows: RequestRow[]) {
  return loadShopRequestStocks(
    companyId,
    rows.flatMap((row) => row.lines.map((line) => line.itemCode)),
  );
}

export function resolveListScope(input: {
  canWrite: boolean;
  outletName: string | null;
  scope: RequestScope | undefined;
}): { scope: RequestScope } | { error: string; status: number } {
  const scope = input.scope ?? (input.canWrite ? "all" : "shop");
  if (scope === "all" && !input.canWrite) return { error: "Forbidden", status: 403 };
  if (scope === "shop" && !input.outletName) {
    return { error: "Assign an outlet on your staff profile", status: 403 };
  }
  return { scope };
}

export async function createShopItemRequest(input: {
  companyId: string;
  userId: string;
  outletName: string;
  lines: Array<{ itemCode: string; neededQty: number }>;
}): Promise<ShopRequestDto> {
  assertUniqueItemCodes(input.lines.map((line) => line.itemCode));
  const resolved = await resolveShopRequestLines(
    input.companyId,
    input.lines.map((line) => line.itemCode),
    { exactOnly: true },
  );
  const identities = resolved.map((identity, index) => ({
    ...identity,
    neededQty: input.lines[index]!.neededQty,
  }));
  const created = await prisma.shopItemRequest.create({
    data: {
      companyId: input.companyId,
      outletName: input.outletName,
      status: "pending",
      createdByUserId: input.userId,
      lines: {
        create: identities.map((line) => ({
          itemCode: line.itemCode,
          itemName: line.itemName,
          barcode: line.barcode,
          neededQty: line.neededQty,
          shopAvailability: line.shopAvailability,
        })),
      },
    },
    include: requestInclude,
  });
  return toDto(created, await stocksFor(input.companyId, [created]));
}

export async function listShopItemRequests(input: {
  companyId: string;
  status: RequestStatus;
  scope: RequestScope;
  outletName: string | null;
}): Promise<ShopRequestDto[]> {
  const rows = await prisma.shopItemRequest.findMany({
    where: {
      companyId: input.companyId,
      status: input.status,
      ...(input.scope === "shop" ? { outletName: input.outletName ?? "" } : {}),
    },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const stocks = await stocksFor(input.companyId, rows);
  return rows.map((row) => toDto(row, stocks));
}

async function visibleRequest(input: {
  companyId: string;
  id: string;
  canWrite: boolean;
  outletName: string | null;
}) {
  const row = await prisma.shopItemRequest.findFirst({
    where: {
      id: input.id,
      companyId: input.companyId,
      ...(!input.canWrite ? { outletName: input.outletName ?? "" } : {}),
    },
    include: requestInclude,
  });
  if (!row) throw new MaterialTransferError("Request not found", 404);
  return row;
}

export async function getShopItemRequest(input: {
  companyId: string;
  id: string;
  canWrite: boolean;
  outletName: string | null;
}): Promise<ShopRequestDto> {
  const row = await visibleRequest(input);
  return toDto(row, await stocksFor(input.companyId, [row]));
}

export async function markShopItemRequestDone(input: {
  companyId: string;
  id: string;
  userId: string;
}): Promise<ShopRequestDto> {
  const updated = await prisma.shopItemRequest.updateMany({
    where: { id: input.id, companyId: input.companyId, status: "pending" },
    data: { status: "done", doneByUserId: input.userId, doneAt: new Date() },
  });
  if (updated.count === 0) {
    const existing = await prisma.shopItemRequest.findFirst({
      where: { id: input.id, companyId: input.companyId },
      select: { status: true },
    });
    if (!existing) throw new MaterialTransferError("Request not found", 404);
    throw new MaterialTransferError("This request is already done", 409);
  }
  return getShopItemRequest({
    companyId: input.companyId,
    id: input.id,
    canWrite: true,
    outletName: null,
  });
}
