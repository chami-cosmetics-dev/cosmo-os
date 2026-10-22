import { NextRequest, NextResponse } from "next/server";

import { resolveViewerFinanceLocationIds } from "@/lib/approval-workflow";
import { autoMatchBackfillIntercompanyGrn, autoMatchIntercompanyGrn, bestGrnMatchForStockReturn, calculateGrnMatchPercentage, isWithinGrnMatchCreationWindow, tallyLinkedItems } from "@/lib/grn";
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

function erpPayloadFromRaw(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const top = rawPayload as Record<string, unknown>;
  return top.data && typeof top.data === "object" && !Array.isArray(top.data)
    ? (top.data as Record<string, unknown>)
    : top;
}

function erpPayloadIndicatesCancelled(rawPayload: unknown) {
  const payload = erpPayloadFromRaw(rawPayload);
  if (!payload) return false;
  const docstatus = Number(payload.docstatus);
  const status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";
  return docstatus === 2 || status === "cancelled" || status === "canceled";
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

function normalizeSupplierMatchValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.grn.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const user = context?.user;
  if (!user?.companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }
  const userCompanyId = user.companyId;
  const canViewHandover =
    hasPermission(context, "purchasing.grn.view_handover") ||
    hasPermission(context, "purchasing.grn.mark_handover");
  const canViewValued =
    hasPermission(context, "purchasing.grn.view_valued") ||
    hasPermission(context, "purchasing.grn.mark_valued");
  const canViewReceived =
    hasPermission(context, "purchasing.grn.view_received") ||
    hasPermission(context, "purchasing.grn.mark_received");
  const roleNames = context?.roleNames ?? [];
  const shouldScopeToUserCompany =
    !canViewReceived &&
    !canViewHandover &&
    !canViewValued &&
    !hasPermission(context, "purchasing.grn.match_ssr");
  const shouldShowOnlyHandoveredForValued =
    canViewValued &&
    !canViewHandover &&
    !hasPermission(context, "purchasing.grn.match_ssr");
  const shouldShowOnlyValuedForReceived =
    canViewReceived &&
    !canViewHandover &&
    !canViewValued &&
    !hasPermission(context, "purchasing.grn.match_ssr");
  const financeLocationIds = shouldScopeToUserCompany
    ? await resolveViewerFinanceLocationIds(user.id, userCompanyId, roleNames)
    : null;
  const companyScope = shouldScopeToUserCompany ? { companyId: userCompanyId } : {};
  const locationScope =
    shouldScopeToUserCompany && financeLocationIds !== null
      ? financeLocationIds.length === 0
        ? { id: "__no_finance_locations__" }
        : { companyLocationId: { in: financeLocationIds } }
      : {};
  const stageVisibilityScope =
    shouldShowOnlyValuedForReceived
      ? { valuedAt: { not: null } }
      : shouldShowOnlyHandoveredForValued
        ? { handoverAt: { not: null } }
        : {};

  const from = parseDateParam(request.nextUrl.searchParams.get("from"));
  const to = parseDateParam(request.nextUrl.searchParams.get("to"), true);
  const dateFilter = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;

  await Promise.all([autoMatchIntercompanyGrn(), autoMatchBackfillIntercompanyGrn()]);

  const [
    purchaseReceipts,
    backfillPurchaseReceipts,
    stockReturns,
    backfillStockReturns,
    backfillPurchaseInvoices,
    livePurchaseInvoices,
    supplierPrefixLocations,
  ] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: {
        ...companyScope,
        ...locationScope,
        ...stageVisibilityScope,
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
      include: {
        items: true,
        supplierStockReturnLinks: { include: { supplierStockReturn: { select: { name: true } } } },
        handoverBy: { select: { id: true, name: true, email: true } },
        handoverRevertedBy: { select: { id: true, name: true, email: true } },
        handoverReceivedBy: { select: { id: true, name: true, email: true } },
        notReceivedBy: { select: { id: true, name: true, email: true } },
        valuedBy: { select: { id: true, name: true, email: true } },
        valuedRevertedBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
        receivedRevertedBy: { select: { id: true, name: true, email: true } },
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
        companyLocation: { select: { name: true, erpnextCompany: true } },
      },
    }),
    prisma.grnBackfillPurchaseReceipt.findMany({
      where: {
        ...companyScope,
        ...locationScope,
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
      include: {
        items: true,
        supplierStockReturnLinks: { include: { supplierStockReturn: { select: { name: true } } } },
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
        companyLocation: { select: { name: true, erpnextCompany: true } },
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
      include: {
        items: true,
        purchaseReceiptLinks: { include: { purchaseReceipt: { select: { name: true } } } },
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
    prisma.grnBackfillSupplierStockReturn.findMany({
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
      include: {
        items: true,
        purchaseReceiptLinks: { include: { purchaseReceipt: { select: { name: true } } } },
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
    prisma.grnBackfillPurchaseInvoice.findMany({
      where: {
        ...companyScope,
        ...(dateFilter ? { postingDate: dateFilter } : {}),
      },
      orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
      include: { items: true },
    }),
    prisma.grnPurchaseInvoice.findMany({
      where: {
        ...companyScope,
        docstatus: { not: 2 },
        OR: [
          { purchaseReceiptName: { not: null } },
          { items: { some: { purchaseReceipt: { not: null } } } },
          { supplierStockReturnName: { not: null } },
          { items: { some: { supplierStockReturn: { not: null } } } },
          { isReturn: 1 },
          { billNo: { startsWith: "SSR-" } },
        ],
      },
      orderBy: [{ postingDate: "desc" }, { createdAt: "desc" }],
      include: { items: true },
    }),
    prisma.companyLocation.findMany({
      where: {
        supplierPrefix: { not: null },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        companyId: true,
        supplierPrefix: true,
      },
    }),
  ]);

  const supplierPrefixRules = supplierPrefixLocations
    .map((row) => ({
      locationId: row.id,
      locationName: row.name,
      companyId: row.companyId,
      supplier: row.supplierPrefix?.trim() ?? "",
      supplierName: row.name,
      key: normalizeSupplierMatchValue(row.supplierPrefix),
    }))
    .filter((row) => row.key.length > 0);
  const supplierPrefixRuleForSupplier = (
    supplier: string | null | undefined,
    supplierName?: string | null,
  ) => {
    const values = [
      normalizeSupplierMatchValue(supplier),
      normalizeSupplierMatchValue(supplierName),
    ].filter(Boolean);
    return supplierPrefixRules.find((rule) => values.some((value) => value.includes(rule.key))) ?? null;
  };
  const allStockReturnsForLookup = [...stockReturns, ...backfillStockReturns];
  const backfillPurchaseReceiptsForMatching = backfillPurchaseReceipts.map((row) => ({
    ...row,
    supplierStockReturnName: null as string | null,
  }));
  const stockReturnByName = new Map(allStockReturnsForLookup.map((row) => [row.name, row]));
  const crossLinkedStockReturnNamesForPurchaseReceipt = (row: { companyId: string; name: string }) =>
    allStockReturnsForLookup
      .filter((stockReturn) => stockReturn.companyId === row.companyId && stockReturn.purchaseReceiptName === row.name)
      .map((stockReturn) => stockReturn.name);
  const crossLinkedPurchaseReceiptNamesForStockReturn = (row: { companyId: string; name: string }) =>
    purchaseReceipts
      .filter((purchaseReceipt) => purchaseReceipt.companyId === row.companyId && purchaseReceipt.supplierStockReturnName === row.name)
      .map((purchaseReceipt) => purchaseReceipt.name);
  const invoiceMatchesLinkedStockReturn = (
    invoice: {
      supplierStockReturnName: string | null;
      billNo: string | null;
      rawPayload: unknown;
      items: Array<{ supplierStockReturn: string | null }>;
    },
    names: Set<string>,
  ) => {
    if (names.size === 0) return false;
    if (invoice.supplierStockReturnName && names.has(invoice.supplierStockReturnName)) return true;
    if (invoice.items.some((item) => item.supplierStockReturn && names.has(item.supplierStockReturn))) return true;
    const payload = erpPayloadFromRaw(invoice.rawPayload);
    const billNo = typeof payload?.bill_no === "string" ? payload.bill_no.trim() : invoice.billNo?.trim() ?? "";
    if (billNo.startsWith("SSR-") && names.has(billNo.slice(4).trim())) return true;
    const payloadItems = Array.isArray(payload?.items) ? payload.items : [];
    return payloadItems.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const supplierStockReturn = (item as Record<string, unknown>).supplier_stock_return;
      return typeof supplierStockReturn === "string" && names.has(supplierStockReturn.trim());
    });
  };
  const invoiceMatchesPurchaseReceipt = (
    invoice: {
      isReturn: number | null;
      purchaseReceiptName: string | null;
      items: Array<{ purchaseReceipt: string | null }>;
    },
    names: Set<string>,
  ) =>
    invoice.isReturn !== 1 &&
    (Boolean(invoice.purchaseReceiptName && names.has(invoice.purchaseReceiptName)) ||
      invoice.items.some((item) => item.purchaseReceipt && names.has(item.purchaseReceipt)));
  const usedPurchaseReceiptNames = new Set(
    allStockReturnsForLookup
      .filter((row) => row.docstatus === 1)
      .flatMap((row) => [
        row.purchaseReceiptName,
        ...row.purchaseReceiptLinks.map((link) => link.purchaseReceipt.name),
      ])
      .filter((name): name is string => Boolean(name)),
  );
  for (const purchaseReceipt of purchaseReceipts) {
    if (purchaseReceipt.supplierStockReturnName) usedPurchaseReceiptNames.add(purchaseReceipt.name);
  }
  const amendedPurchaseReceiptNames = new Set(
    [...purchaseReceipts, ...backfillPurchaseReceipts]
      .map((row) => row.amendedFrom)
      .filter((name): name is string => Boolean(name)),
  );
  const isPurchaseReceiptCancelled = (row: {
    name: string;
    docstatus: number | null;
    status?: string | null;
    rawPayload: unknown;
  }) => {
    const status = row.status?.trim().toLowerCase();
    return (
      row.docstatus === 2 ||
      status === "cancelled" ||
      status === "canceled" ||
    erpPayloadIndicatesCancelled(row.rawPayload) ||
      amendedPurchaseReceiptNames.has(row.name)
    );
  };
  const allPurchaseReceiptsForMatching = [...purchaseReceipts, ...backfillPurchaseReceiptsForMatching];
  const activePurchaseReceiptsForMatching = allPurchaseReceiptsForMatching.filter((row) => !isPurchaseReceiptCancelled(row));
  const activePurchaseReceiptNames = new Set(activePurchaseReceiptsForMatching.map((row) => row.name));
  const activePurchaseReceiptByName = new Map(activePurchaseReceiptsForMatching.map((row) => [row.name, row]));
  const activePurchaseReceiptByCompanyName = new Map(
    activePurchaseReceiptsForMatching.map((row) => [`${row.companyId}:${row.name}`, row]),
  );
  const linkedPurchaseReceiptsForStockReturn = (row: (typeof allStockReturnsForLookup)[number]) => {
    const names = [...new Set([
      row.purchaseReceiptName,
      ...row.purchaseReceiptLinks.map((link) => link.purchaseReceipt.name),
      ...crossLinkedPurchaseReceiptNamesForStockReturn(row),
    ].filter((name): name is string => Boolean(name)))];
    return names.flatMap((name) => {
      const receipt = activePurchaseReceiptByCompanyName.get(`${row.companyId}:${name}`) ?? activePurchaseReceiptByName.get(name);
      return receipt ? [receipt] : [];
    });
  };
  const activeIntercompanyPurchaseReceipts = allPurchaseReceiptsForMatching.filter(
    (row) =>
      supplierPrefixRules.some((rule) => rule.locationId === row.companyLocationId) &&
      !isPurchaseReceiptCancelled(row) &&
      !row.supplierStockReturnName &&
      !usedPurchaseReceiptNames.has(row.name),
  );
  const serializeBackfillPurchaseInvoice = (invoice: (typeof backfillPurchaseInvoices)[number] | null) =>
    invoice
      ? {
          name: invoice.name,
          purchaseReceiptName: invoice.purchaseReceiptName,
          erpUrl: null,
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
  const candidateMatchesByStockReturn = new Map<string, Array<{ companyId: string; name: string; percentage: number }>>();
  const claimCountByPurchaseReceipt = new Map<string, number>();
  for (const stockReturn of allStockReturnsForLookup) {
    if (
      stockReturn.docstatus !== 1 ||
      stockReturn.purchaseReceiptName ||
      stockReturn.purchaseReceiptLinks.length > 0 ||
      crossLinkedPurchaseReceiptNamesForStockReturn(stockReturn).length > 0
    ) continue;
    const supplierPrefixRule = supplierPrefixRuleForSupplier(stockReturn.supplier, stockReturn.supplierName);
    if (!supplierPrefixRule) continue;
    const candidates = activeIntercompanyPurchaseReceipts
      .filter(
        (receipt) =>
          receipt.companyLocationId === supplierPrefixRule.locationId &&
          isWithinGrnMatchCreationWindow(receipt, stockReturn),
      )
      .map((receipt) => ({
        companyId: receipt.companyId,
        name: receipt.name,
        percentage: calculateGrnMatchPercentage(receipt.items, stockReturn.items),
      }))
      .filter((candidate) => candidate.percentage >= 100)
      .sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name));
    if (candidates.length === 0) continue;
    candidateMatchesByStockReturn.set(stockReturn.name, candidates);
    for (const candidate of candidates) {
      const key = `${candidate.companyId}:${candidate.name}`;
      claimCountByPurchaseReceipt.set(key, (claimCountByPurchaseReceipt.get(key) ?? 0) + 1);
    }
  }
  const recommendationForStockReturn = (
    row: (typeof allStockReturnsForLookup)[number],
    linkedPurchaseReceipts: Array<(typeof activePurchaseReceiptsForMatching)[number]>,
  ) => {
    if (linkedPurchaseReceipts.length > 0) {
      const linkedPurchaseReceipt = linkedPurchaseReceipts[0];
      return {
        recommendation: {
          companyId: linkedPurchaseReceipt.companyId,
          name: linkedPurchaseReceipt.name,
          percentage: calculateGrnMatchPercentage(linkedPurchaseReceipts.flatMap((receipt) => receipt.items), row.items),
        },
        conflict: false,
        conflictMatches: [],
      };
    }
    const cleanCandidates = candidateMatchesByStockReturn.get(row.name) ?? [];
    const recommendation =
      cleanCandidates[0] ??
      (() => {
        const supplierPrefixRule = supplierPrefixRuleForSupplier(row.supplier, row.supplierName);
        return row.docstatus !== 2 && supplierPrefixRule
          ? bestGrnMatchForStockReturn(
              row,
              activeIntercompanyPurchaseReceipts.filter(
                (receipt) => receipt.companyLocationId === supplierPrefixRule.locationId,
              ),
            )
          : null;
      })();
    const conflict = cleanCandidates.some(
      (candidate) =>
        cleanCandidates.length > 1 ||
        (claimCountByPurchaseReceipt.get(`${candidate.companyId}:${candidate.name}`) ?? 0) > 1,
    );
    return { recommendation, conflict, conflictMatches: conflict ? cleanCandidates : [] };
  };

  return NextResponse.json({
    purchaseReceipts: [...purchaseReceipts.map((row) => {
      const linkedStockReturnNames = [...new Set([
        row.supplierStockReturnName,
        ...row.supplierStockReturnLinks.map((link) => link.supplierStockReturn.name),
        ...crossLinkedStockReturnNamesForPurchaseReceipt(row),
      ].filter((name): name is string => Boolean(name)))];
      const linkedStockReturns = linkedStockReturnNames
        .map((name) => stockReturnByName.get(name))
        .filter((stockReturn): stockReturn is (typeof allStockReturnsForLookup)[number] => Boolean(stockReturn));
      const linked = linkedStockReturns[0] ?? null;
      const activeLinkedStockReturns = !isPurchaseReceiptCancelled(row)
        ? linkedStockReturns.filter((stockReturn) => stockReturn.docstatus !== 2)
        : [];
      const combinedStockReturnItems = activeLinkedStockReturns.flatMap((stockReturn) => stockReturn.items);
      const combinedPurchaseReceipts = [
        ...new Map(
          activeLinkedStockReturns
            .flatMap((stockReturn) => linkedPurchaseReceiptsForStockReturn(stockReturn))
            .map((receipt) => [`${receipt.companyId}:${receipt.name}`, receipt] as const),
        ).values(),
      ];
      const combinedPurchaseReceiptItems = combinedPurchaseReceipts.flatMap((receipt) => receipt.items);
      const linkedPurchaseReceiptNameSet = new Set(combinedPurchaseReceipts.map((receipt) => receipt.name));
      linkedPurchaseReceiptNameSet.add(row.name);
      const tally = activeLinkedStockReturns.length > 0
        ? tallyLinkedItems(combinedPurchaseReceiptItems, combinedStockReturnItems)
        : { status: "not_linked" as const, issueItems: [] };
      const tallyIssues = activeLinkedStockReturns.length > 0
        ? buildTallyIssues(combinedPurchaseReceiptItems, combinedStockReturnItems)
        : [];
      const purchaseReceiptInvoices = [
        ...row.purchaseInvoices,
        ...livePurchaseInvoices.filter((invoice) =>
          invoice.purchaseReceiptName === row.name ||
          invoice.items.some((item) => item.purchaseReceipt === row.name),
        ),
      ].filter((invoice, index, invoices) =>
        invoices.findIndex((candidate) => candidate.name === invoice.name) === index,
      );
      const linkedStockReturnNameSet = new Set(activeLinkedStockReturns.map((stockReturn) => stockReturn.name));
      const liveSupplierStockReturnPurchaseInvoices = linkedStockReturnNameSet.size > 0
        ? [
            ...row.purchaseInvoices.filter((invoice) =>
              invoiceMatchesLinkedStockReturn(invoice, linkedStockReturnNameSet) &&
              !invoiceMatchesPurchaseReceipt(invoice, linkedPurchaseReceiptNameSet),
            ),
            ...livePurchaseInvoices.filter((invoice) =>
              invoiceMatchesLinkedStockReturn(invoice, linkedStockReturnNameSet) &&
              !invoiceMatchesPurchaseReceipt(invoice, linkedPurchaseReceiptNameSet),
            ),
          ]
        : [];
      const backfillSupplierStockReturnPurchaseInvoices = linkedStockReturnNameSet.size > 0
        ? backfillPurchaseInvoices.filter((invoice) =>
            invoiceMatchesLinkedStockReturn(invoice, linkedStockReturnNameSet) &&
            !invoiceMatchesPurchaseReceipt(invoice, linkedPurchaseReceiptNameSet),
          )
        : [];
      const serializePurchaseInvoice = (invoice: (typeof row.purchaseInvoices)[number] | null) =>
        invoice
          ? {
              name: invoice.name,
              purchaseReceiptName: invoice.purchaseReceiptName,
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
      const supplierStockReturnPurchaseInvoices = [
        ...liveSupplierStockReturnPurchaseInvoices.map((invoice) => serializePurchaseInvoice(invoice)),
        ...backfillSupplierStockReturnPurchaseInvoices.map((invoice) => serializeBackfillPurchaseInvoice(invoice)),
      ].filter((invoice, index, invoices) =>
        invoice && invoices.findIndex((candidate) => candidate?.name === invoice.name) === index,
      );
      const purchaseInvoices = purchaseReceiptInvoices
        .filter((invoice) => invoiceMatchesPurchaseReceipt(invoice, new Set([row.name])))
        .map((invoice) => serializePurchaseInvoice(invoice))
        .filter((invoice): invoice is NonNullable<typeof invoice> => Boolean(invoice));
      return {
        companyId: row.companyId,
        companyLocationId: row.companyLocationId,
        companyName:
          erpCompanyFromPayload(row.rawPayload) ??
          row.companyLocation?.erpnextCompany ??
          row.companyLocation?.name ??
          row.company.name,
        name: row.name,
        erpUrl: erpDocUrl(
          erpBaseUrlForPayload(row.rawPayload, row.company.locations),
          "purchase-receipt",
          row.name,
        ),
        adjustmentNo: linkedStockReturnNames[0] ?? null,
        adjustmentNos: linkedStockReturnNames,
        adjustmentDocstatus: linked?.docstatus ?? null,
        amendedFrom: row.amendedFrom,
        grnDate: iso(row.creation ?? row.postingDate),
        grnBy: row.owner,
        supplier: row.supplier,
        supplierName: row.supplierName,
        handoverAt: iso(row.handoverAt),
        handoverBy: row.handoverBy,
        handoverRevertedAt: iso(row.handoverRevertedAt),
        handoverRevertedBy: row.handoverRevertedBy,
        handoverReceivedAt: iso(row.handoverReceivedAt),
        handoverReceivedBy: row.handoverReceivedBy,
        notReceivedAt: iso(row.notReceivedAt),
        notReceivedBy: row.notReceivedBy,
        valuedAt: iso(row.valuedAt),
        valuedBy: row.valuedBy,
        valuedRevertedAt: iso(row.valuedRevertedAt),
        valuedRevertedBy: row.valuedRevertedBy,
        receivedAt: iso(row.receivedAt),
        receivedBy: row.receivedBy,
        receivedRevertedAt: iso(row.receivedRevertedAt),
        receivedRevertedBy: row.receivedRevertedBy,
        canMarkReceived: true,
        status: row.status,
        docstatus: row.docstatus,
        isCancelled: isPurchaseReceiptCancelled(row),
        isBackfill: false,
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
        tallyPercentage: activeLinkedStockReturns.length > 0
          ? calculateGrnMatchPercentage(combinedPurchaseReceiptItems, combinedStockReturnItems)
          : null,
        tallyIssueItems: tally.issueItems,
        tallyIssues,
        purchaseInvoice: purchaseInvoices[0] ?? null,
        purchaseInvoices,
        supplierStockReturnPurchaseInvoice: supplierStockReturnPurchaseInvoices[0] ?? null,
        supplierStockReturnPurchaseInvoices,
      };
    }), ...backfillPurchaseReceipts.map((row) => {
      const linkedStockReturnNames = [...new Set([
        ...row.supplierStockReturnLinks.map((link) => link.supplierStockReturn.name),
        ...crossLinkedStockReturnNamesForPurchaseReceipt(row),
      ].filter((name): name is string => Boolean(name)))];
      const linkedStockReturns = linkedStockReturnNames
        .map((name) => stockReturnByName.get(name))
        .filter((stockReturn): stockReturn is (typeof allStockReturnsForLookup)[number] => Boolean(stockReturn));
      const linked = linkedStockReturns[0] ?? null;
      const activeLinkedStockReturns = !isPurchaseReceiptCancelled(row)
        ? linkedStockReturns.filter((stockReturn) => stockReturn.docstatus !== 2)
        : [];
      const combinedStockReturnItems = activeLinkedStockReturns.flatMap((stockReturn) => stockReturn.items);
      const combinedPurchaseReceipts = [
        ...new Map(
          activeLinkedStockReturns
            .flatMap((stockReturn) => linkedPurchaseReceiptsForStockReturn(stockReturn))
            .map((receipt) => [`${receipt.companyId}:${receipt.name}`, receipt] as const),
        ).values(),
      ];
      const combinedPurchaseReceiptItems = combinedPurchaseReceipts.flatMap((receipt) => receipt.items);
      const linkedPurchaseReceiptNameSet = new Set(combinedPurchaseReceipts.map((receipt) => receipt.name));
      linkedPurchaseReceiptNameSet.add(row.name);
      const tally = activeLinkedStockReturns.length > 0
        ? tallyLinkedItems(combinedPurchaseReceiptItems, combinedStockReturnItems)
        : { status: "not_linked" as const, issueItems: [] };
      const tallyIssues = activeLinkedStockReturns.length > 0
        ? buildTallyIssues(combinedPurchaseReceiptItems, combinedStockReturnItems)
        : [];
      const linkedStockReturnNameSet = new Set(activeLinkedStockReturns.map((stockReturn) => stockReturn.name));
      const liveSupplierStockReturnPurchaseInvoices = linkedStockReturnNameSet.size > 0
        ? livePurchaseInvoices.filter((invoice) =>
            invoiceMatchesLinkedStockReturn(invoice, linkedStockReturnNameSet) &&
            !invoiceMatchesPurchaseReceipt(invoice, linkedPurchaseReceiptNameSet),
          )
        : [];
      const backfillSupplierStockReturnPurchaseInvoices = linkedStockReturnNameSet.size > 0
        ? backfillPurchaseInvoices.filter((invoice) =>
            invoiceMatchesLinkedStockReturn(invoice, linkedStockReturnNameSet) &&
            !invoiceMatchesPurchaseReceipt(invoice, linkedPurchaseReceiptNameSet),
          )
        : [];
      const serializeLivePurchaseInvoice = (invoice: (typeof livePurchaseInvoices)[number] | null) =>
        invoice
          ? {
              name: invoice.name,
              purchaseReceiptName: invoice.purchaseReceiptName,
              erpUrl: erpDocUrl(
                erpBaseUrlForPayload(invoice.rawPayload, row.company?.locations ?? []),
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
      const supplierStockReturnPurchaseInvoices = [
        ...liveSupplierStockReturnPurchaseInvoices.map((invoice) => serializeLivePurchaseInvoice(invoice)),
        ...backfillSupplierStockReturnPurchaseInvoices.map((invoice) => serializeBackfillPurchaseInvoice(invoice)),
      ].filter((invoice, index, invoices) =>
        invoice && invoices.findIndex((candidate) => candidate?.name === invoice.name) === index,
      );
      const purchaseInvoices = backfillPurchaseInvoices
        .filter((invoice) => invoiceMatchesPurchaseReceipt(invoice, new Set([row.name])))
        .map((invoice) => serializeBackfillPurchaseInvoice(invoice))
        .filter((invoice): invoice is NonNullable<typeof invoice> => Boolean(invoice));
      return {
        companyId: row.companyId,
        companyLocationId: row.companyLocationId,
        companyName: row.company?.name ?? erpCompanyFromPayload(row.rawPayload) ?? "Unknown company",
        name: row.name,
        erpUrl: erpDocUrl(
          erpBaseUrlForPayload(row.rawPayload, row.company?.locations ?? []),
          "purchase-receipt",
          row.name,
        ),
        adjustmentNo: linkedStockReturnNames[0] ?? null,
        adjustmentNos: linkedStockReturnNames,
        adjustmentDocstatus: linked?.docstatus ?? null,
        amendedFrom: row.amendedFrom,
        grnDate: iso(row.creation ?? row.postingDate),
        grnBy: row.owner,
        supplier: row.supplier,
        supplierName: row.supplierName,
        handoverAt: null,
        handoverBy: null,
        handoverRevertedAt: null,
        handoverRevertedBy: null,
        handoverReceivedAt: null,
        handoverReceivedBy: null,
        notReceivedAt: null,
        notReceivedBy: null,
        valuedAt: null,
        valuedBy: null,
        valuedRevertedAt: null,
        valuedRevertedBy: null,
        receivedAt: null,
        receivedBy: null,
        receivedRevertedAt: null,
        receivedRevertedBy: null,
        canMarkReceived: false,
        status: row.status,
        docstatus: row.docstatus,
        isCancelled: isPurchaseReceiptCancelled(row),
        isBackfill: true,
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
        tallyPercentage: activeLinkedStockReturns.length > 0
          ? calculateGrnMatchPercentage(combinedPurchaseReceiptItems, combinedStockReturnItems)
          : null,
        tallyIssueItems: tally.issueItems,
        tallyIssues,
        purchaseInvoice: purchaseInvoices[0] ?? null,
        purchaseInvoices,
        supplierStockReturnPurchaseInvoice: supplierStockReturnPurchaseInvoices[0] ?? null,
        supplierStockReturnPurchaseInvoices,
      };
    })],
    supplierStockReturns: [...stockReturns.map((row) => {
      const linkedPurchaseReceipts = linkedPurchaseReceiptsForStockReturn(row);
      const linkedPurchaseReceipt = linkedPurchaseReceipts[0] ?? null;
      const { recommendation, conflict, conflictMatches } = recommendationForStockReturn(row, linkedPurchaseReceipts);
      return {
        companyId: row.companyId,
        companyName: row.company?.name ?? erpCompanyFromPayload(row.rawPayload) ?? "Unknown company",
        name: row.name,
        erpUrl: erpDocUrl(
          erpBaseUrlForPayload(row.rawPayload, row.company?.locations ?? []),
          "supplier-stock-return",
          row.name,
        ),
        supplier: row.supplier,
        supplierName: row.supplierName,
        returnDate: iso(row.returnDate),
        docstatus: row.docstatus,
        owner: row.owner,
        creation: iso(row.creation),
        amendedFrom: row.amendedFrom,
        purchaseReceiptName: row.purchaseReceiptName,
        purchaseReceiptNames: [...new Set([
          row.purchaseReceiptName,
          ...row.purchaseReceiptLinks.map((link) => link.purchaseReceipt.name),
          ...crossLinkedPurchaseReceiptNamesForStockReturn(row),
        ].filter((name): name is string => Boolean(name)))],
        canTally: row.docstatus !== 2 && (linkedPurchaseReceipts.length > 0 || !row.purchaseReceiptName || activePurchaseReceiptNames.has(row.purchaseReceiptName)),
        isBackfill: false,
        itemCount: row.items.length,
        matchRecommendation: recommendation,
        conflictMatches,
        matchReviewStatus: linkedPurchaseReceipt && recommendation && recommendation.percentage >= 100
          ? "matched"
          : linkedPurchaseReceipt
            ? recommendation && recommendation.percentage > 0
              ? "review"
              : "waiting"
          : recommendation
            ? conflict
              ? "conflict"
              : recommendation.percentage > 90
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
    }), ...backfillStockReturns.map((row) => {
      const linkedPurchaseReceipts = linkedPurchaseReceiptsForStockReturn(row);
      const linkedPurchaseReceipt = linkedPurchaseReceipts[0] ?? null;
      const { recommendation, conflict, conflictMatches } = recommendationForStockReturn(row, linkedPurchaseReceipts);
      return {
        companyId: row.companyId,
        companyName: row.company?.name ?? erpCompanyFromPayload(row.rawPayload) ?? "Unknown company",
        name: row.name,
        erpUrl: erpDocUrl(
          erpBaseUrlForPayload(row.rawPayload, row.company?.locations ?? []),
          "supplier-stock-return",
          row.name,
        ),
        supplier: row.supplier,
        supplierName: row.supplierName,
        returnDate: iso(row.returnDate),
        docstatus: row.docstatus,
        owner: row.owner,
        creation: iso(row.creation),
        amendedFrom: row.amendedFrom,
        purchaseReceiptName: row.purchaseReceiptName,
        purchaseReceiptNames: [...new Set([
          row.purchaseReceiptName,
          ...row.purchaseReceiptLinks.map((link) => link.purchaseReceipt.name),
          ...crossLinkedPurchaseReceiptNamesForStockReturn(row),
        ].filter((name): name is string => Boolean(name)))],
        canTally: row.docstatus !== 2 && (linkedPurchaseReceipts.length > 0 || !row.purchaseReceiptName || activePurchaseReceiptNames.has(row.purchaseReceiptName)),
        isBackfill: true,
        itemCount: row.items.length,
        matchRecommendation: recommendation,
        conflictMatches,
        matchReviewStatus: linkedPurchaseReceipt && recommendation && recommendation.percentage >= 100
          ? "matched"
          : linkedPurchaseReceipt
            ? recommendation && recommendation.percentage > 0
              ? "review"
              : "waiting"
          : recommendation
            ? conflict
              ? "conflict"
              : recommendation.percentage > 90
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
    })],
    intercompanySuppliers: supplierPrefixRules.map((row) => ({
      id: row.locationId,
      supplier: row.supplier,
      supplierName: row.supplierName,
    })),
  });
}

