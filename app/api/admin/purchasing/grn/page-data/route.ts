import { NextRequest, NextResponse } from "next/server";

import { tallyLinkedItems } from "@/lib/grn";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

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
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const from = parseDateParam(request.nextUrl.searchParams.get("from"));
  const to = parseDateParam(request.nextUrl.searchParams.get("to"), true);
  const dateFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;

  const [purchaseReceipts, stockReturns] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: {
        companyId,
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
        company: {
          select: {
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
        companyId,
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
  ]);

  const stockReturnByName = new Map(stockReturns.map((row) => [row.name, row]));
  const activePurchaseReceiptNames = new Set(
    purchaseReceipts.filter((row) => row.docstatus !== 2).map((row) => row.name),
  );

  return NextResponse.json({
    purchaseReceipts: purchaseReceipts.map((row) => {
      const linked = row.supplierStockReturnName
        ? stockReturnByName.get(row.supplierStockReturnName)
        : null;
      const activeLinked = row.docstatus !== 2 && linked?.docstatus !== 2 ? linked : null;
      const tally = activeLinked
        ? tallyLinkedItems(row.items, activeLinked.items)
        : { status: "not_linked" as const, issueItems: [] };
      const tallyIssues = activeLinked ? buildTallyIssues(row.items, activeLinked.items) : [];
      return {
        name: row.name,
        erpUrl: erpDocUrl(
          erpBaseUrlForPayload(row.rawPayload, row.company.locations),
          "purchase-receipt",
          row.name,
        ),
        adjustmentNo: row.supplierStockReturnName,
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
        status: row.status,
        docstatus: row.docstatus,
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
        tallyIssueItems: tally.issueItems,
        tallyIssues,
      };
    }),
    supplierStockReturns: stockReturns.map((row) => ({
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
      items: row.items.map((item) => ({
        name: item.name,
        itemCode: item.itemCode,
        itemName: item.itemName,
        qty: Number(item.qty),
        stockUom: item.stockUom,
      })),
    })),
  });
}



