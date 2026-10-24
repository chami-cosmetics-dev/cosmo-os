import { Prisma } from "@prisma/client";

import { buildGrnCompanyResolver } from "@/lib/grn-company-resolver";
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

function companyFromRawPayload(rawPayload: unknown) {
  const payload = unwrapRawPayload(rawPayload);
  const company = payload?.company;
  return typeof company === "string" && company.trim() ? company.trim() : null;
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

export async function attachPendingSupplierStockReturnPurchaseInvoices(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    stockReturnName: string;
    purchaseReceiptId: string;
    purchaseReceiptName: string;
  },
) {
  const billNo = `SSR-${input.stockReturnName}`;
  const pendingInvoices = await tx.grnPurchaseInvoice.findMany({
    where: {
      companyId: input.companyId,
      docstatus: { not: 2 },
      OR: [
        { billNo },
        { supplierStockReturnName: input.stockReturnName },
        { items: { some: { supplierStockReturn: input.stockReturnName } } },
      ],
    },
    select: { id: true },
  });

  for (const invoice of pendingInvoices) {
    await tx.grnPurchaseInvoice.update({
      where: { id: invoice.id },
      data: {
        purchaseReceiptId: input.purchaseReceiptId,
        purchaseReceiptName: input.purchaseReceiptName,
        supplierStockReturnName: input.stockReturnName,
      },
    });
    await tx.grnPurchaseInvoiceItem.updateMany({
      where: { purchaseInvoiceId: invoice.id, supplierStockReturn: null },
      data: { supplierStockReturn: input.stockReturnName },
    });
  }
}

async function resolveCompanyLocationForErpCompany(erpCompany: string) {
  const location = await prisma.companyLocation.findFirst({
    where: { erpnextCompany: erpCompany },
    select: { id: true, companyId: true },
  });
  return location ?? null;
}

