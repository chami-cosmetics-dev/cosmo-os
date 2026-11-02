import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fetchStandardSellingPricesBySku } from "@/lib/sticker-lwk-erp-price";
import { isIntercompanyPurchaseSupplier } from "@/lib/osf/erp-purchases";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const itemRefSchema = z.object({
  companyId: z.string().min(1),
  purchaseReceiptName: z.string().min(1),
  purchaseReceiptIsBackfill: z.boolean(),
  itemCode: z.string().min(1),
});

const approvalSchema = z.object({
  items: z.array(itemRefSchema).min(1).max(500),
});

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

type InvoiceItem = {
  itemCode: string;
  purchaseReceipt: string | null;
  rate: unknown;
};

type Invoice = {
  purchaseReceiptName: string | null;
  items: InvoiceItem[];
};

function costForSku(invoices: Invoice[], purchaseReceiptName: string, itemCode: string) {
  for (const invoice of invoices) {
    const directItem = invoice.items.find(
      (item) => item.itemCode === itemCode && item.purchaseReceipt === purchaseReceiptName,
    );
    if (directItem) return toAmount(directItem.rate);
  }
  for (const invoice of invoices) {
    if (invoice.purchaseReceiptName !== purchaseReceiptName) continue;
    const item = invoice.items.find((candidate) => candidate.itemCode === itemCode);
    if (item) return toAmount(item.rate);
  }
  return null;
}

