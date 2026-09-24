import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  ErpnextPurchaseInvoiceWebhookPayload,
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

function unwrapRawPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const top = rawPayload as Record<string, unknown>;
  return top.data && typeof top.data === "object" && !Array.isArray(top.data)
    ? (top.data as Record<string, unknown>)
    : top;
}

function collectDelimitedNames(value: unknown) {
  if (typeof value !== "string") return [];
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractPurchaseInvoiceReturnNames(rawPayload: unknown) {
  const payload = unwrapRawPayload(rawPayload);
  if (!payload) return [];
  const names = new Set<string>();
  for (const key of ["purchase_invoice_returns", "purchase_invoice_return", "purchase_invoice"]) {
    for (const name of collectDelimitedNames(payload[key])) names.add(name);
  }
  const table = payload.purchase_invoice_returns;
  if (Array.isArray(table)) {
    for (const row of table) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const record = row as Record<string, unknown>;
      for (const key of ["purchase_invoice", "purchase_invoice_return", "name"]) {
        for (const name of collectDelimitedNames(record[key])) names.add(name);
      }
    }
  }
  return Array.from(names);
}

function supplierStockReturnNameFromBillNo(billNo: string | null | undefined) {
  const trimmed = billNo?.trim();
  if (!trimmed?.startsWith("SSR-")) return null;
  const name = trimmed.slice(4).trim();
  return name || null;
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

export async function resolveGrnWebhookInstanceSecret(erpCompany: string): Promise<{
  secret: string;
  label: string | null;
} | null> {
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextCompany: erpCompany },
    select: {
      erpnextInstance: {
        select: {
          incomingWebhookSecret: true,
          label: true,
        },
      },
    },
  });

  const instance = location?.erpnextInstance;
  if (instance) {
    return {
      secret:
        instance.incomingWebhookSecret ??
        process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ??
        "",
      label: instance.label,
    };
  }

  const envSecret = process.env.ERPNEXT_INCOMING_WEBHOOK_SECRET ?? "";
  if (!envSecret) return null;
  return {
    secret: envSecret,
    label: null,
  };
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

  await autoMatchIntercompanyGrn();

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
      const linkedPurchaseReceipt = await tx.grnPurchaseReceipt.findFirst({
        where: { companyId, name: carriedPurchaseReceiptName, docstatus: { not: 2 } },
        select: { id: true, handoverAt: true, valuedAt: true },
      });
      if (linkedPurchaseReceipt) {
        await tx.grnPurchaseReceipt.update({
          where: { id: linkedPurchaseReceipt.id },
          data: { supplierStockReturnName: data.name },
        });

        const purchaseInvoiceReturnNames = extractPurchaseInvoiceReturnNames(rawPayload);
        if (purchaseInvoiceReturnNames.length > 0) {
          const linkedInvoices = await tx.grnPurchaseInvoice.findMany({
            where: {
              companyId,
              name: { in: purchaseInvoiceReturnNames },
              docstatus: { not: 2 },
            },
            include: { items: true },
          });

          for (const invoice of linkedInvoices) {
            await tx.grnPurchaseInvoice.update({
              where: { id: invoice.id },
              data: {
                purchaseReceiptId: linkedPurchaseReceipt.id,
                purchaseReceiptName: carriedPurchaseReceiptName,
                supplierStockReturnName: data.name,
              },
            });
            await tx.grnPurchaseInvoiceItem.updateMany({
              where: { purchaseInvoiceId: invoice.id, supplierStockReturn: null },
              data: { supplierStockReturn: data.name },
            });
          }

          if (linkedPurchaseReceipt.handoverAt && !linkedPurchaseReceipt.valuedAt) {
            const [prInvoice, ssrInvoice] = await Promise.all([
              tx.grnPurchaseInvoice.findFirst({
                where: {
                  purchaseReceiptId: linkedPurchaseReceipt.id,
                  docstatus: { not: 2 },
                  items: { some: { purchaseReceipt: carriedPurchaseReceiptName } },
                },
                orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
                include: { items: true },
              }),
              tx.grnPurchaseInvoice.findFirst({
                where: {
                  purchaseReceiptId: linkedPurchaseReceipt.id,
                  docstatus: { not: 2 },
                  items: { some: { supplierStockReturn: data.name } },
                },
                orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
                include: { items: true },
              }),
            ]);

            if (prInvoice && ssrInvoice) {
              const priceTally = tallyPurchaseInvoicePrices(
                prInvoice.items.filter((item) => item.purchaseReceipt === carriedPurchaseReceiptName),
                ssrInvoice.items.filter((item) => item.supplierStockReturn === data.name),
              );
              if (priceTally.status === "matched") {
                await tx.grnPurchaseReceipt.update({
                  where: { id: linkedPurchaseReceipt.id },
                  data: { valuedAt: new Date(), valuedById: null },
                });
              }
            }
          }
        }
      }
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

  await autoMatchIntercompanyGrn();

  return { ok: true as const };
}

