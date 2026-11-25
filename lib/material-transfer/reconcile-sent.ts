import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  listRecentMainToShopStockEntries,
  listTransferWarehouses,
  MaterialTransferError,
  recoverDroppedMaterialTransfer,
  requireErpOwner,
  resolveTransferSlots,
} from "@/lib/material-transfer/erp";
import { recordSentTransfer } from "@/lib/material-transfer/receipts";
import type { TransferSlot } from "@/lib/material-transfer/types";
import { companyForWarehouses, warehouseOptions } from "@/lib/material-transfer/warehouses";

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function ownerUserId(owner: string): Promise<string | null> {
  const email = owner.trim();
  if (!email) return null;
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: email, mode: "insensitive" } },
        { erpnextUsername: { equals: email, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function ensureReceipt(input: {
  companyId: string;
  slot: TransferSlot;
  erpName: string;
  erpCompany: string;
  sourceWarehouse: string;
  targetWarehouse: string;
  createdByUserId: string | null;
  lines: Array<{ itemCode: string; itemName: string; barcode: string; uom: string; qty: number }>;
}): Promise<"created" | "exists"> {
  const existing = await prisma.materialTransfer.findFirst({
    where: {
      companyId: input.companyId,
      slot: input.slot,
      erpName: input.erpName,
    },
    select: { id: true },
  });
  if (existing) return "exists";

  try {
    await recordSentTransfer({
      companyId: input.companyId,
      slot: input.slot,
      erpName: input.erpName,
      erpCompany: input.erpCompany,
      sourceWarehouse: input.sourceWarehouse,
      targetWarehouse: input.targetWarehouse,
      createdByUserId: input.createdByUserId,
      lines: input.lines,
    });
    await prisma.auditLog.create({
      data: {
        companyId: input.companyId,
        actorUserId: input.createdByUserId,
        module: "material-transfer",
        action: "material_transfer_submitted",
        entityType: "Stock Entry",
        entityId: input.erpName,
        summary: `Reconciled Cosmo receipt for ${input.erpName} ${input.sourceWarehouse} → ${input.targetWarehouse}`,
        afterData: {
          name: input.erpName,
          slot: input.slot,
          company: input.erpCompany,
          sourceWarehouse: input.sourceWarehouse,
          targetWarehouse: input.targetWarehouse,
          reconcile: true,
          lineCount: input.lines.length,
        },
      },
    });
    return "created";
  } catch (error) {
    if (isUniqueConflict(error)) return "exists";
    throw error;
  }
}

/** Pull recent Main→shop ERP Stock Entries missing from Cosmo History. */
export async function reconcileMissingSentTransfers(input: {
  companyId: string;
  sinceHours?: number;
}): Promise<{ created: number; checked: number }> {
  const slots = await resolveTransferSlots(input.companyId);
  let created = 0;
  let checked = 0;

  const sinceHours = input.sinceHours ?? 48;
  const since = new Date(Date.now() - sinceHours * 60 * 60_000);

  for (const slot of ["erp1", "erp2"] as const) {
    const instance = slot === "erp1" ? slots.erp1 : slots.erp2;
    if (!instance) continue;

    const known = await prisma.materialTransfer.findMany({
      where: {
        companyId: input.companyId,
        slot,
        direction: "store_to_shop",
        createdAt: { gte: since },
        erpName: { not: null },
      },
      select: { erpName: true },
    });
    const knownSet = new Set(known.map((row) => row.erpName).filter(Boolean) as string[]);

    const rows = await listRecentMainToShopStockEntries(instance.cfg, {
      sinceHours,
      limit: 80,
      skipNames: knownSet,
    });
    checked += rows.length;

    for (const row of rows) {
      if (!row.company) continue;
      const createdByUserId = await ownerUserId(row.owner);
      const result = await ensureReceipt({
        companyId: input.companyId,
        slot,
        erpName: row.name,
        erpCompany: row.company,
        sourceWarehouse: row.fromWarehouse,
        targetWarehouse: row.toWarehouse,
        createdByUserId,
        lines: row.items,
      });
      if (result === "created") {
        created += 1;
        knownSet.add(row.name);
      }
    }
  }

  return { created, checked };
}

/** Save local receipt with short retries (ERP already moved stock). */
export async function recordSentTransferResilient(
  input: Parameters<typeof recordSentTransfer>[0],
): Promise<{ id: string }> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await recordSentTransfer(input);
    } catch (error) {
      last = error;
      if (isUniqueConflict(error)) {
        const existing = await prisma.materialTransfer.findFirst({
          where: {
            companyId: input.companyId,
            slot: input.slot,
            erpName: input.erpName,
          },
          select: { id: true },
        });
        if (existing) return existing;
      }
      if (attempt === 3) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
  throw last;
}

/**
 * After a failed Send (dropped response / timeout): find matching ERP STE and
 * write Cosmo History — does not create a new Stock Entry.
 */
export async function recoverAndRecordSentTransfer(input: {
  companyId: string;
  slot: TransferSlot;
  company?: string | null;
  sourceWarehouse: string;
  targetWarehouse: string;
  createdByUserId: string | null;
  ownerUser: { erpnextUsername?: string | null; email?: string | null };
  lines: Array<{
    itemCode: string;
    itemName?: string | null;
    barcode?: string | null;
    uom?: string | null;
    qty: number;
  }>;
}): Promise<{ name: string; company: string; receiptId: string; alreadyHad: boolean }> {
  const slots = await resolveTransferSlots(input.companyId);
  const instance = input.slot === "erp1" ? slots.erp1 : slots.erp2;
  if (!instance) {
    throw new MaterialTransferError(
      input.slot === "erp1" ? "ERP1 is not configured" : "ERP2 is not configured",
    );
  }

  const warehouses = await listTransferWarehouses(instance.cfg);
  const options = warehouseOptions(input.slot, warehouses, input.company ?? null);
  let company: string;
  try {
    company = companyForWarehouses(input.sourceWarehouse, input.targetWarehouse, options);
  } catch (error) {
    throw new MaterialTransferError(error instanceof Error ? error.message : "Invalid warehouses");
  }
  if (input.slot === "erp2") {
    const selected = (input.company ?? "").trim();
    if (!selected) throw new MaterialTransferError("Select a company");
    if (selected !== company) {
      throw new MaterialTransferError("Warehouses do not belong to the selected company");
    }
  }

  const owner = requireErpOwner(input.ownerUser);
  const name = await recoverDroppedMaterialTransfer({
    cfg: instance.cfg,
    owner,
    company,
    sourceWarehouse: input.sourceWarehouse,
    targetWarehouse: input.targetWarehouse,
    lines: input.lines,
    sinceMinutes: 30,
  });
  if (!name) {
    throw new MaterialTransferError(
      "No matching Stock Entry found in ERP for this cart. Check ERP before sending again.",
      404,
    );
  }

  const existing = await prisma.materialTransfer.findFirst({
    where: { companyId: input.companyId, slot: input.slot, erpName: name },
    select: { id: true },
  });
  if (existing) {
    return { name, company, receiptId: existing.id, alreadyHad: true };
  }

  const saved = await recordSentTransferResilient({
    companyId: input.companyId,
    slot: input.slot,
    erpName: name,
    erpCompany: company,
    sourceWarehouse: input.sourceWarehouse,
    targetWarehouse: input.targetWarehouse,
    createdByUserId: input.createdByUserId,
    lines: input.lines,
  });

  await prisma.auditLog.create({
    data: {
      companyId: input.companyId,
      actorUserId: input.createdByUserId,
      module: "material-transfer",
      action: "material_transfer_submitted",
      entityType: "Stock Entry",
      entityId: name,
      summary: `Recovered Cosmo receipt for ${name} ${input.sourceWarehouse} → ${input.targetWarehouse}`,
      afterData: {
        name,
        slot: input.slot,
        company,
        sourceWarehouse: input.sourceWarehouse,
        targetWarehouse: input.targetWarehouse,
        recover: true,
        lineCount: input.lines.length,
        receiptId: saved.id,
      },
    },
  });

  return { name, company, receiptId: saved.id, alreadyHad: false };
}