async function resolveCompanyId(erpCompany: string) {
  const location = await resolveCompanyLocationForErpCompany(erpCompany);
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
  const location = await resolveCompanyLocationForErpCompany(data.company);
  if (!location) {
    return { ok: false as const, status: 404, error: "ERP company not mapped to a company location" };
  }
  const companyId = location.companyId;

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
  const carriedStockReturnReference =
    existing?.supplierStockReturnName ?? amendedFromReceipt?.supplierStockReturnName ?? null;
  const carriedStockReturn = carriedStockReturnReference
    ? await prisma.grnSupplierStockReturn.findFirst({
        where: { companyId, name: carriedStockReturnReference, docstatus: { not: 2 } },
        select: {
          companyId: true,
          name: true,
          supplier: true,
          supplierName: true,
          rawPayload: true,
        },
      })
    : null;
  const matchContext = carriedStockReturn ? await loadIntercompanyMatchContext() : null;
  const carriedStockReturnName =
    carriedStockReturn &&
    matchContext &&
    isMatchingIntercompanyCompanyFlow(
      matchContext.resolvers.get(companyId),
      {
        companyId,
        companyLocationId: location.id,
        supplier: data.supplier,
        supplierName: data.supplier_name,
      },
      carriedStockReturn,
    )
      ? carriedStockReturn.name
      : null;

    const receipt = await tx.grnPurchaseReceipt.upsert({
      where: { companyId_name: { companyId, name: data.name } },
      create: {
        companyId,
        companyLocationId: location.id,
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
        companyLocationId: location.id,
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
      select: { id: true },
    });

    if (data.items.length > 0) {
      await tx.grnPurchaseReceiptItem.deleteMany({
        where: { purchaseReceiptId: receipt.id },
      });
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

    if (carriedStockReturnReference && !carriedStockReturnName) {
      await tx.grnSupplierStockReturn.updateMany({
        where: {
          companyId,
          name: carriedStockReturnReference,
          purchaseReceiptName: data.name,
        },
        data: { purchaseReceiptName: null },
      });
      await tx.grnPurchaseInvoice.updateMany({
        where: {
          companyId,
          purchaseReceiptName: data.name,
          supplierStockReturnName: carriedStockReturnReference,
        },
        data: { purchaseReceiptId: null, purchaseReceiptName: null },
      });
    }

    if (carriedStockReturnName) {
      await tx.grnPurchaseReceipt.updateMany({
        where: {
          supplierStockReturnName: carriedStockReturnName,
          NOT: { id: receipt.id },
        },
        data: { supplierStockReturnName: null },
      });
      await tx.grnSupplierStockReturn.updateMany({
        where: { companyId, name: carriedStockReturnName, docstatus: { not: 2 } },
        data: { purchaseReceiptName: data.name },
      });
      await attachPendingSupplierStockReturnPurchaseInvoices(tx, {
        companyId,
        stockReturnName: carriedStockReturnName,
        purchaseReceiptId: receipt.id,
        purchaseReceiptName: data.name,
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
    const carriedPurchaseReceiptReference =
      existing?.purchaseReceiptName ?? amendedFromStockReturn?.purchaseReceiptName ?? null;
    const carriedPurchaseReceipt = carriedPurchaseReceiptReference
      ? await prisma.grnPurchaseReceipt.findFirst({
          where: { companyId, name: carriedPurchaseReceiptReference, docstatus: { not: 2 } },
          select: {
            id: true,
            companyId: true,
            companyLocationId: true,
            name: true,
            supplier: true,
            supplierName: true,
            handoverAt: true,
            valuedAt: true,
          },
        })
      : null;
    const matchContext = carriedPurchaseReceipt ? await loadIntercompanyMatchContext() : null;
    const carriedPurchaseReceiptName =
      carriedPurchaseReceipt &&
      matchContext &&
      isMatchingIntercompanyCompanyFlow(
        matchContext.resolvers.get(companyId),
        carriedPurchaseReceipt,
        {
          companyId,
          name: data.name,
          supplier: data.supplier,
          supplierName: data.supplier_name,
          rawPayload,
        },
      )
        ? carriedPurchaseReceipt.name
        : null;

    const stockReturn = await tx.grnSupplierStockReturn.upsert({
      where: { companyId_name: { companyId, name: data.name } },
      create: {
        companyId,
        name: data.name,
        supplier: data.supplier,
        supplierName: data.supplier_name,
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
        supplierName: data.supplier_name,
        returnDate: parseDateOnly(data.return_date),
        docstatus: data.docstatus == null ? null : Number(data.docstatus),
        amendedFrom: data.amended_from,
        owner: data.owner,
        creation: parseDateTime(data.creation),
        purchaseReceiptName: carriedPurchaseReceiptName,
        rawPayload: rawPayload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    if (carriedPurchaseReceiptReference && !carriedPurchaseReceiptName) {
      await tx.grnPurchaseReceipt.updateMany({
        where: {
          companyId,
          name: carriedPurchaseReceiptReference,
          supplierStockReturnName: data.name,
        },
        data: { supplierStockReturnName: null },
      });
      await tx.grnPurchaseInvoice.updateMany({
        where: {
          companyId,
          purchaseReceiptName: carriedPurchaseReceiptReference,
          supplierStockReturnName: data.name,
        },
        data: { purchaseReceiptId: null, purchaseReceiptName: null },
      });
    }

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
              OR: [
                { companyId, name: { in: purchaseInvoiceReturnNames } },
                { billNo: `SSR-${data.name}` },
              ],
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
        } else {
          await attachPendingSupplierStockReturnPurchaseInvoices(tx, {
            companyId,
            stockReturnName: data.name,
            purchaseReceiptId: linkedPurchaseReceipt.id,
            purchaseReceiptName: carriedPurchaseReceiptName,
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

  const existingInvoice = await prisma.grnPurchaseInvoice.findUnique({
    where: { companyId_name: { companyId, name: data.name } },
    select: {
      purchaseReceiptName: true,
      supplierStockReturnName: true,
    },
  });
  const amendedFromInvoice = data.amended_from
    ? await prisma.grnPurchaseInvoice.findUnique({
        where: { companyId_name: { companyId, name: data.amended_from } },
        select: {
          purchaseReceiptName: true,
          supplierStockReturnName: true,
        },
      })
    : null;

  const linkedPurchaseReceiptNames = Array.from(
    new Set(
      [
        ...data.items.map((item) => item.purchase_receipt),
        existingInvoice?.purchaseReceiptName,
        amendedFromInvoice?.purchaseReceiptName,
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  const linkedSupplierStockReturnNames = Array.from(
    new Set(
      [
        ...data.items.map((item) => item.supplier_stock_return),
        existingInvoice?.supplierStockReturnName,
        amendedFromInvoice?.supplierStockReturnName,
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  const ssrNameFromBillNo =
    (data.is_return === 1 ? supplierStockReturnNameFromBillNo(data.bill_no) : null) ??
    existingInvoice?.supplierStockReturnName ??
    amendedFromInvoice?.supplierStockReturnName ??
    null;
  const inheritedPurchaseReceiptName = linkedPurchaseReceiptNames.length === 1 ? linkedPurchaseReceiptNames[0] ?? null : null;
  let linkedStockReturn = ssrNameFromBillNo
    ? await prisma.grnSupplierStockReturn.findFirst({
        where: {
          name: ssrNameFromBillNo,
          docstatus: { not: 2 },
        },
          select: {
            companyId: true,
            name: true,
            purchaseReceiptName: true,
            supplier: true,
            supplierName: true,
            rawPayload: true,
          },
      })
    : linkedSupplierStockReturnNames.length
      ? await prisma.grnSupplierStockReturn.findFirst({
          where: {
            name: { in: linkedSupplierStockReturnNames },
            docstatus: { not: 2 },
          },
          select: {
            companyId: true,
            name: true,
            purchaseReceiptName: true,
            supplier: true,
            supplierName: true,
            rawPayload: true,
          },
        })
      : null;
  if (linkedStockReturn && !linkedStockReturn.purchaseReceiptName) {
    await autoMatchIntercompanyGrn();
    linkedStockReturn = await prisma.grnSupplierStockReturn.findFirst({
      where: {
        name: linkedStockReturn.name,
        docstatus: { not: 2 },
      },
      select: {
        companyId: true,
        name: true,
        purchaseReceiptName: true,
        supplier: true,
        supplierName: true,
        rawPayload: true,
      },
    });
  }
  let linkedStockReturnPurchaseReceiptName = linkedStockReturn?.purchaseReceiptName ?? null;
  if (linkedStockReturn && !linkedStockReturnPurchaseReceiptName) {
    const reverseLinkedPurchaseReceipt = await prisma.grnPurchaseReceipt.findFirst({
      where: {
        supplierStockReturnName: linkedStockReturn.name,
        docstatus: { not: 2 },
      },
      select: { name: true },
    });
    linkedStockReturnPurchaseReceiptName = reverseLinkedPurchaseReceipt?.name ?? null;
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
      select: {
        companyId: true,
        name: true,
        purchaseReceiptName: true,
        supplier: true,
        supplierName: true,
        rawPayload: true,
      },
    });
    linkedStockReturn =
      candidateStockReturns.find((row) =>
        extractPurchaseInvoiceReturnNames(row.rawPayload).includes(data.name),
      ) ?? null;
    linkedStockReturnPurchaseReceiptName = linkedStockReturn?.purchaseReceiptName ?? null;
  }
  if (linkedPurchaseReceiptNames.length === 0 && !linkedStockReturnPurchaseReceiptName && !linkedStockReturn && !ssrNameFromBillNo) {
    await prisma.grnPurchaseInvoice.deleteMany({
      where: { companyId, name: data.name },
    });
    return { ok: true as const, ignored: true as const };
  }

  let purchaseReceipt = await prisma.grnPurchaseReceipt.findFirst({
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
        ...(linkedStockReturnPurchaseReceiptName
          ? [{ name: linkedStockReturnPurchaseReceiptName }]
          : []),
      ],
    },
    select: {
      id: true,
      companyId: true,
      companyLocationId: true,
      name: true,
      supplier: true,
      supplierName: true,
      supplierStockReturnName: true,
      handoverAt: true,
      valuedAt: true,
      valuedById: true,
    },
  });
  if (purchaseReceipt && linkedStockReturn) {
    const matchContext = await loadIntercompanyMatchContext();
    if (!isMatchingIntercompanyCompanyFlow(
      matchContext.resolvers.get(purchaseReceipt.companyId),
      purchaseReceipt,
      linkedStockReturn,
    )) {
      purchaseReceipt = null;
    }
  }
  if (!purchaseReceipt) {
    const pendingSupplierStockReturnName = linkedStockReturn?.name ?? ssrNameFromBillNo;
    if (pendingSupplierStockReturnName) {
      await prisma.$transaction(async (tx) => {
        const invoice = await tx.grnPurchaseInvoice.upsert({
          where: { companyId_name: { companyId, name: data.name } },
          create: {
            companyId,
            purchaseReceiptId: null,
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
            purchaseReceiptName: null,
            supplierStockReturnName: pendingSupplierStockReturnName,
            rawPayload: rawPayload as Prisma.InputJsonValue,
          },
          update: {
            purchaseReceiptId: null,
            purchaseReceiptName: null,
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
            supplierStockReturnName: pendingSupplierStockReturnName,
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
              purchaseReceipt: null,
              purchaseReceiptItem: null,
              supplierStockReturn: item.supplier_stock_return ?? pendingSupplierStockReturnName,
              supplierStockReturnItem: item.supplier_stock_return_item,
              stockUom: item.stock_uom,
            })),
          });
        }
      });
      return { ok: true as const, ignored: false as const, pending: true as const };
    }

    await prisma.grnPurchaseInvoice.deleteMany({
      where: { companyId, name: data.name },
    });
    return { ok: true as const, ignored: true as const };
  }

  // A normal PR invoice must not inherit the PR's SSR link. Only link an SSR
  // when this PI payload identifies one itself (or is an ERP return invoice).
  const supplierStockReturnName = linkedStockReturn?.name ?? (data.is_return === 1 ? ssrNameFromBillNo : null);

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
          purchaseReceipt: item.purchase_receipt ?? inheritedPurchaseReceiptName,
          purchaseReceiptItem: item.purchase_receipt_item,
          supplierStockReturn: item.supplier_stock_return ?? supplierStockReturnName,
          supplierStockReturnItem: item.supplier_stock_return_item,
          stockUom: item.stock_uom,
        })),
      });
    }

    if (!purchaseReceipt.handoverAt) return;

    if (!supplierStockReturnName) {
      if (!purchaseReceipt.valuedAt) {
        await tx.grnPurchaseReceipt.update({
          where: { id: purchaseReceipt.id },
          data: { valuedAt: new Date(), valuedById: null },
        });
      }
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

    if (!prInvoice || !ssrInvoice) {
      if (purchaseReceipt.valuedAt && !purchaseReceipt.valuedById) {
        await tx.grnPurchaseReceipt.update({
          where: { id: purchaseReceipt.id },
          data: { valuedAt: null, valuedById: null },
        });
      }
      return;
    }
    const priceTally = tallyPurchaseInvoicePrices(
      prInvoice.items.filter((item) => item.purchaseReceipt === purchaseReceipt.name),
      ssrInvoice.items.filter((item) => item.supplierStockReturn === supplierStockReturnName),
    );
    if (priceTally.status !== "matched") {
      if (purchaseReceipt.valuedAt && !purchaseReceipt.valuedById) {
        await tx.grnPurchaseReceipt.update({
          where: { id: purchaseReceipt.id },
          data: { valuedAt: null, valuedById: null },
        });
      }
      return;
    }

    if (!purchaseReceipt.valuedAt) {
      await tx.grnPurchaseReceipt.update({
        where: { id: purchaseReceipt.id },
        data: { valuedAt: new Date(), valuedById: null },
      });
    }
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
  companyLocationId: string | null;
  name: string;
  supplier: string;
  supplierName: string | null;
  docstatus: number | null;
  creation: Date | null;
  postingDate?: Date | null;
  supplierStockReturnName: string | null;
  items: Array<{ itemCode: string; stockQty: Prisma.Decimal | number | null; qty: Prisma.Decimal | number }>;
};

type MatchSupplierStockReturn = {
  companyId: string;
  name: string;
  supplier: string;
  supplierName: string | null;
  docstatus: number | null;
  creation: Date | null;
  returnDate?: Date | null;
  purchaseReceiptName: string | null;
  rawPayload: unknown;
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
  purchaseReceipt: Pick<MatchPurchaseReceipt, "creation" | "postingDate">,
  stockReturn: Pick<MatchSupplierStockReturn, "creation" | "returnDate">,
) {
  if (purchaseReceipt.postingDate && stockReturn.returnDate) {
    return purchaseReceipt.postingDate.toISOString().slice(0, 10) === stockReturn.returnDate.toISOString().slice(0, 10);
  }
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

async function loadIntercompanyMatchContext() {
  const locations = await prisma.companyLocation.findMany({
    select: {
      id: true,
      companyId: true,
      name: true,
      shortName: true,
      erpnextCompany: true,
      supplierPrefix: true,
      isMainCompany: true,
    },
  });
  const locationsByCompany = new Map<string, typeof locations>();
  for (const location of locations) {
    const companyLocations = locationsByCompany.get(location.companyId) ?? [];
    companyLocations.push(location);
    locationsByCompany.set(location.companyId, companyLocations);
  }
  const resolvers = new Map(
    [...locationsByCompany].map(([companyId, companyLocations]) => [
      companyId,
      buildGrnCompanyResolver(companyLocations),
    ]),
  );
  const intercompanyLocations = locations.filter((location) => location.supplierPrefix?.trim());
  return {
    resolvers,
    locationIds: intercompanyLocations.map((location) => location.id),
    supplierPrefixes: [
      ...new Set(intercompanyLocations.map((location) => location.supplierPrefix!.trim())),
    ],
  };
}

async function clearInvalidIntercompanyGrnLinks(
  matchContext: Awaited<ReturnType<typeof loadIntercompanyMatchContext>>,
) {
  const linkedPurchaseReceipts = await prisma.grnPurchaseReceipt.findMany({
    where: {
      docstatus: { not: 2 },
      supplierStockReturnName: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      companyLocationId: true,
      name: true,
      supplier: true,
      supplierName: true,
      supplierStockReturnName: true,
    },
  });
  if (linkedPurchaseReceipts.length === 0) return 0;

  const linkedStockReturns = await prisma.grnSupplierStockReturn.findMany({
    where: {
      docstatus: { not: 2 },
      name: { in: linkedPurchaseReceipts.map((receipt) => receipt.supplierStockReturnName!) },
    },
    select: {
      companyId: true,
      name: true,
      supplier: true,
      supplierName: true,
      rawPayload: true,
    },
  });
  const stockReturnByCompanyName = new Map(
    linkedStockReturns.map((stockReturn) => [`${stockReturn.companyId}:${stockReturn.name}`, stockReturn]),
  );
  const invalidPairs = linkedPurchaseReceipts
    .map((purchaseReceipt) => ({
      purchaseReceipt,
      stockReturn: stockReturnByCompanyName.get(
        `${purchaseReceipt.companyId}:${purchaseReceipt.supplierStockReturnName}`,
      ),
    }))
    .filter(
      (
        pair,
      ): pair is {
        purchaseReceipt: (typeof linkedPurchaseReceipts)[number];
        stockReturn: (typeof linkedStockReturns)[number];
      } => {
        const stockReturn = pair.stockReturn;
        if (!stockReturn) return false;
        return !isMatchingIntercompanyCompanyFlow(
          matchContext.resolvers.get(pair.purchaseReceipt.companyId),
          pair.purchaseReceipt,
          stockReturn,
        );
      },
    );

  for (const { purchaseReceipt, stockReturn } of invalidPairs) {
    await prisma.$transaction(async (tx) => {
      await tx.grnPurchaseReceipt.updateMany({
        where: { id: purchaseReceipt.id, supplierStockReturnName: stockReturn.name },
        data: { supplierStockReturnName: null },
      });
      await tx.grnSupplierStockReturn.updateMany({
        where: {
          companyId: stockReturn.companyId,
          name: stockReturn.name,
          purchaseReceiptName: purchaseReceipt.name,
        },
        data: { purchaseReceiptName: null },
      });
      await tx.grnPurchaseInvoice.updateMany({
        where: {
          companyId: purchaseReceipt.companyId,
          purchaseReceiptName: purchaseReceipt.name,
          supplierStockReturnName: stockReturn.name,
        },
        data: { purchaseReceiptId: null, purchaseReceiptName: null },
      });
    });
  }

  return invalidPairs.length;
}

function isMatchingIntercompanyCompanyFlow(
  resolver: ReturnType<typeof buildGrnCompanyResolver> | undefined,
  purchaseReceipt: Pick<
    MatchPurchaseReceipt,
    "companyId" | "companyLocationId" | "supplier" | "supplierName"
  >,
  stockReturn: Pick<
    MatchSupplierStockReturn,
    "companyId" | "name" | "supplier" | "supplierName" | "rawPayload"
  >,
) {
  return Boolean(
    resolver &&
      purchaseReceipt.companyId === stockReturn.companyId &&
      resolver.isMatchingIntercompanyPair({
        purchaseReceiptCompanyLocationId: purchaseReceipt.companyLocationId,
        purchaseReceiptSupplier: purchaseReceipt.supplier,
        purchaseReceiptSupplierName: purchaseReceipt.supplierName,
        stockReturnName: stockReturn.name,
        stockReturnCompany: companyFromRawPayload(stockReturn.rawPayload),
        stockReturnSupplier: stockReturn.supplier,
        stockReturnSupplierName: stockReturn.supplierName,
      }),
  );
}

export async function autoMatchIntercompanyGrn() {
  const matchContext = await loadIntercompanyMatchContext();
  if (matchContext.locationIds.length === 0) return { matched: 0 };
  const invalidLinksCleared = await clearInvalidIntercompanyGrnLinks(matchContext);

  const [purchaseReceipts, stockReturns] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: {
        companyLocationId: { in: matchContext.locationIds },
        docstatus: { not: 2 },
        supplierStockReturnName: null,
      },
      include: { items: true, supplierStockReturnLinks: { select: { supplierStockReturnId: true } } },
    }),
    prisma.grnSupplierStockReturn.findMany({
      where: {
        OR: matchContext.supplierPrefixes.flatMap((prefix) => [
          { supplier: { contains: prefix, mode: "insensitive" as const } },
          { supplierName: { contains: prefix, mode: "insensitive" as const } },
        ]),
        docstatus: { not: 2 },
        purchaseReceiptName: null,
      },
      include: { items: true, purchaseReceiptLinks: { select: { purchaseReceiptId: true } } },
      orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  let matched = 0;
  const usedPurchaseReceipts = new Set<string>();
  for (const stockReturn of stockReturns) {
    if (stockReturn.purchaseReceiptLinks.length > 0) continue;
    const resolver = matchContext.resolvers.get(stockReturn.companyId);
    if (!resolver) continue;
    const candidates = purchaseReceipts.filter(
      (receipt) =>
        receipt.companyId === stockReturn.companyId &&
        isMatchingIntercompanyCompanyFlow(resolver, receipt, stockReturn) &&
        !usedPurchaseReceipts.has(`${receipt.companyId}:${receipt.name}`) &&
        receipt.supplierStockReturnLinks.length === 0,
    );
    const best = bestGrnMatchForStockReturn(stockReturn, candidates);
    if (!best || best.percentage !== 100) continue;

    await prisma.$transaction(async (tx) => {
      await tx.grnPurchaseReceipt.updateMany({
        where: { supplierStockReturnName: stockReturn.name },
        data: { supplierStockReturnName: null },
      });
      const linkedPurchaseReceipt = await tx.grnPurchaseReceipt.update({
        where: { companyId_name: { companyId: best.companyId, name: best.name } },
        data: { supplierStockReturnName: stockReturn.name },
        select: { id: true },
      });
      await tx.grnSupplierStockReturn.update({
        where: { companyId_name: { companyId: stockReturn.companyId, name: stockReturn.name } },
        data: { purchaseReceiptName: best.name },
      });
      await attachPendingSupplierStockReturnPurchaseInvoices(tx, {
        companyId: stockReturn.companyId,
        stockReturnName: stockReturn.name,
        purchaseReceiptId: linkedPurchaseReceipt.id,
        purchaseReceiptName: best.name,
      });
    });
    usedPurchaseReceipts.add(`${best.companyId}:${best.name}`);
    matched += 1;
  }

  return { matched, invalidLinksCleared };
}

export async function autoMatchBackfillIntercompanyGrn() {
  const matchContext = await loadIntercompanyMatchContext();
  if (matchContext.locationIds.length === 0) return { matched: 0 };

  const [livePurchaseReceipts, backfillPurchaseReceipts, stockReturns] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: {
        companyLocationId: { in: matchContext.locationIds },
        docstatus: { not: 2 },
        supplierStockReturnName: null,
      },
      include: { items: true, supplierStockReturnLinks: { select: { supplierStockReturnId: true } } },
    }),
    prisma.grnBackfillPurchaseReceipt.findMany({
      where: {
        companyLocationId: { in: matchContext.locationIds },
        docstatus: { not: 2 },
      },
      include: { items: true, supplierStockReturnLinks: { select: { supplierStockReturnId: true } } },
    }),
    prisma.grnBackfillSupplierStockReturn.findMany({
      where: {
        OR: matchContext.supplierPrefixes.flatMap((prefix) => [
          { supplier: { contains: prefix, mode: "insensitive" as const } },
          { supplierName: { contains: prefix, mode: "insensitive" as const } },
        ]),
        docstatus: { not: 2 },
        purchaseReceiptName: null,
      },
      include: { items: true, purchaseReceiptLinks: { select: { purchaseReceiptId: true } } },
      orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const usedPurchaseReceiptNames = new Set(
    [
      ...(await prisma.grnSupplierStockReturn.findMany({
        where: { docstatus: { not: 2 }, purchaseReceiptName: { not: null } },
        select: { purchaseReceiptName: true, purchaseReceiptLinks: { select: { purchaseReceipt: { select: { name: true } } } } },
      })),
      ...(await prisma.grnBackfillSupplierStockReturn.findMany({
        where: { docstatus: { not: 2 }, purchaseReceiptName: { not: null } },
        select: { purchaseReceiptName: true, purchaseReceiptLinks: { select: { purchaseReceipt: { select: { name: true } } } } },
      })),
    ]
      .flatMap((row) => [row.purchaseReceiptName, ...row.purchaseReceiptLinks.map((link) => link.purchaseReceipt.name)])
      .filter((name): name is string => Boolean(name)),
  );

  const candidateMatchesByStockReturn = new Map<
    string,
    Array<{ companyId: string; id: string | null; name: string; percentage: number; isBackfill: boolean }>
  >();
  const claimCountByPurchaseReceipt = new Map<string, number>();
  const purchaseReceiptsForMatching = [
    ...livePurchaseReceipts.map((receipt) => ({
      ...receipt,
      isBackfill: false,
    })),
    ...backfillPurchaseReceipts.map((receipt) => ({
      ...receipt,
      supplierStockReturnName: null as string | null,
      isBackfill: true,
    })),
  ];

  for (const stockReturn of stockReturns) {
    if (stockReturn.purchaseReceiptLinks.length > 0) continue;
    const resolver = matchContext.resolvers.get(stockReturn.companyId);
    if (!resolver) continue;
    const candidates = purchaseReceiptsForMatching
      .filter(
        (receipt) =>
          receipt.companyId === stockReturn.companyId &&
          isMatchingIntercompanyCompanyFlow(resolver, receipt, stockReturn) &&
          receipt.supplierStockReturnLinks.length === 0 &&
          !usedPurchaseReceiptNames.has(receipt.name) &&
          isWithinGrnMatchCreationWindow(receipt, stockReturn),
      )
      .map((receipt) => ({
        companyId: receipt.companyId,
        id: receipt.isBackfill ? null : receipt.id,
        name: receipt.name,
        percentage: calculateGrnMatchPercentage(receipt.items, stockReturn.items),
        isBackfill: receipt.isBackfill,
      }))
      .filter((candidate) => candidate.percentage === 100)
      .sort((a, b) => a.name.localeCompare(b.name));
    candidateMatchesByStockReturn.set(stockReturn.name, candidates);
    for (const candidate of candidates) {
      const key = `${candidate.companyId}:${candidate.name}`;
      claimCountByPurchaseReceipt.set(key, (claimCountByPurchaseReceipt.get(key) ?? 0) + 1);
    }
  }

  let matched = 0;
  for (const stockReturn of stockReturns) {
    const candidates = candidateMatchesByStockReturn.get(stockReturn.name) ?? [];
    if (candidates.length !== 1) continue;
    const candidate = candidates[0];
    if ((claimCountByPurchaseReceipt.get(`${candidate.companyId}:${candidate.name}`) ?? 0) !== 1) continue;

    await prisma.$transaction(async (tx) => {
      if (!candidate.isBackfill) {
        await tx.grnPurchaseReceipt.update({
          where: { companyId_name: { companyId: candidate.companyId, name: candidate.name } },
          data: { supplierStockReturnName: stockReturn.name },
        });
      }
      await tx.grnBackfillSupplierStockReturn.update({
        where: { companyId_name: { companyId: stockReturn.companyId, name: stockReturn.name } },
        data: { purchaseReceiptName: candidate.name },
      });
      if (candidate.id) {
        await attachPendingSupplierStockReturnPurchaseInvoices(tx, {
          companyId: stockReturn.companyId,
          stockReturnName: stockReturn.name,
          purchaseReceiptId: candidate.id,
          purchaseReceiptName: candidate.name,
        });
      }
      await tx.grnBackfillPurchaseInvoice.updateMany({
        where: {
          companyId: stockReturn.companyId,
          docstatus: { not: 2 },
          OR: [
            { billNo: `SSR-${stockReturn.name}` },
            { supplierStockReturnName: stockReturn.name },
            { items: { some: { supplierStockReturn: stockReturn.name } } },
          ],
        },
        data: {
          purchaseReceiptName: candidate.name,
          supplierStockReturnName: stockReturn.name,
        },
      });
    });
    usedPurchaseReceiptNames.add(candidate.name);
    matched += 1;
  }

  return { matched };
}

