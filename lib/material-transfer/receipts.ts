import "server-only";

import { prisma } from "@/lib/prisma";
import { decideShopReturnConfirm } from "@/lib/material-transfer/confirm";
import {
  assertSlotVatLines,
  assertSourceCovers,
  liveSourceQty,
  loadTransferSlotWarehouses,
  MaterialTransferError,
  requireErpOwner,
  resolveTransferSlots,
  submitMaterialTransfer,
} from "@/lib/material-transfer/erp";
import { isMismatchTransfer } from "@/lib/material-transfer/mismatch";
import {
  findReceiptLine,
  receiptVariance,
  shopScopeIsEmpty,
  transferVisibleToShop,
  type ShopScope,
} from "@/lib/material-transfer/receive";
import type { TransferDirection, TransferSlot, TransferStatus } from "@/lib/material-transfer/types";

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

function stockEntryUrl(baseUrl: string | null | undefined, erpName: string | null | undefined) {
  const name = erpName?.trim();
  const root = baseUrl?.trim().replace(/\/$/, "");
  if (!name || !root) return null;
  return `${root}/app/stock-entry/${encodeURIComponent(name)}`;
}

function visibleToShop(
  row: { direction: string; sourceWarehouse: string; targetWarehouse: string },
  scope: ShopScope,
) {
  const warehouse = row.direction === "shop_to_main" ? row.sourceWarehouse : row.targetWarehouse;
  return transferVisibleToShop(warehouse, scope);
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
      direction: "store_to_shop",
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

export async function recordShopReturn(input: {
  companyId: string;
  slot: string;
  erpCompany: string;
  sourceWarehouse: string;
  targetWarehouse: string;
  erpCompany2?: string | null;
  sourceWarehouse2?: string | null;
  targetWarehouse2?: string | null;
  createdByUserId: string | null;
  lines: Array<{
    itemCode: string;
    itemName?: string | null;
    barcode?: string | null;
    uom?: string | null;
    qty: number;
    postSlot: string;
  }>;
}) {
  return prisma.materialTransfer.create({
    data: {
      companyId: input.companyId,
      slot: input.slot,
      direction: "shop_to_main",
      erpName: null,
      erpCompany: input.erpCompany,
      sourceWarehouse: input.sourceWarehouse,
      targetWarehouse: input.targetWarehouse,
      erpCompany2: input.erpCompany2 ?? null,
      sourceWarehouse2: input.sourceWarehouse2 ?? null,
      targetWarehouse2: input.targetWarehouse2 ?? null,
      status: "requested",
      createdByUserId: input.createdByUserId,
      lines: {
        create: input.lines.map((line) => ({
          itemCode: line.itemCode.trim(),
          itemName: line.itemName?.trim() || line.itemCode.trim(),
          barcode: line.barcode?.trim() || "",
          uom: line.uom?.trim() || "Nos",
          postSlot: line.postSlot,
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

async function slotBaseUrls(companyId: string) {
  const slots = await resolveTransferSlots(companyId);
  return {
    erp1: slots.erp1?.cfg.baseUrl ?? null,
    erp2: slots.erp2?.cfg.baseUrl ?? null,
  };
}

function presentListRow(
  row: {
    id: string;
    direction: TransferDirection;
    erpName: string | null;
    erp2Name: string | null;
    slot: string;
    erpCompany: string;
    sourceWarehouse: string;
    targetWarehouse: string;
    sourceWarehouse2: string | null;
    targetWarehouse2: string | null;
    status: TransferStatus;
    createdAt: Date;
    receivedAt: Date | null;
    createdBy: { name: string | null; knownName: string | null } | null;
    receivedBy: { name: string | null; knownName: string | null } | null;
    lines: Array<{ sentQty: number; receivedQty: number }>;
  },
  urls: { erp1: string | null; erp2: string | null },
) {
  const singleBase = row.slot === "erp1" ? urls.erp1 : row.slot === "erp2" ? urls.erp2 : null;
  const erpUrl =
    row.slot === "mixed" ? stockEntryUrl(urls.erp1, row.erpName) : stockEntryUrl(singleBase, row.erpName);
  return {
    id: row.id,
    direction: row.direction,
    erpName: row.erpName,
    erpUrl,
    erp2Name: row.erp2Name,
    erp2Url: stockEntryUrl(urls.erp2, row.erp2Name),
    slot: row.slot,
    erpCompany: row.erpCompany,
    sourceWarehouse: row.sourceWarehouse,
    targetWarehouse: row.targetWarehouse,
    sourceWarehouse2: row.sourceWarehouse2,
    targetWarehouse2: row.targetWarehouse2,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    receivedAt: row.receivedAt?.toISOString() ?? null,
    createdByName: personName(row.createdBy),
    receivedByName: personName(row.receivedBy),
    mismatch: isMismatchTransfer(row),
    ...summarizeLines(row.lines),
  };
}

export async function listMaterialTransfers(input: {
  companyId: string;
  seeAll: boolean;
  scope: ShopScope;
  status?: TransferStatus;
  direction?: TransferDirection;
  mismatch?: boolean;
}) {
  if (!input.seeAll && shopScopeIsEmpty(input.scope)) return [];
  if (
    input.mismatch &&
    input.status &&
    input.status !== "received" &&
    input.status !== "confirmed"
  ) {
    return [];
  }
  const rows = await prisma.materialTransfer.findMany({
    where: {
      companyId: input.companyId,
      ...(input.direction ? { direction: input.direction } : {}),
      ...(input.mismatch
        ? { status: { in: input.status ? [input.status] : ["received", "confirmed"] } }
        : input.status
          ? { status: input.status }
          : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: listInclude,
  });
  const urls = await slotBaseUrls(input.companyId);
  const visible = input.seeAll ? rows : rows.filter((row) => visibleToShop(row, input.scope));
  const matched = input.mismatch ? visible.filter((row) => isMismatchTransfer(row)) : visible;
  return matched.map((row) => presentListRow(row, urls));
}

async function loadTransfer(companyId: string, id: string) {
  const row = await prisma.materialTransfer.findFirst({
    where: { id, companyId },
    include: {
      createdBy: { select: { name: true, knownName: true } },
      receivedBy: { select: { name: true, knownName: true } },
      lines: {
        orderBy: { itemCode: "asc" },
        include: { receivedQtyUpdatedBy: { select: { name: true, knownName: true } } },
      },
    },
  });
  if (!row) throw new MaterialTransferError("Transfer not found", 404);
  return row;
}

function presentTransfer(
  row: Awaited<ReturnType<typeof loadTransfer>>,
  urls: { erp1: string | null; erp2: string | null },
) {
  return {
    ...presentListRow(row, urls),
    lines: row.lines.map((line) => ({
      id: line.id,
      itemCode: line.itemCode,
      itemName: line.itemName,
      barcode: line.barcode,
      uom: line.uom,
      postSlot: line.postSlot,
      sentQty: line.sentQty,
      receivedQty: line.receivedQty,
      receivedQtyUpdatedByName: personName(line.receivedQtyUpdatedBy),
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
  const visible = input.seeAll || visibleToShop(row, input.scope);
  if (!visible) throw new MaterialTransferError("This transfer is for another shop", 403);
  const urls = await slotBaseUrls(input.companyId);
  return presentTransfer(row, urls);
}

function countAllowed(row: { direction: string; status: string }, canWrite: boolean) {
  if (row.direction === "shop_to_main") {
    if (!canWrite) throw new MaterialTransferError("Forbidden", 403);
    if (row.status !== "requested") {
      throw new MaterialTransferError("This request is not open for counting", 409);
    }
    return;
  }
  if (row.status !== "sent") {
    throw new MaterialTransferError("This transfer is already marked received", 409);
  }
}

export async function countReceivedItem(input: {
  companyId: string;
  id: string;
  scope: ShopScope;
  canReceive: boolean;
  canWrite: boolean;
  userId: string;
  code?: string;
  itemCode?: string;
  qty?: number;
}) {
  const row = await loadTransfer(input.companyId, input.id);
  if (row.direction === "shop_to_main") {
    countAllowed(row, input.canWrite);
  } else {
    assertShopCanReceive(row.targetWarehouse, input.scope, input.canReceive);
    countAllowed(row, input.canWrite);
  }

  const countedAt = new Date();
  if (input.code?.trim()) {
    const line = findReceiptLine(row.lines, input.code.trim());
    if (!line) throw new MaterialTransferError(`${input.code.trim()} is not on this transfer`, 404);
    if (line.receivedQty >= MAX_RECEIVED_QTY) {
      throw new MaterialTransferError("Received qty is too large");
    }
    await prisma.materialTransferLine.update({
      where: { id: line.id },
      data: {
        receivedQty: { increment: 1 },
        receivedQtyUpdatedByUserId: input.userId,
        receivedQtyUpdatedAt: countedAt,
      },
    });
  } else if (input.itemCode && input.qty != null) {
    const line = row.lines.find((item) => item.itemCode === input.itemCode);
    if (!line) throw new MaterialTransferError("Item is not on this transfer", 404);
    if (!Number.isInteger(input.qty) || input.qty < 0 || input.qty > MAX_RECEIVED_QTY) {
      throw new MaterialTransferError("Received qty must be a whole number");
    }
    await prisma.materialTransferLine.update({
      where: { id: line.id },
      data: {
        receivedQty: input.qty,
        receivedQtyUpdatedByUserId: input.userId,
        receivedQtyUpdatedAt: countedAt,
      },
    });
  } else {
    throw new MaterialTransferError("Scan a barcode or enter a qty");
  }

  return getMaterialTransfer({
    companyId: input.companyId,
    id: input.id,
    seeAll: input.canWrite,
    canReceive: input.canReceive,
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
  if (row.direction !== "store_to_shop") {
    throw new MaterialTransferError("Shop returns are confirmed by stores", 409);
  }
  assertShopCanReceive(row.targetWarehouse, input.scope, input.canReceive);
  if (row.status !== "sent") {
    throw new MaterialTransferError("This transfer is already marked received", 409);
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

async function revertConfirmClaim(id: string) {
  await prisma.materialTransfer.updateMany({
    where: { id, status: "confirming" },
    data: { status: "requested" },
  });
}

function linePostSlot(rowSlot: string, postSlot: string): TransferSlot {
  if (postSlot === "erp1" || postSlot === "erp2") return postSlot;
  return rowSlot === "erp2" ? "erp2" : "erp1";
}

function returnLeg(
  row: {
    slot: string;
    sourceWarehouse: string;
    targetWarehouse: string;
    erpCompany: string;
    sourceWarehouse2: string | null;
    targetWarehouse2: string | null;
    erpCompany2: string | null;
  },
  slot: TransferSlot,
) {
  if (slot === "erp2" && row.sourceWarehouse2 && row.targetWarehouse2) {
    return {
      sourceWarehouse: row.sourceWarehouse2,
      targetWarehouse: row.targetWarehouse2,
      erpCompany: row.erpCompany2,
    };
  }
  return {
    sourceWarehouse: row.sourceWarehouse,
    targetWarehouse: row.targetWarehouse,
    erpCompany: row.erpCompany,
  };
}

export async function confirmShopReturn(input: {
  companyId: string;
  id: string;
  userId: string;
  lines: Array<{ itemCode: string; qty: number }>;
}) {
  const actor = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { erpnextUsername: true, email: true },
  });
  const owner = requireErpOwner(actor ?? {});
  const row = await loadTransfer(input.companyId, input.id);
  if (row.direction !== "shop_to_main") {
    throw new MaterialTransferError("This is not a shop return", 409);
  }
  const preview = decideShopReturnConfirm({
    status: row.status === "confirming" ? "requested" : row.status,
    lines: row.lines.map((line) => {
      const next = input.lines.find((item) => item.itemCode === line.itemCode);
      return {
        itemCode: line.itemCode,
        qty: next?.qty ?? line.receivedQty,
        availableQty: Number.MAX_SAFE_INTEGER,
      };
    }),
  });
  if (!preview.ok) {
    if (preview.reason === "all_zero") {
      throw new MaterialTransferError("Enter a received quantity or leave the request open");
    }
    throw new MaterialTransferError("This request is already confirmed", 409);
  }

  if (row.status === "requested") {
    const claimed = await prisma.materialTransfer.updateMany({
      where: { id: row.id, companyId: input.companyId, status: "requested", direction: "shop_to_main" },
      data: { status: "confirming" },
    });
    if (claimed.count === 0) {
      throw new MaterialTransferError("This request is already confirmed", 409);
    }
  } else if (row.status !== "confirming") {
    throw new MaterialTransferError("This request is already confirmed", 409);
  }

  const countedAt = new Date();
  let erpName = row.erpName;
  let erp2Name = row.erp2Name;
  const postedFor = (slot: TransferSlot) => (row.slot === "mixed" ? (slot === "erp1" ? erpName : erp2Name) : row.slot === slot ? erpName : null);
  const anyPosted = () => Boolean(erpName || erp2Name);
  try {
    for (const line of row.lines) {
      const next = input.lines.find((item) => item.itemCode === line.itemCode);
      if (!next || postedFor(linePostSlot(row.slot, line.postSlot))) continue;
      await prisma.materialTransferLine.update({
        where: { id: line.id },
        data: {
          receivedQty: next.qty,
          receivedQtyUpdatedByUserId: input.userId,
          receivedQtyUpdatedAt: countedAt,
        },
      });
    }

    const counted = row.lines.map((line) => {
      const next = input.lines.find((item) => item.itemCode === line.itemCode);
      return {
        itemCode: line.itemCode,
        qty: next?.qty ?? line.receivedQty,
        uom: line.uom,
        postSlot: linePostSlot(row.slot, line.postSlot),
      };
    });
    for (const slot of ["erp1", "erp2"] as const) {
      const group = counted.filter((line) => line.postSlot === slot && line.qty > 0);
      if (group.length === 0 || postedFor(slot)) continue;
      const leg = returnLeg(row, slot);
      const { instance, warehouses } = await loadTransferSlotWarehouses(input.companyId, slot);
      const withBins = await Promise.all(
        group.map(async (line) => ({
          itemCode: line.itemCode,
          qty: line.qty,
          availableQty: await liveSourceQty(instance.cfg, line.itemCode, leg.sourceWarehouse),
        })),
      );
      const decision = decideShopReturnConfirm({ status: "requested", lines: withBins });
      if (!decision.ok) {
        if (!anyPosted()) await revertConfirmClaim(row.id);
        if (decision.reason === "short_stock") {
          const available = withBins.find((line) => line.itemCode === decision.itemCode)?.availableQty ?? 0;
          throw new MaterialTransferError(
            `${decision.itemCode} has ${available} available in ${leg.sourceWarehouse}.`,
            409,
          );
        }
        throw new MaterialTransferError("Enter a received quantity or leave the request open");
      }
      const postLines = decision.postLines.map((line) => ({
        ...line,
        uom: group.find((item) => item.itemCode === line.itemCode)?.uom,
      }));
      if (slot === "erp1") {
        await assertSlotVatLines(
          instance.cfg,
          postLines.map((line) => line.itemCode),
        );
      }
      await assertSourceCovers(instance.cfg, leg.sourceWarehouse, postLines);
      const posted = await submitMaterialTransfer({
        cfg: instance.cfg,
        slot,
        company: leg.erpCompany,
        sourceWarehouse: leg.sourceWarehouse,
        targetWarehouse: leg.targetWarehouse,
        lines: postLines,
        warehouses,
        owner,
      });
      if (row.slot === "mixed" && slot === "erp2") erp2Name = posted.name;
      else erpName = posted.name;
      await prisma.materialTransfer.update({
        where: { id: row.id },
        data: { erpName, erp2Name },
      });
    }

    await prisma.materialTransfer.update({
      where: { id: row.id },
      data: {
        status: "confirmed",
        erpName,
        erp2Name,
        receivedByUserId: input.userId,
        receivedAt: new Date(),
      },
    });
  } catch (error) {
    if (!anyPosted()) await revertConfirmClaim(row.id);
    else {
      await prisma.materialTransfer
        .update({
          where: { id: row.id },
          data: { status: "confirming", erpName, erp2Name },
        })
        .catch(() => undefined);
    }
    if (error instanceof MaterialTransferError) {
      if (!anyPosted() && error.status === 422) {
        throw new MaterialTransferError(error.message, 502);
      }
      throw error;
    }
    throw new MaterialTransferError("ERP rejected the transfer", 502);
  }

  return getMaterialTransfer({
    companyId: input.companyId,
    id: input.id,
    seeAll: true,
    canReceive: true,
    scope: { explicitWarehouses: [], outletName: null },
  });
}
