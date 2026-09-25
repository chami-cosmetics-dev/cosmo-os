import { NextRequest, NextResponse } from "next/server";

import { autoMatchIntercompanyGrn, bestGrnMatchForStockReturn, calculateGrnMatchPercentage, tallyLinkedItems } from "@/lib/grn";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function erpDocUrl(baseUrl: string | null | undefined, doctypeSlug: string, name: string) {
  const base = baseUrl?.replace(/\/$/, "");
  return base ? `${base}/app/${doctypeSlug}/${encodeURIComponent(name)}` : null;
}

function erpCompanyFromPayload(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const top = rawPayload as Record<string, unknown>;
  const payload =
    top.data && typeof top.data === "object" && !Array.isArray(top.data)
      ? (top.data as Record<string, unknown>)
      : top;
  return typeof payload.company === "string" && payload.company.trim()
    ? payload.company.trim()
    : null;
}

function erpBaseUrlForPayload(
  rawPayload: unknown,
  locations: Array<{
    erpnextCompany: string | null;
    erpnextInstance: { baseUrl: string } | null;
  }>,
) {
  const erpCompany = erpCompanyFromPayload(rawPayload);
  if (!erpCompany) return null;
  return (
    locations.find((location) => location.erpnextCompany === erpCompany)
      ?.erpnextInstance?.baseUrl ?? null
  );
}

