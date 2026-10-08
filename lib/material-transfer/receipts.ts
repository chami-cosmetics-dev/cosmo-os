import "server-only";

import { prisma } from "@/lib/prisma";
import { MaterialTransferError } from "@/lib/material-transfer/erp";
import {
  findReceiptLine,
  receiptVariance,
  shopScopeIsEmpty,
  transferVisibleToShop,
  type ShopScope,
} from "@/lib/material-transfer/receive";

const MAX_RECEIVED_QTY = 100_000;

function personName(user: { name: string | null; knownName: string | null } | null | undefined) {
  return user?.knownName?.trim() || user?.name?.trim() || null;
}

function summarizeLines(lines: Array<{ sentQty: number; receivedQty: number }>) {
  const variance = receiptVariance(lines);
  return {
    lineCount: lines.length,
    sentQty: lines.reduce((sum, line) => sum + line.sentQty, 0),
    receivedQty: lines.reduce((sum, line) => sum + line.receivedQty, 0),
    ...variance,
  };
}

export async function recordSentTransfer(input: {
  companyId: string;
  slot: string;
  erpName: string;
  erpCompany: string;
  sourceWarehouse: string;
  targetWarehouse: string;
  createdByUserId: string | null;
  lines: Array<{ itemCode: string; itemName?: string | null; barcode?: string | null; uom?: string | null; qty: number }>;
}) {
  return prisma.materialTransfer.create({
    data: {
      companyId: input.companyId,
      slot: input.slot,
      erpName: input.erpName,
      erpCompany: input.erpCompany,
      sourceWarehouse: input.sourceWarehouse,
      targetWarehouse: input.targetWarehouse,
      status: "sent",
      createdByUserId: input.createdByUserId,
      lines: {
        create: input.lines.map((line) => ({
          itemCode: line.itemCode.trim(),
          itemName: line.itemName?.trim() || line.itemCode.trim(),
          barcode: line.barcode?.trim() || "",
          uom: line.uom?.trim() || "Nos",
          sentQty: line.qty,
          receivedQty: 0,
        })),
      },
    },
    select: { id: true },
  });
}

const listInclude = {
  createdBy: { select: { name: true, knownName: true } },
  receivedBy: { select: { name: true, knownName: true } },
  lines: { select: { sentQty: true, receivedQty: true } },
} as const;