function isIntercompanyGrnSupplier(
  receipt: { supplier: string | null; supplierName: string | null },
  supplierPrefixes: string[],
) {
  return isIntercompanyPurchaseSupplier(
    receipt.supplier,
    receipt.supplierName,
    supplierPrefixes,
  );
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.grn.margin_approval");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const from = parseDateParam(request.nextUrl.searchParams.get("from"));
  const to = parseDateParam(request.nextUrl.searchParams.get("to"), true);
  const dateFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;
  const receiptWhere = {
    deletedAt: null,
    docstatus: { not: 2 },
    receivedAt: { not: null },
    ...(dateFilter
      ? {
          OR: [
            { creation: dateFilter },
            { creation: null, postingDate: dateFilter },
          ],
        }
      : {}),
  };

  const [liveReceipts, backfillReceipts, locations] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: receiptWhere,
      orderBy: [{ creation: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        companyId: true,
        name: true,
        supplier: true,
        supplierName: true,
        company: { select: { name: true } },
        companyLocation: {
          select: {
            name: true,
            erpnextCompany: true,
            erpnextInstance: { select: { id: true, baseUrl: true, apiKey: true, apiSecret: true } },
          },
        },
        items: { select: { itemCode: true, itemName: true } },
        purchaseInvoices: {
          where: { deletedAt: null, docstatus: { not: 2 } },
          orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
          select: {
            purchaseReceiptName: true,
            items: { select: { itemCode: true, purchaseReceipt: true, rate: true } },
          },
        },
      },
    }),
    prisma.grnBackfillPurchaseReceipt.findMany({
      where: receiptWhere,
      orderBy: [{ creation: "desc" }, { createdAt: "desc" }],
      select: {
        companyId: true,
        name: true,
        supplier: true,
        supplierName: true,
        company: { select: { name: true } },
        companyLocation: {
          select: {
            name: true,
            erpnextCompany: true,
            erpnextInstance: { select: { id: true, baseUrl: true, apiKey: true, apiSecret: true } },
          },
        },
        items: { select: { itemCode: true, itemName: true } },
      },
    }),
    prisma.companyLocation.findMany({
      where: { supplierPrefix: { not: null } },
      select: { supplierPrefix: true },
    }),
  ]);

  const intercompanySupplierPrefixes = [
    ...new Set(
      locations
        .map((location) => location.supplierPrefix?.trim())
        .filter((prefix): prefix is string => Boolean(prefix)),
    ),
  ];
  const eligibleLiveReceipts = liveReceipts.filter(
    (receipt) => !isIntercompanyGrnSupplier(receipt, intercompanySupplierPrefixes),
  );
  const eligibleBackfillReceipts = backfillReceipts.filter(
    (receipt) => !isIntercompanyGrnSupplier(receipt, intercompanySupplierPrefixes),
  );

  const backfillReceiptNames = [...new Set(eligibleBackfillReceipts.map((receipt) => receipt.name))];
  const backfillCompanyIds = [...new Set(eligibleBackfillReceipts.map((receipt) => receipt.companyId))];
  const [backfillInvoices, approvals] = await Promise.all([
    backfillReceiptNames.length === 0
      ? Promise.resolve([])
      : prisma.grnBackfillPurchaseInvoice.findMany({
          where: {
            companyId: { in: backfillCompanyIds },
            purchaseReceiptName: { in: backfillReceiptNames },
            deletedAt: null,
            docstatus: { not: 2 },
          },
          orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
          select: {
            companyId: true,
            purchaseReceiptName: true,
            items: { select: { itemCode: true, purchaseReceipt: true, rate: true } },
          },
        }),
    prisma.grnMarginApproval.findMany({
      select: {
        companyId: true,
        purchaseReceiptName: true,
        purchaseReceiptIsBackfill: true,
        itemCode: true,
        approvedAt: true,
      },
    }),
  ]);

  const backfillInvoicesByReceipt = new Map<string, Invoice[]>();
  for (const invoice of backfillInvoices) {
    if (!invoice.purchaseReceiptName) continue;
    const key = `${invoice.companyId}:${invoice.purchaseReceiptName}`;
    const current = backfillInvoicesByReceipt.get(key) ?? [];
    current.push(invoice);
    backfillInvoicesByReceipt.set(key, current);
  }
  const approvalByItem = new Map(
    approvals.map((approval) => [
      `${approval.companyId}:${approval.purchaseReceiptName}:${approval.purchaseReceiptIsBackfill}:${approval.itemCode}`,
      approval,
    ]),
  );

  const priceRequests = new Map<string, { cfg: { baseUrl: string; apiKey: string; apiSecret: string }; itemCodes: Set<string> }>();
  for (const receipt of [...eligibleLiveReceipts, ...eligibleBackfillReceipts]) {
    const instance = receipt.companyLocation?.erpnextInstance;
    if (!instance?.baseUrl || !instance.apiKey || !instance.apiSecret) continue;
    const request = priceRequests.get(instance.id) ?? {
      cfg: { baseUrl: instance.baseUrl.replace(/\/$/, ""), apiKey: instance.apiKey, apiSecret: instance.apiSecret },
      itemCodes: new Set<string>(),
    };
    for (const item of receipt.items) request.itemCodes.add(item.itemCode);
    priceRequests.set(instance.id, request);
  }
  const pricesByInstance = new Map<string, Record<string, string>>();
  await Promise.all(
    [...priceRequests.entries()].map(async ([instanceId, priceRequest]) => {
      try {
        pricesByInstance.set(
          instanceId,
          await fetchStandardSellingPricesBySku({
            cfg: priceRequest.cfg,
            itemCodes: [...priceRequest.itemCodes],
          }),
        );
      } catch {
        pricesByInstance.set(instanceId, {});
      }
    }),
  );

  const rows = [
    ...eligibleLiveReceipts.map((receipt) => ({ ...receipt, isBackfill: false, invoices: receipt.purchaseInvoices })),
    ...eligibleBackfillReceipts.map((receipt) => ({
      ...receipt,
      isBackfill: true,
      invoices: backfillInvoicesByReceipt.get(`${receipt.companyId}:${receipt.name}`) ?? [],
    })),
  ].flatMap((receipt) => {
    const instanceId = receipt.companyLocation?.erpnextInstance?.id ?? null;
    const prices = instanceId ? pricesByInstance.get(instanceId) ?? {} : {};
    const uniqueItems = new Map<string, string | null>();
    for (const item of receipt.items) {
      if (!uniqueItems.has(item.itemCode)) uniqueItems.set(item.itemCode, item.itemName);
    }
    return [...uniqueItems].map(([itemCode, itemName]) => {
      const approval = approvalByItem.get(
        `${receipt.companyId}:${receipt.name}:${receipt.isBackfill}:${itemCode}`,
      );
      return {
        companyId: receipt.companyId,
        purchaseReceiptName: receipt.name,
        purchaseReceiptIsBackfill: receipt.isBackfill,
        supplier: receipt.supplierName ?? receipt.supplier,
        company: receipt.companyLocation?.erpnextCompany ?? receipt.companyLocation?.name ?? receipt.company.name,
        itemCode,
        itemName,
        mrp: toAmount(prices[itemCode]),
        cost: costForSku(receipt.invoices, receipt.name, itemCode),
        approvedAt: approval?.approvedAt.toISOString() ?? null,
      };
    });
  }).sort((a, b) =>
    a.supplier.localeCompare(b.supplier) ||
    a.itemCode.localeCompare(b.itemCode) ||
    a.company.localeCompare(b.company) ||
    a.purchaseReceiptName.localeCompare(b.purchaseReceiptName),
  );

  return NextResponse.json({ rows, canApprove: true });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.grn.margin_approval");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = approvalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid approval items" }, { status: 400 });

  const context = await getCurrentUserContext();
  const user = context?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const uniqueItems = [...new Map(parsed.data.items.map((item) => [
    `${item.companyId}:${item.purchaseReceiptName}:${item.purchaseReceiptIsBackfill}:${item.itemCode}`,
    item,
  ])).values()];
  const locations = await prisma.companyLocation.findMany({
    where: { supplierPrefix: { not: null } },
    select: { supplierPrefix: true },
  });
  const intercompanySupplierPrefixes = [
    ...new Set(
      locations
        .map((location) => location.supplierPrefix?.trim())
        .filter((prefix): prefix is string => Boolean(prefix)),
    ),
  ];
  const validItems = await Promise.all(uniqueItems.map(async (item) => {
    const receipt = item.purchaseReceiptIsBackfill
      ? await prisma.grnBackfillPurchaseReceipt.findFirst({
          where: {
            companyId: item.companyId,
            name: item.purchaseReceiptName,
            deletedAt: null,
            docstatus: { not: 2 },
            receivedAt: { not: null },
            items: { some: { itemCode: item.itemCode } },
          },
          select: { name: true, supplier: true, supplierName: true },
        })
      : await prisma.grnPurchaseReceipt.findFirst({
          where: {
            companyId: item.companyId,
            name: item.purchaseReceiptName,
            deletedAt: null,
            docstatus: { not: 2 },
            receivedAt: { not: null },
            items: { some: { itemCode: item.itemCode } },
          },
          select: { name: true, supplier: true, supplierName: true },
        });
    if (!receipt || isIntercompanyGrnSupplier(receipt, intercompanySupplierPrefixes)) return null;
    return item;
  }));
  if (validItems.some((item) => !item)) {
    return NextResponse.json({ error: "One or more items are not eligible for margin approval" }, { status: 409 });
  }

  await prisma.grnMarginApproval.createMany({
    data: validItems.map((item) => ({
      companyId: item!.companyId,
      purchaseReceiptName: item!.purchaseReceiptName,
      purchaseReceiptIsBackfill: item!.purchaseReceiptIsBackfill,
      itemCode: item!.itemCode,
      approvedById: user.id,
    })),
    skipDuplicates: true,
  });
  return NextResponse.json({ ok: true, approved: validItems.length });
}