function buildTallyIssues(
  prItems: Array<{ itemCode: string; itemName: string | null; stockQty: unknown; qty: unknown }>,
  ssrItems: Array<{ itemCode: string; itemName: string | null; qty: unknown }>,
) {
  const prTotals = new Map<string, { itemName: string | null; qty: number }>();
  const ssrTotals = new Map<string, { itemName: string | null; qty: number }>();

  for (const item of prItems) {
    const qty = Number(item.stockQty ?? item.qty);
    const current = prTotals.get(item.itemCode);
    prTotals.set(item.itemCode, {
      itemName: current?.itemName ?? item.itemName,
      qty: (current?.qty ?? 0) + qty,
    });
  }
  for (const item of ssrItems) {
    const qty = Number(item.qty);
    const current = ssrTotals.get(item.itemCode);
    ssrTotals.set(item.itemCode, {
      itemName: current?.itemName ?? item.itemName,
      qty: (current?.qty ?? 0) + qty,
    });
  }

  const codes = new Set([...prTotals.keys(), ...ssrTotals.keys()]);
  return Array.from(codes)
    .map((itemCode) => {
      const pr = prTotals.get(itemCode);
      const ssr = ssrTotals.get(itemCode);
      return {
        itemCode,
        itemName: pr?.itemName ?? ssr?.itemName ?? null,
        prQty: pr?.qty ?? 0,
        ssrQty: ssr?.qty ?? 0,
      };
    })
    .filter((row) => Math.abs(row.prQty - row.ssrQty) > 0.000001)
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode));
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.grn.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const userCompanyId = context?.user?.companyId;
  if (!userCompanyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  const shouldScopeToUserCompany =
    hasPermission(context, "purchasing.grn.mark_received") &&
    !hasPermission(context, "purchasing.grn.mark_handover") &&
    !hasPermission(context, "purchasing.grn.mark_valued") &&
    !hasPermission(context, "purchasing.grn.match_ssr");
  const companyScope = shouldScopeToUserCompany ? { companyId: userCompanyId } : {};

  const from = parseDateParam(request.nextUrl.searchParams.get("from"));
  const to = parseDateParam(request.nextUrl.searchParams.get("to"), true);
  const dateFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;

  await autoMatchIntercompanyGrn();

  const [purchaseReceipts, stockReturns, intercompanySuppliers] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: {
        ...companyScope,
        ...(dateFilter
          ? {
              OR: [
                { creation: dateFilter },
                { creation: null, postingDate: dateFilter },
              ],
            }
          : {}),
      },
      orderBy: [{ creation: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        items: true,
        handoverBy: { select: { id: true, name: true, email: true } },
        valuedBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
        purchaseInvoices: {
          where: { docstatus: { not: 2 } },
          orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
          take: 5,
          include: { items: true },
        },
        company: {
          select: {
            name: true,
            locations: {
              where: { erpnextCompany: { not: null } },
              select: {
                erpnextCompany: true,
                erpnextInstance: { select: { baseUrl: true } },
              },
            },
          },
        },
      },
    }),
    prisma.grnSupplierStockReturn.findMany({
      where: {
        ...companyScope,
        ...(dateFilter
          ? {
              OR: [
                { returnDate: dateFilter },
                { returnDate: null, creation: dateFilter },
              ],
            }
          : {}),
      },
      orderBy: [{ creation: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        items: true,
        company: {
          select: {
            name: true,
            locations: {
              where: { erpnextCompany: { not: null } },
              select: {
                erpnextCompany: true,
                erpnextInstance: { select: { baseUrl: true } },
              },
            },
          },
        },
      },
    }),
    prisma.grnIntercompanySupplier.findMany({
      orderBy: [{ supplier: "asc" }],
    }),
  ]);

  const intercompanySupplierCodes = new Set(intercompanySuppliers.map((row) => row.supplier));
  const stockReturnByName = new Map(stockReturns.map((row) => [row.name, row]));
  const amendedPurchaseReceiptNames = new Set(purchaseReceipts.map((row) => row.amendedFrom).filter((name): name is string => Boolean(name)));
  const isPurchaseReceiptCancelled = (row: (typeof purchaseReceipts)[number]) => row.docstatus === 2 || amendedPurchaseReceiptNames.has(row.name);
  const activePurchaseReceiptsForMatching = purchaseReceipts.filter((row) => !isPurchaseReceiptCancelled(row));
  const activePurchaseReceiptNames = new Set(activePurchaseReceiptsForMatching.map((row) => row.name));
  const activePurchaseReceiptByName = new Map(activePurchaseReceiptsForMatching.map((row) => [row.name, row]));
  const activeIntercompanyPurchaseReceipts = purchaseReceipts.filter(
    (row) =>
      !isPurchaseReceiptCancelled(row) &&
      !row.supplierStockReturnName &&
      intercompanySupplierCodes.has(row.supplier),
  );

  return NextResponse.json({
    purchaseReceipts: purchaseReceipts.map((row) => {
      const linked = row.supplierStockReturnName
        ? stockReturnByName.get(row.supplierStockReturnName)
        : null;
      const activeLinked = !isPurchaseReceiptCancelled(row) && linked?.docstatus !== 2 ? linked : null;
      const tally = activeLinked
        ? tallyLinkedItems(row.items, activeLinked.items)
        : { status: "not_linked" as const, issueItems: [] };
      const tallyIssues = activeLinked ? buildTallyIssues(row.items, activeLinked.items) : [];
      const purchaseInvoice =
        row.purchaseInvoices.find((invoice) =>
          invoice.items.some((item) => item.purchaseReceipt === row.name),
        ) ?? null;
      const supplierStockReturnPurchaseInvoice = row.supplierStockReturnName
        ? row.purchaseInvoices.find((invoice) =>
            invoice.items.some((item) => item.supplierStockReturn === row.supplierStockReturnName),
          ) ?? null
        : null;
      const serializePurchaseInvoice = (invoice: (typeof row.purchaseInvoices)[number] | null) =>
        invoice
          ? {
              name: invoice.name,
              erpUrl: erpDocUrl(
                erpBaseUrlForPayload(invoice.rawPayload, row.company.locations),
                "purchase-invoice",
                invoice.name,
              ),
              postingDate: iso(invoice.postingDate),
              docstatus: invoice.docstatus,
              status: invoice.status,
              items: invoice.items.map((item) => ({
                name: item.name,
                itemCode: item.itemCode,
                itemName: item.itemName,
                qty: Number(item.qty),
                rate: Number(item.rate),
                amount: Number(item.amount),
                purchaseReceipt: item.purchaseReceipt,
                purchaseReceiptItem: item.purchaseReceiptItem,
                supplierStockReturn: item.supplierStockReturn,
                supplierStockReturnItem: item.supplierStockReturnItem,
                stockUom: item.stockUom,
              })),
            }
          : null;
      return {
        companyId: row.companyId,
        companyName: row.company.name,
        name: row.name,
        erpUrl: erpDocUrl(
          erpBaseUrlForPayload(row.rawPayload, row.company.locations),
          "purchase-receipt",
          row.name,
        ),
        adjustmentNo: row.supplierStockReturnName,
        adjustmentDocstatus: linked?.docstatus ?? null,
        amendedFrom: row.amendedFrom,
        grnDate: iso(row.creation ?? row.postingDate),
        grnBy: row.owner,
        supplier: row.supplier,
        supplierName: row.supplierName,
        handoverAt: iso(row.handoverAt),
        handoverBy: row.handoverBy,
        valuedAt: iso(row.valuedAt),
        valuedBy: row.valuedBy,
        receivedAt: iso(row.receivedAt),
        receivedBy: row.receivedBy,
        canMarkReceived: true,
        status: row.status,
        docstatus: row.docstatus,
        isCancelled: isPurchaseReceiptCancelled(row),
        itemCount: row.items.length,
        items: row.items.map((item) => ({
          name: item.name,
          itemCode: item.itemCode,
          itemName: item.itemName,
          qty: Number(item.qty),
          stockQty: item.stockQty == null ? null : Number(item.stockQty),
          warehouse: item.warehouse,
          stockUom: item.stockUom,
        })),
        tallyStatus: tally.status,
        tallyPercentage: activeLinked ? calculateGrnMatchPercentage(row.items, activeLinked.items) : null,
        tallyIssueItems: tally.issueItems,
        tallyIssues,
        purchaseInvoice: serializePurchaseInvoice(purchaseInvoice),
        supplierStockReturnPurchaseInvoice: serializePurchaseInvoice(supplierStockReturnPurchaseInvoice),
      };
    }),
    supplierStockReturns: stockReturns.map((row) => {
      const linkedPurchaseReceipt = row.purchaseReceiptName
        ? activePurchaseReceiptByName.get(row.purchaseReceiptName) ?? null
        : null;
      const recommendation = linkedPurchaseReceipt
        ? {
            companyId: linkedPurchaseReceipt.companyId,
            name: linkedPurchaseReceipt.name,
            percentage: calculateGrnMatchPercentage(linkedPurchaseReceipt.items, row.items),
          }
        : row.docstatus !== 2 && intercompanySupplierCodes.has(row.supplier)
          ? bestGrnMatchForStockReturn(row, activeIntercompanyPurchaseReceipts)
          : null;
      return {
        companyId: row.companyId,
        companyName: row.company.name,
        name: row.name,
        erpUrl: erpDocUrl(
          erpBaseUrlForPayload(row.rawPayload, row.company.locations),
          "supplier-stock-return",
          row.name,
        ),
        supplier: row.supplier,
        returnDate: iso(row.returnDate),
        docstatus: row.docstatus,
        owner: row.owner,
        creation: iso(row.creation),
        amendedFrom: row.amendedFrom,
        purchaseReceiptName: row.purchaseReceiptName,
        canTally: row.docstatus !== 2 && (!row.purchaseReceiptName || activePurchaseReceiptNames.has(row.purchaseReceiptName)),
        itemCount: row.items.length,
        matchRecommendation: recommendation,
        matchReviewStatus: linkedPurchaseReceipt
          ? "matched"
          : recommendation
            ? recommendation.percentage > 90
              ? "review"
              : "waiting"
            : null,
        items: row.items.map((item) => ({
          name: item.name,
          itemCode: item.itemCode,
          itemName: item.itemName,
          qty: Number(item.qty),
          stockUom: item.stockUom,
        })),
      };
    }),
    intercompanySuppliers: intercompanySuppliers.map((row) => ({
      id: row.id,
      supplier: row.supplier,
      supplierName: row.supplierName,
    })),
  });
}