export async function listMaterialTransfers(input: {
  companyId: string;
  seeAll: boolean;
  scope: ShopScope;
  status?: "sent" | "received";
}) {
  if (!input.seeAll && shopScopeIsEmpty(input.scope)) return [];
  const rows = await prisma.materialTransfer.findMany({
    where: {
      companyId: input.companyId,
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: listInclude,
  });
  const visible = input.seeAll
    ? rows
    : rows.filter((row) => transferVisibleToShop(row.targetWarehouse, input.scope));
  return visible.map((row) => ({
    id: row.id,
    erpName: row.erpName,
    slot: row.slot,
    erpCompany: row.erpCompany,
    sourceWarehouse: row.sourceWarehouse,
    targetWarehouse: row.targetWarehouse,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    receivedAt: row.receivedAt?.toISOString() ?? null,
    createdByName: personName(row.createdBy),
    receivedByName: personName(row.receivedBy),
    ...summarizeLines(row.lines),
  }));
}

async function loadTransfer(companyId: string, id: string) {
  const row = await prisma.materialTransfer.findFirst({
    where: { id, companyId },
    include: {
      createdBy: { select: { name: true, knownName: true } },
      receivedBy: { select: { name: true, knownName: true } },
      lines: { orderBy: { itemCode: "asc" } },
    },
  });
  if (!row) throw new MaterialTransferError("Transfer not found", 404);
  return row;
}

function presentTransfer(
  row: Awaited<ReturnType<typeof loadTransfer>>,
) {
  return {
    id: row.id,
    erpName: row.erpName,
    slot: row.slot,
    erpCompany: row.erpCompany,
    sourceWarehouse: row.sourceWarehouse,
    targetWarehouse: row.targetWarehouse,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    receivedAt: row.receivedAt?.toISOString() ?? null,
    createdByName: personName(row.createdBy),
    receivedByName: personName(row.receivedBy),
    ...summarizeLines(row.lines),
    lines: row.lines.map((line) => ({
      id: line.id,
      itemCode: line.itemCode,
      itemName: line.itemName,
      barcode: line.barcode,
      uom: line.uom,
      sentQty: line.sentQty,
      receivedQty: line.receivedQty,
    })),
  };
}

function assertShopCanReceive(
  targetWarehouse: string,
  scope: ShopScope,
  canReceive: boolean,
) {
  if (!canReceive) throw new MaterialTransferError("Forbidden", 403);
  if (shopScopeIsEmpty(scope) || !transferVisibleToShop(targetWarehouse, scope)) {
    throw new MaterialTransferError("This transfer is for another shop", 403);
  }
}

export async function getMaterialTransfer(input: {
  companyId: string;
  id: string;
  seeAll: boolean;
  canReceive: boolean;
  scope: ShopScope;
}) {
  const row = await loadTransfer(input.companyId, input.id);
  const visible =
    input.seeAll || transferVisibleToShop(row.targetWarehouse, input.scope);
  if (!visible) throw new MaterialTransferError("This transfer is for another shop", 403);
  return presentTransfer(row);
}

export async function countReceivedItem(input: {
  companyId: string;
  id: string;
  scope: ShopScope;
  canReceive: boolean;
  code?: string;
  itemCode?: string;
  qty?: number;
}) {
  const row = await loadTransfer(input.companyId, input.id);
  assertShopCanReceive(row.targetWarehouse, input.scope, input.canReceive);
  if (row.status !== "sent") {
    throw new MaterialTransferError("This transfer is already marked received");
  }

  if (input.code?.trim()) {
    const line = findReceiptLine(row.lines, input.code.trim());
    if (!line) throw new MaterialTransferError(`${input.code.trim()} is not on this transfer`);
    if (line.receivedQty >= MAX_RECEIVED_QTY) {
      throw new MaterialTransferError("Received qty is too large");
    }
    await prisma.materialTransferLine.update({
      where: { id: line.id },
      data: { receivedQty: { increment: 1 } },
    });
  } else if (input.itemCode && input.qty != null) {
    const line = row.lines.find((item) => item.itemCode === input.itemCode);
    if (!line) throw new MaterialTransferError("Item is not on this transfer");
    if (!Number.isInteger(input.qty) || input.qty < 0 || input.qty > MAX_RECEIVED_QTY) {
      throw new MaterialTransferError("Received qty must be a whole number");
    }
    await prisma.materialTransferLine.update({
      where: { id: line.id },
      data: { receivedQty: input.qty },
    });
  } else {
    throw new MaterialTransferError("Scan a barcode or enter a qty");
  }

  return getMaterialTransfer({
    companyId: input.companyId,
    id: input.id,
    seeAll: false,
    canReceive: true,
    scope: input.scope,
  });
}

export async function markTransferReceived(input: {
  companyId: string;
  id: string;
  userId: string;
  scope: ShopScope;
  canReceive: boolean;
}) {
  const row = await loadTransfer(input.companyId, input.id);
  assertShopCanReceive(row.targetWarehouse, input.scope, input.canReceive);
  if (row.status !== "sent") {
    throw new MaterialTransferError("This transfer is already marked received");
  }
  await prisma.materialTransfer.update({
    where: { id: row.id },
    data: {
      status: "received",
      receivedByUserId: input.userId,
      receivedAt: new Date(),
    },
  });
  return getMaterialTransfer({
    companyId: input.companyId,
    id: input.id,
    seeAll: true,
    canReceive: true,
    scope: input.scope,
  });
}
