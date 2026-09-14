import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  ErpnextPurchaseReceiptWebhookPayload,
  ErpnextSupplierStockReturnWebhookPayload,
} from "@/lib/validation/erpnext-grn";

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function resolveCompanyId(erpCompany: string) {
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextCompany: erpCompany },
    select: { companyId: true },
  });
  return location?.companyId ?? null;
}

export async function resolveGrnWebhookSecret(erpCompany: string) {
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextCompany: erpCompany },
    select: {
      erpnextInstance: {
        select: { incomingWebhookSecret: true },
      },
    },
  });

  const secret =
    location?.erpnextInstance?.incomingWebhookSecret ??
    process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ??
    "";

  if (!secret) return null;
  return secret;
}

export async function ingestPurchaseReceiptFromWebhook(
  data: ErpnextPurchaseReceiptWebhookPayload,
  rawPayload: unknown,
) {
  const companyId = await resolveCompanyId(data.company);
  if (!companyId) {
    return { ok: false as const, status: 404, error: "ERP company not mapped to a company location" };
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.grnPurchaseReceipt.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
      select: { id: true, supplierStockReturnName: true },
    });
    const amendedFromReceipt = data.amended_from
      ? await tx.grnPurchaseReceipt.findUnique({
          where: { companyId_name: { companyId, name: data.amended_from } },
          select: { supplierStockReturnName: true },
        })
      : null;
    const carriedStockReturnName = existing?.supplierStockReturnName ?? amendedFromReceipt?.supplierStockReturnName ?? null;

    const receipt = await tx.grnPurchaseReceipt.upsert({
      where: { companyId_name: { companyId, name: data.name } },
      create: {
        companyId,
        name: data.name,
        supplier: data.supplier,
        supplierName: data.supplier_name,
        postingDate: parseDateOnly(data.posting_date),
        postingTime: data.posting_time,
        docstatus: data.docstatus == null ? null : Number(data.docstatus),
        status: data.status,
        amendedFrom: data.amended_from,
        owner: data.owner,
        creation: parseDateTime(data.creation),
        supplierStockReturnName: carriedStockReturnName,
        rawPayload: rawPayload as Prisma.InputJsonValue,
      },
      update: {
        supplier: data.supplier,
        supplierName: data.supplier_name,
        postingDate: parseDateOnly(data.posting_date),
        postingTime: data.posting_time,
        docstatus: data.docstatus == null ? null : Number(data.docstatus),
        status: data.status,
        amendedFrom: data.amended_from,
        owner: data.owner,
        creation: parseDateTime(data.creation),
        ...(carriedStockReturnName ? { supplierStockReturnName: carriedStockReturnName } : {}),
        rawPayload: rawPayload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await tx.grnPurchaseReceiptItem.deleteMany({
      where: { purchaseReceiptId: receipt.id },
    });
    if (data.items.length > 0) {
      await tx.grnPurchaseReceiptItem.createMany({
        data: data.items.map((item) => ({
          companyId,
          purchaseReceiptId: receipt.id,
          name: item.name,
          itemCode: item.item_code,
          itemName: item.item_name,
          qty: item.qty,
          stockQty: item.stock_qty == null ? null : item.stock_qty,
          warehouse: item.warehouse,
          stockUom: item.stock_uom,
        })),
      });
    }

    if (carriedStockReturnName) {
      await tx.grnSupplierStockReturn.updateMany({
        where: { companyId, name: carriedStockReturnName, docstatus: { not: 2 } },
        data: { purchaseReceiptName: data.name },
      });
    }
  });

  return { ok: true as const };
}

export async function ingestSupplierStockReturnFromWebhook(
  data: ErpnextSupplierStockReturnWebhookPayload,
  rawPayload: unknown,
) {
  const companyId = await resolveCompanyId(data.company);
  if (!companyId) {
    return { ok: false as const, status: 404, error: "ERP company not mapped to a company location" };
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.grnSupplierStockReturn.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
      select: { purchaseReceiptName: true },
    });
    const amendedFromStockReturn = data.amended_from
      ? await tx.grnSupplierStockReturn.findUnique({
          where: { companyId_name: { companyId, name: data.amended_from } },
          select: { purchaseReceiptName: true },
        })
      : null;
    const carriedPurchaseReceiptName = existing?.purchaseReceiptName ?? amendedFromStockReturn?.purchaseReceiptName ?? null;

    const stockReturn = await tx.grnSupplierStockReturn.upsert({
      where: { companyId_name: { companyId, name: data.name } },
      create: {
        companyId,
        name: data.name,
        supplier: data.supplier,
        returnDate: parseDateOnly(data.return_date),
        docstatus: data.docstatus == null ? null : Number(data.docstatus),
        amendedFrom: data.amended_from,
        owner: data.owner,
        creation: parseDateTime(data.creation),
        purchaseReceiptName: carriedPurchaseReceiptName,
        rawPayload: rawPayload as Prisma.InputJsonValue,
      },
      update: {
        supplier: data.supplier,
        returnDate: parseDateOnly(data.return_date),
        docstatus: data.docstatus == null ? null : Number(data.docstatus),
        amendedFrom: data.amended_from,
        owner: data.owner,
        creation: parseDateTime(data.creation),
        ...(carriedPurchaseReceiptName ? { purchaseReceiptName: carriedPurchaseReceiptName } : {}),
        rawPayload: rawPayload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    if (carriedPurchaseReceiptName) {
      await tx.grnPurchaseReceipt.updateMany({
        where: { companyId, name: carriedPurchaseReceiptName, docstatus: { not: 2 } },
        data: { supplierStockReturnName: data.name },
      });
    }

    await tx.grnSupplierStockReturnItem.deleteMany({
      where: { supplierStockReturnId: stockReturn.id },
    });
    if (data.items.length > 0) {
      await tx.grnSupplierStockReturnItem.createMany({
        data: data.items.map((item) => ({
          companyId,
          supplierStockReturnId: stockReturn.id,
          name: item.name,
          itemCode: item.item_code,
          itemName: item.item_name,
          qty: item.qty,
          stockUom: item.stock_uom,
        })),
      });
    }
  });

  return { ok: true as const };
}

export type GrnTallyStatus = "not_linked" | "matched" | "issue";

export function tallyLinkedItems(
  prItems: Array<{ itemCode: string; stockQty: Prisma.Decimal | number | null; qty: Prisma.Decimal | number }>,
  ssrItems: Array<{ itemCode: string; qty: Prisma.Decimal | number }>,
) {
  const prTotals = new Map<string, number>();
  const ssrTotals = new Map<string, number>();

  for (const item of prItems) {
    const qty = Number(item.stockQty ?? item.qty);
    prTotals.set(item.itemCode, (prTotals.get(item.itemCode) ?? 0) + qty);
  }
  for (const item of ssrItems) {
    const qty = Number(item.qty);
    ssrTotals.set(item.itemCode, (ssrTotals.get(item.itemCode) ?? 0) + qty);
  }

  const issueItems = new Set<string>();
  const codes = new Set([...prTotals.keys(), ...ssrTotals.keys()]);
  for (const code of codes) {
    if (Math.abs((prTotals.get(code) ?? 0) - (ssrTotals.get(code) ?? 0)) > 0.000001) {
      issueItems.add(code);
    }
  }

  return {
    status: issueItems.size > 0 ? ("issue" as const) : ("matched" as const),
    issueItems: Array.from(issueItems).sort(),
  };
}