export async function ingestPurchaseInvoiceFromWebhook(
  data: ErpnextPurchaseInvoiceWebhookPayload,
  rawPayload: unknown,
) {
  const companyId = await resolveCompanyId(data.company);
  if (!companyId) {
    return { ok: false as const, status: 404, error: "ERP company not mapped to a company location" };
  }

  const linkedPurchaseReceiptNames = Array.from(
    new Set(
      data.items
        .map((item) => item.purchase_receipt)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const linkedSupplierStockReturnNames = Array.from(
    new Set(
      data.items
        .map((item) => item.supplier_stock_return)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const ssrNameFromBillNo = data.is_return === 1 ? supplierStockReturnNameFromBillNo(data.bill_no) : null;
  let linkedStockReturn = ssrNameFromBillNo
    ? await prisma.grnSupplierStockReturn.findFirst({
        where: {
          name: ssrNameFromBillNo,
          docstatus: { not: 2 },
        },
        select: { name: true, purchaseReceiptName: true },
      })
    : linkedSupplierStockReturnNames.length
      ? await prisma.grnSupplierStockReturn.findFirst({
          where: {
            name: { in: linkedSupplierStockReturnNames },
            docstatus: { not: 2 },
          },
          select: { name: true, purchaseReceiptName: true },
        })
      : null;
  if (linkedStockReturn && !linkedStockReturn.purchaseReceiptName) {
    await autoMatchIntercompanyGrn();
    linkedStockReturn = await prisma.grnSupplierStockReturn.findFirst({
      where: {
        name: linkedStockReturn.name,
        docstatus: { not: 2 },
      },
      select: { name: true, purchaseReceiptName: true },
    });
  }
  if (!linkedStockReturn && linkedSupplierStockReturnNames.length === 0) {
    const candidateStockReturns = await prisma.grnSupplierStockReturn.findMany({
      where: {
        companyId,
        supplier: data.supplier,
        docstatus: { not: 2 },
      },
      orderBy: [{ creation: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: { name: true, purchaseReceiptName: true, rawPayload: true },
    });
    linkedStockReturn =
      candidateStockReturns.find((row) =>
        extractPurchaseInvoiceReturnNames(row.rawPayload).includes(data.name),
      ) ?? null;
  }
  if (linkedPurchaseReceiptNames.length === 0 && !linkedStockReturn?.purchaseReceiptName) {
    await prisma.grnPurchaseInvoice.deleteMany({
      where: { companyId, name: data.name },
    });
    return { ok: true as const, ignored: true as const };
  }

  const purchaseReceipt = await prisma.grnPurchaseReceipt.findFirst({
    where: {
      docstatus: { not: 2 },
      OR: [
        ...(linkedPurchaseReceiptNames.length
          ? [
              {
                companyId,
                name: { in: linkedPurchaseReceiptNames },
              },
            ]
          : []),
        ...(linkedStockReturn?.purchaseReceiptName
          ? [{ name: linkedStockReturn.purchaseReceiptName }]
          : []),
      ],
    },
    select: { id: true, name: true, supplierStockReturnName: true, handoverAt: true, valuedAt: true },
  });
  if (!purchaseReceipt) {
    await prisma.grnPurchaseInvoice.deleteMany({
      where: { companyId, name: data.name },
    });
    return { ok: true as const, ignored: true as const };
  }

  const supplierStockReturnName = purchaseReceipt.supplierStockReturnName ?? linkedStockReturn?.name ?? null;

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.grnPurchaseInvoice.upsert({
      where: { companyId_name: { companyId, name: data.name } },
      create: {
        companyId,
        purchaseReceiptId: purchaseReceipt.id,
        name: data.name,
        supplier: data.supplier,
        supplierName: data.supplier_name,
        postingDate: parseDateOnly(data.posting_date),
        docstatus: data.docstatus == null ? null : Number(data.docstatus),
        status: data.status,
        isReturn: data.is_return == null ? null : Number(data.is_return),
        returnAgainst: data.return_against,
        billNo: data.bill_no,
        amendedFrom: data.amended_from,
        owner: data.owner,
        creation: parseDateTime(data.creation),
        purchaseReceiptName: purchaseReceipt.name,
        supplierStockReturnName,
        rawPayload: rawPayload as Prisma.InputJsonValue,
      },
      update: {
        purchaseReceiptId: purchaseReceipt.id,
        supplier: data.supplier,
        supplierName: data.supplier_name,
        postingDate: parseDateOnly(data.posting_date),
        docstatus: data.docstatus == null ? null : Number(data.docstatus),
        status: data.status,
        isReturn: data.is_return == null ? null : Number(data.is_return),
        returnAgainst: data.return_against,
        billNo: data.bill_no,
        amendedFrom: data.amended_from,
        owner: data.owner,
        creation: parseDateTime(data.creation),
        purchaseReceiptName: purchaseReceipt.name,
        supplierStockReturnName,
        rawPayload: rawPayload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await tx.grnPurchaseInvoiceItem.deleteMany({
      where: { purchaseInvoiceId: invoice.id },
    });
    if (data.items.length > 0) {
      await tx.grnPurchaseInvoiceItem.createMany({
        data: data.items.map((item) => ({
          companyId,
          purchaseInvoiceId: invoice.id,
          name: item.name,
          itemCode: item.item_code,
          itemName: item.item_name,
          qty: item.qty,
          rate: item.rate,
          amount: item.amount,
          purchaseReceipt: item.purchase_receipt,
          purchaseReceiptItem: item.purchase_receipt_item,
          supplierStockReturn: item.supplier_stock_return ?? (linkedStockReturn ? supplierStockReturnName : null),
          supplierStockReturnItem: item.supplier_stock_return_item,
          stockUom: item.stock_uom,
        })),
      });
    }

    if (!purchaseReceipt.handoverAt || purchaseReceipt.valuedAt) return;

    if (!supplierStockReturnName) {
      await tx.grnPurchaseReceipt.update({
        where: { id: purchaseReceipt.id },
        data: { valuedAt: new Date(), valuedById: null },
      });
      return;
    }

    const [prInvoice, ssrInvoice] = await Promise.all([
      tx.grnPurchaseInvoice.findFirst({
        where: {
          purchaseReceiptId: purchaseReceipt.id,
          docstatus: { not: 2 },
          items: { some: { purchaseReceipt: purchaseReceipt.name } },
        },
        orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
        include: { items: true },
      }),
      tx.grnPurchaseInvoice.findFirst({
        where: {
          purchaseReceiptId: purchaseReceipt.id,
          docstatus: { not: 2 },
          items: { some: { supplierStockReturn: supplierStockReturnName } },
        },
        orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
        include: { items: true },
      }),
    ]);

    if (!prInvoice || !ssrInvoice) return;
    const priceTally = tallyPurchaseInvoicePrices(
      prInvoice.items.filter((item) => item.purchaseReceipt === purchaseReceipt.name),
      ssrInvoice.items.filter((item) => item.supplierStockReturn === supplierStockReturnName),
    );
    if (priceTally.status !== "matched") return;

    await tx.grnPurchaseReceipt.update({
      where: { id: purchaseReceipt.id },
      data: { valuedAt: new Date(), valuedById: null },
    });
  });

  return { ok: true as const, ignored: false as const };
}

export type GrnTallyStatus = "not_linked" | "matched" | "issue";

type PriceTallyInvoiceItem = {
  itemCode: string;
  qty: Prisma.Decimal | number;
  rate: Prisma.Decimal | number;
  amount: Prisma.Decimal | number;
};

export function tallyPurchaseInvoicePrices(
  purchaseReceiptInvoiceItems: PriceTallyInvoiceItem[],
  supplierStockReturnInvoiceItems: PriceTallyInvoiceItem[],
) {
  const prByItem = new Map<string, { qty: number; amount: number }>();
  const ssrByItem = new Map<string, { qty: number; amount: number }>();

  for (const item of purchaseReceiptInvoiceItems) {
    const code = normalizeItemCode(item.itemCode);
    const current = prByItem.get(code);
    prByItem.set(code, {
      qty: (current?.qty ?? 0) + Number(item.qty),
      amount: (current?.amount ?? 0) + Number(item.amount),
    });
  }
  for (const item of supplierStockReturnInvoiceItems) {
    const code = normalizeItemCode(item.itemCode);
    const current = ssrByItem.get(code);
    ssrByItem.set(code, {
      qty: (current?.qty ?? 0) + Number(item.qty),
      amount: (current?.amount ?? 0) + Number(item.amount),
    });
  }

  const issueItems = new Set<string>();
  const codes = new Set([...prByItem.keys(), ...ssrByItem.keys()]);
  for (const code of codes) {
    const pr = prByItem.get(code);
    const ssr = ssrByItem.get(code);
    if (
      Math.abs(Math.abs(pr?.qty ?? 0) - Math.abs(ssr?.qty ?? 0)) > 0.000001 ||
      Math.abs((pr?.amount ?? 0) + (ssr?.amount ?? 0)) > 0.000001
    ) {
      issueItems.add(code);
    }
  }

  return {
    status: issueItems.size > 0 ? ("issue" as const) : ("matched" as const),
    issueItems: Array.from(issueItems).sort(),
  };
}

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

type MatchPurchaseReceipt = {
  companyId: string;
  name: string;
  supplier: string;
  docstatus: number | null;
  creation: Date | null;
  supplierStockReturnName: string | null;
  items: Array<{ itemCode: string; stockQty: Prisma.Decimal | number | null; qty: Prisma.Decimal | number }>;
};

type MatchSupplierStockReturn = {
  companyId: string;
  name: string;
  supplier: string;
  docstatus: number | null;
  creation: Date | null;
  purchaseReceiptName: string | null;
  items: Array<{ itemCode: string; qty: Prisma.Decimal | number }>;
};

const GRN_MATCH_CREATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizeItemCode(value: string) {
  return value.trim().toUpperCase();
}

function addQty(totalByItem: Map<string, number>, itemCode: string, qty: number) {
  if (!itemCode) return;
  totalByItem.set(normalizeItemCode(itemCode), (totalByItem.get(normalizeItemCode(itemCode)) ?? 0) + qty);
}

export function calculateGrnMatchPercentage(
  prItems: MatchPurchaseReceipt["items"],
  ssrItems: MatchSupplierStockReturn["items"],
) {
  const prTotals = new Map<string, number>();
  const ssrTotals = new Map<string, number>();

  for (const item of prItems) {
    addQty(prTotals, item.itemCode, Number(item.stockQty ?? item.qty));
  }
  for (const item of ssrItems) {
    addQty(ssrTotals, item.itemCode, Number(item.qty));
  }

  const codes = new Set([...prTotals.keys(), ...ssrTotals.keys()]);
  let matchedQty = 0;
  let totalQty = 0;
  for (const code of codes) {
    const prQty = prTotals.get(code) ?? 0;
    const ssrQty = ssrTotals.get(code) ?? 0;
    matchedQty += Math.min(prQty, ssrQty);
    totalQty += Math.max(prQty, ssrQty);
  }

  if (totalQty <= 0) return 0;
  return Math.round((matchedQty / totalQty) * 10000) / 100;
}

export function isWithinGrnMatchCreationWindow(
  purchaseReceipt: Pick<MatchPurchaseReceipt, "creation">,
  stockReturn: Pick<MatchSupplierStockReturn, "creation">,
) {
  if (!purchaseReceipt.creation || !stockReturn.creation) return false;
  return Math.abs(purchaseReceipt.creation.getTime() - stockReturn.creation.getTime()) <= GRN_MATCH_CREATION_WINDOW_MS;
}

export function bestGrnMatchForStockReturn(
  stockReturn: MatchSupplierStockReturn,
  purchaseReceipts: MatchPurchaseReceipt[],
) {
  return purchaseReceipts
    .filter(
      (receipt) =>
        receipt.docstatus !== 2 &&
        !receipt.supplierStockReturnName &&
        isWithinGrnMatchCreationWindow(receipt, stockReturn),
    )
    .map((receipt) => ({
      companyId: receipt.companyId,
      name: receipt.name,
      percentage: calculateGrnMatchPercentage(receipt.items, stockReturn.items),
    }))
    .sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name))[0] ?? null;
}

export async function autoMatchIntercompanyGrn() {
  const suppliers = await prisma.grnIntercompanySupplier.findMany({
    select: { supplier: true },
  });
  const supplierCodes = suppliers.map((row) => row.supplier).filter(Boolean);
  if (supplierCodes.length === 0) return { matched: 0 };

  const [purchaseReceipts, stockReturns] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: {
        supplier: { in: supplierCodes },
        docstatus: { not: 2 },
        supplierStockReturnName: null,
      },
      include: { items: true },
    }),
    prisma.grnSupplierStockReturn.findMany({
      where: {
        supplier: { in: supplierCodes },
        docstatus: { not: 2 },
        purchaseReceiptName: null,
      },
      include: { items: true },
      orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  let matched = 0;
  const usedPurchaseReceipts = new Set<string>();
  for (const stockReturn of stockReturns) {
    const candidates = purchaseReceipts.filter(
      (receipt) => !usedPurchaseReceipts.has(`${receipt.companyId}:${receipt.name}`),
    );
    const best = bestGrnMatchForStockReturn(stockReturn, candidates);
    if (!best || best.percentage !== 100) continue;

    await prisma.$transaction([
      prisma.grnPurchaseReceipt.updateMany({
        where: { supplierStockReturnName: stockReturn.name },
        data: { supplierStockReturnName: null },
      }),
      prisma.grnPurchaseReceipt.update({
        where: { companyId_name: { companyId: best.companyId, name: best.name } },
        data: { supplierStockReturnName: stockReturn.name },
      }),
      prisma.grnSupplierStockReturn.update({
        where: { companyId_name: { companyId: stockReturn.companyId, name: stockReturn.name } },
        data: { purchaseReceiptName: best.name },
      }),
    ]);
    usedPurchaseReceipts.add(`${best.companyId}:${best.name}`);
    matched += 1;
  }

  return { matched };
}


