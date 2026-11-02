/**
 * Revalidates intercompany PR/SSR links against both ends of the company flow,
 * then runs the live and backfill automatic matchers.
 *
 * Usage:
 *   npx tsx scripts/rematch-intercompany-grn.ts
 *   npx tsx scripts/rematch-intercompany-grn.ts --apply
 */
import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";

import { buildGrnCompanyResolver } from "@/lib/grn-company-resolver";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

type PurchaseReceipt = {
  id: string;
  companyId: string;
  companyLocationId: string | null;
  name: string;
  supplier: string;
  supplierName: string | null;
  kind: "live" | "backfill";
  supplierStockReturnName: string | null;
};

type StockReturn = {
  id: string;
  companyId: string;
  name: string;
  supplier: string;
  supplierName: string | null;
  purchaseReceiptName: string | null;
  rawPayload: unknown;
  kind: "live" | "backfill";
};

type LinkPair = {
  purchaseReceipt: PurchaseReceipt;
  stockReturn: StockReturn;
  hasPurchaseReceiptLink: boolean;
  hasStockReturnLink: boolean;
  relationKind: "live" | "backfill" | null;
  purchaseInvoices: Array<{ id: string; kind: "live" | "backfill" }>;
};

type PurchaseInvoiceReference = {
  id: string;
  companyId: string;
  purchaseReceiptName: string;
  supplierStockReturnName: string;
  kind: "live" | "backfill";
};

function rawPayloadCompany(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const top = rawPayload as Record<string, unknown>;
  const payload =
    top.data && typeof top.data === "object" && !Array.isArray(top.data)
      ? (top.data as Record<string, unknown>)
      : top;
  return typeof payload.company === "string" && payload.company.trim()
    ? payload.company.trim()
    : null;
}

function pairKey(purchaseReceipt: PurchaseReceipt, stockReturn: StockReturn) {
  return `${purchaseReceipt.kind}:${purchaseReceipt.id}:${stockReturn.kind}:${stockReturn.id}`;
}

type MatchItem = {
  itemCode: string;
  qty: { toString(): string } | number;
  stockQty?: { toString(): string } | number | null;
};

type MatchPurchaseReceipt = PurchaseReceipt & {
  creation: Date | null;
  postingDate: Date | null;
  items: MatchItem[];
  supplierStockReturnLinks: Array<{ supplierStockReturnId: string }>;
};

type MatchStockReturn = StockReturn & {
  creation: Date | null;
  returnDate: Date | null;
  items: MatchItem[];
  purchaseReceiptLinks: Array<{ purchaseReceiptId: string }>;
};

function matchingPercentage(purchaseReceiptItems: MatchItem[], stockReturnItems: MatchItem[]) {
  const totals = (items: MatchItem[], useStockQty: boolean) => {
    const values = new Map<string, number>();
    for (const item of items) {
      const itemCode = item.itemCode.trim().toUpperCase();
      const quantity = Number(useStockQty ? item.stockQty ?? item.qty : item.qty);
      values.set(itemCode, (values.get(itemCode) ?? 0) + quantity);
    }
    return values;
  };
  const purchaseReceiptTotals = totals(purchaseReceiptItems, true);
  const stockReturnTotals = totals(stockReturnItems, false);
  const itemCodes = new Set([...purchaseReceiptTotals.keys(), ...stockReturnTotals.keys()]);
  let matched = 0;
  let total = 0;
  for (const itemCode of itemCodes) {
    const purchaseReceiptQty = purchaseReceiptTotals.get(itemCode) ?? 0;
    const stockReturnQty = stockReturnTotals.get(itemCode) ?? 0;
    matched += Math.min(purchaseReceiptQty, stockReturnQty);
    total += Math.max(purchaseReceiptQty, stockReturnQty);
  }
  return total > 0 ? Math.round((matched / total) * 10000) / 100 : 0;
}

function isWithinMatchWindow(
  purchaseReceipt: Pick<MatchPurchaseReceipt, "creation"> & { postingDate: Date | null },
  stockReturn: Pick<MatchStockReturn, "creation" | "returnDate">,
) {
  if (purchaseReceipt.postingDate && stockReturn.returnDate) {
    return purchaseReceipt.postingDate.toISOString().slice(0, 10) === stockReturn.returnDate.toISOString().slice(0, 10);
  }
  return Boolean(
    purchaseReceipt.creation &&
      stockReturn.creation &&
      Math.abs(purchaseReceipt.creation.getTime() - stockReturn.creation.getTime()) <= 24 * 60 * 60 * 1000,
  );
}

function isValidPair(
  resolver: ReturnType<typeof buildGrnCompanyResolver> | undefined,
  purchaseReceipt: PurchaseReceipt,
  stockReturn: StockReturn,
) {
  return Boolean(
    resolver &&
      purchaseReceipt.companyId === stockReturn.companyId &&
      resolver.isMatchingIntercompanyPair({
        purchaseReceiptCompanyLocationId: purchaseReceipt.companyLocationId,
        purchaseReceiptSupplier: purchaseReceipt.supplier,
        purchaseReceiptSupplierName: purchaseReceipt.supplierName,
        stockReturnName: stockReturn.name,
        stockReturnCompany: rawPayloadCompany(stockReturn.rawPayload),
        stockReturnSupplier: stockReturn.supplier,
        stockReturnSupplierName: stockReturn.supplierName,
      }),
  );
}

async function attachLiveReturnInvoices(
  tx: Prisma.TransactionClient,
  stockReturn: MatchStockReturn,
  purchaseReceipt: MatchPurchaseReceipt,
) {
  const invoices = await tx.grnPurchaseInvoice.findMany({
    where: {
      companyId: stockReturn.companyId,
      docstatus: { not: 2 },
      OR: [
        { billNo: `SSR-${stockReturn.name}` },
        { supplierStockReturnName: stockReturn.name },
        { items: { some: { supplierStockReturn: stockReturn.name } } },
      ],
    },
    select: { id: true },
  });
  for (const invoice of invoices) {
    await tx.grnPurchaseInvoice.update({
      where: { id: invoice.id },
      data: {
        purchaseReceiptId: purchaseReceipt.id,
        purchaseReceiptName: purchaseReceipt.name,
        supplierStockReturnName: stockReturn.name,
      },
    });
    await tx.grnPurchaseInvoiceItem.updateMany({
      where: { purchaseInvoiceId: invoice.id, supplierStockReturn: null },
      data: { supplierStockReturn: stockReturn.name },
    });
  }
}

async function findSpecialLinks() {
  try {
    return await prisma.grnSpecialLink.findMany({
      select: {
        companyId: true,
        purchaseReceiptName: true,
        purchaseReceiptIsBackfill: true,
        supplierStockReturnName: true,
        supplierStockReturnIsBackfill: true,
      },
    });
  } catch (error) {
    // Vault may not have the optional Special Links feature migrated yet.
    // Normal rematching remains safe: there are no special links to preserve.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return [];
    }
    throw error;
  }
}

async function rematchLive(resolvers: Map<string, ReturnType<typeof buildGrnCompanyResolver>>) {
  const [livePurchaseReceipts, liveStockReturns] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: { docstatus: { not: 2 }, supplierStockReturnName: null },
      select: {
        id: true, companyId: true, companyLocationId: true, name: true, supplier: true, supplierName: true,
        supplierStockReturnName: true, creation: true, postingDate: true,
        items: { select: { itemCode: true, qty: true, stockQty: true } },
        supplierStockReturnLinks: { select: { supplierStockReturnId: true } },
      },
    }),
    prisma.grnSupplierStockReturn.findMany({
      where: { docstatus: { not: 2 }, purchaseReceiptName: null },
      select: {
        id: true, companyId: true, name: true, supplier: true, supplierName: true, purchaseReceiptName: true,
        rawPayload: true, creation: true, returnDate: true,
        items: { select: { itemCode: true, qty: true } },
        purchaseReceiptLinks: { select: { purchaseReceiptId: true } },
      },
      orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const purchaseReceipts = livePurchaseReceipts.map((row) => ({ ...row, kind: "live" as const }));
  const stockReturns = liveStockReturns.map((row) => ({ ...row, kind: "live" as const }));
  const usedPurchaseReceipts = new Set<string>();
  let matched = 0;
  for (const stockReturn of stockReturns as MatchStockReturn[]) {
    if (stockReturn.purchaseReceiptLinks.length > 0) continue;
    const candidates = (purchaseReceipts as MatchPurchaseReceipt[])
      .filter(
        (purchaseReceipt) =>
          !usedPurchaseReceipts.has(`${purchaseReceipt.companyId}:${purchaseReceipt.name}`) &&
          purchaseReceipt.supplierStockReturnLinks.length === 0 &&
          isValidPair(resolvers.get(stockReturn.companyId), purchaseReceipt, stockReturn) &&
          isWithinMatchWindow(purchaseReceipt, stockReturn),
      )
      .map((purchaseReceipt) => ({
        purchaseReceipt,
        percentage: matchingPercentage(purchaseReceipt.items, stockReturn.items),
      }))
      .sort(
        (first, second) =>
          second.percentage - first.percentage || first.purchaseReceipt.name.localeCompare(second.purchaseReceipt.name),
      );
    const best = candidates[0];
    if (!best || best.percentage !== 100) continue;
    await prisma.$transaction(async (tx) => {
      await tx.grnPurchaseReceipt.update({
        where: { id: best.purchaseReceipt.id },
        data: { supplierStockReturnName: stockReturn.name },
      });
      await tx.grnSupplierStockReturn.update({
        where: { id: stockReturn.id },
        data: { purchaseReceiptName: best.purchaseReceipt.name },
      });
      await attachLiveReturnInvoices(tx, stockReturn, best.purchaseReceipt);
    });
    usedPurchaseReceipts.add(`${best.purchaseReceipt.companyId}:${best.purchaseReceipt.name}`);
    matched += 1;
  }
  return { matched };
}

async function rematchBackfill(resolvers: Map<string, ReturnType<typeof buildGrnCompanyResolver>>) {
  const [
    livePurchaseReceipts,
    backfillPurchaseReceipts,
    stockReturns,
    usedLiveStockReturns,
    usedBackfillStockReturns,
  ] = await Promise.all([
    prisma.grnPurchaseReceipt.findMany({
      where: { docstatus: { not: 2 }, supplierStockReturnName: null },
      select: {
        id: true, companyId: true, companyLocationId: true, name: true, supplier: true, supplierName: true,
        supplierStockReturnName: true, creation: true, postingDate: true,
        items: { select: { itemCode: true, qty: true, stockQty: true } },
        supplierStockReturnLinks: { select: { supplierStockReturnId: true } },
      },
    }),
    prisma.grnBackfillPurchaseReceipt.findMany({
      where: { docstatus: { not: 2 } },
      select: {
        id: true, companyId: true, companyLocationId: true, name: true, supplier: true, supplierName: true,
        creation: true, postingDate: true,
        items: { select: { itemCode: true, qty: true, stockQty: true } },
        supplierStockReturnLinks: { select: { supplierStockReturnId: true } },
      },
    }),
    prisma.grnBackfillSupplierStockReturn.findMany({
      where: { docstatus: { not: 2 }, purchaseReceiptName: null },
      select: {
        id: true, companyId: true, name: true, supplier: true, supplierName: true, purchaseReceiptName: true,
        rawPayload: true, creation: true, returnDate: true,
        items: { select: { itemCode: true, qty: true } },
        purchaseReceiptLinks: { select: { purchaseReceiptId: true } },
      },
      orderBy: [{ creation: "asc" }, { createdAt: "asc" }],
    }),
    prisma.grnSupplierStockReturn.findMany({
      where: { docstatus: { not: 2 }, purchaseReceiptName: { not: null } },
      select: { companyId: true, purchaseReceiptName: true },
    }),
    prisma.grnBackfillSupplierStockReturn.findMany({
      where: { docstatus: { not: 2 }, purchaseReceiptName: { not: null } },
      select: { companyId: true, purchaseReceiptName: true },
    }),
  ]);
  const claimedReceiptNames = new Set(
    [...usedLiveStockReturns, ...usedBackfillStockReturns].map(
      (stockReturn) => `${stockReturn.companyId}:${stockReturn.purchaseReceiptName}`,
    ),
  );
  const backfillStockReturns = stockReturns.map((row) => ({ ...row, kind: "backfill" as const }));
  const purchaseReceipts: Array<MatchPurchaseReceipt & { isBackfill: boolean }> = [
    ...livePurchaseReceipts.map((row) => ({ ...row, kind: "live" as const, isBackfill: false })),
    ...backfillPurchaseReceipts.map((row) => ({
      ...row,
      kind: "backfill" as const,
      supplierStockReturnName: null,
      isBackfill: true,
    })),
  ];
  const candidatesByStockReturn = new Map<
    string,
    Array<{ purchaseReceipt: MatchPurchaseReceipt & { isBackfill: boolean }; percentage: number }>
  >();
  const claimCountByPurchaseReceipt = new Map<string, number>();
  for (const stockReturn of backfillStockReturns as MatchStockReturn[]) {
    if (stockReturn.purchaseReceiptLinks.length > 0) continue;
    const candidates = purchaseReceipts
      .filter(
        (purchaseReceipt) =>
          purchaseReceipt.supplierStockReturnLinks.length === 0 &&
          !claimedReceiptNames.has(`${purchaseReceipt.companyId}:${purchaseReceipt.name}`) &&
          isValidPair(resolvers.get(stockReturn.companyId), purchaseReceipt, stockReturn) &&
          isWithinMatchWindow(purchaseReceipt, stockReturn),
      )
      .map((purchaseReceipt) => ({
        purchaseReceipt,
        percentage: matchingPercentage(purchaseReceipt.items, stockReturn.items),
      }))
      .filter((candidate) => candidate.percentage === 100)
      .sort((first, second) => first.purchaseReceipt.name.localeCompare(second.purchaseReceipt.name));
    const key = `${stockReturn.companyId}:${stockReturn.name}`;
    candidatesByStockReturn.set(key, candidates);
    for (const candidate of candidates) {
      const receiptKey = `${candidate.purchaseReceipt.companyId}:${candidate.purchaseReceipt.name}`;
      claimCountByPurchaseReceipt.set(receiptKey, (claimCountByPurchaseReceipt.get(receiptKey) ?? 0) + 1);
    }
  }
  let matched = 0;
  for (const stockReturn of backfillStockReturns as MatchStockReturn[]) {
    const candidates = candidatesByStockReturn.get(`${stockReturn.companyId}:${stockReturn.name}`) ?? [];
    if (candidates.length !== 1) continue;
    const candidate = candidates[0].purchaseReceipt;
    if ((claimCountByPurchaseReceipt.get(`${candidate.companyId}:${candidate.name}`) ?? 0) !== 1) continue;
    await prisma.$transaction(async (tx) => {
      if (!candidate.isBackfill) {
        await tx.grnPurchaseReceipt.update({
          where: { id: candidate.id },
          data: { supplierStockReturnName: stockReturn.name },
        });
        await attachLiveReturnInvoices(tx, stockReturn, candidate);
      }
      await tx.grnBackfillSupplierStockReturn.update({
        where: { id: stockReturn.id },
        data: { purchaseReceiptName: candidate.name },
      });
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
        data: { purchaseReceiptName: candidate.name, supplierStockReturnName: stockReturn.name },
      });
    });
    claimedReceiptNames.add(`${candidate.companyId}:${candidate.name}`);
    matched += 1;
  }
  return { matched };
}

async function main() {
  const [
    locations,
    livePurchaseReceipts,
    backfillPurchaseReceipts,
    liveStockReturns,
    backfillStockReturns,
    liveRelations,
    backfillRelations,
    specialLinks,
    livePurchaseInvoices,
    backfillPurchaseInvoices,
  ] = await Promise.all([
    prisma.companyLocation.findMany({
      select: {
        id: true,
        companyId: true,
        name: true,
        shortName: true,
        erpnextCompany: true,
        supplierPrefix: true,
        isMainCompany: true,
      },
    }),
    prisma.grnPurchaseReceipt.findMany({
      select: {
        id: true,
        companyId: true,
        companyLocationId: true,
        name: true,
        supplier: true,
        supplierName: true,
        supplierStockReturnName: true,
      },
    }),
    prisma.grnBackfillPurchaseReceipt.findMany({
      select: {
        id: true,
        companyId: true,
        companyLocationId: true,
        name: true,
        supplier: true,
        supplierName: true,
      },
    }),
    prisma.grnSupplierStockReturn.findMany({
      select: {
        id: true,
        companyId: true,
        name: true,
        supplier: true,
        supplierName: true,
        purchaseReceiptName: true,
        rawPayload: true,
      },
    }),
    prisma.grnBackfillSupplierStockReturn.findMany({
      select: {
        id: true,
        companyId: true,
        name: true,
        supplier: true,
        supplierName: true,
        purchaseReceiptName: true,
        rawPayload: true,
      },
    }),
    prisma.grnSupplierStockReturnPurchaseReceipt.findMany({
      select: { purchaseReceiptId: true, supplierStockReturnId: true },
    }),
    prisma.grnBackfillSupplierStockReturnPurchaseReceipt.findMany({
      select: { purchaseReceiptId: true, supplierStockReturnId: true },
    }),
    findSpecialLinks(),
    prisma.grnPurchaseInvoice.findMany({
      where: {
        docstatus: { not: 2 },
        purchaseReceiptName: { not: null },
        supplierStockReturnName: { not: null },
      },
      select: {
        id: true,
        companyId: true,
        purchaseReceiptName: true,
        supplierStockReturnName: true,
      },
    }),
    prisma.grnBackfillPurchaseInvoice.findMany({
      where: {
        docstatus: { not: 2 },
        purchaseReceiptName: { not: null },
        supplierStockReturnName: { not: null },
      },
      select: {
        id: true,
        companyId: true,
        purchaseReceiptName: true,
        supplierStockReturnName: true,
      },
    }),
  ]);

  const purchaseReceipts: PurchaseReceipt[] = [
    ...livePurchaseReceipts.map((row) => ({ ...row, kind: "live" as const })),
    ...backfillPurchaseReceipts.map((row) => ({
      ...row,
      kind: "backfill" as const,
      supplierStockReturnName: null,
    })),
  ];
  const stockReturns: StockReturn[] = [
    ...liveStockReturns.map((row) => ({ ...row, kind: "live" as const })),
    ...backfillStockReturns.map((row) => ({ ...row, kind: "backfill" as const })),
  ];
  const purchaseReceiptByCompanyName = new Map(
    purchaseReceipts.map((row) => [`${row.companyId}:${row.name}`, row]),
  );
  const stockReturnByCompanyName = new Map(
    stockReturns.map((row) => [`${row.companyId}:${row.name}`, row]),
  );
  const purchaseReceiptByKindId = new Map(
    purchaseReceipts.map((row) => [`${row.kind}:${row.id}`, row]),
  );
  const stockReturnByKindId = new Map(
    stockReturns.map((row) => [`${row.kind}:${row.id}`, row]),
  );
  const locationsByCompany = new Map<string, typeof locations>();
  for (const location of locations) {
    const companyLocations = locationsByCompany.get(location.companyId) ?? [];
    companyLocations.push(location);
    locationsByCompany.set(location.companyId, companyLocations);
  }
  const resolverByCompany = new Map(
    [...locationsByCompany].map(([companyId, companyLocations]) => [
      companyId,
      buildGrnCompanyResolver(companyLocations),
    ]),
  );

  const pairs = new Map<string, LinkPair>();
  const addPair = (
    purchaseReceipt: PurchaseReceipt | undefined,
    stockReturn: StockReturn | undefined,
    source:
      | "purchaseReceipt"
      | "stockReturn"
      | "liveRelation"
      | "backfillRelation"
      | "purchaseInvoice",
    purchaseInvoice?: PurchaseInvoiceReference,
  ) => {
    if (!purchaseReceipt || !stockReturn) return;
    const key = pairKey(purchaseReceipt, stockReturn);
    const pair = pairs.get(key) ?? {
      purchaseReceipt,
      stockReturn,
      hasPurchaseReceiptLink: false,
      hasStockReturnLink: false,
      relationKind: null,
      purchaseInvoices: [],
    };
    if (source === "purchaseReceipt") pair.hasPurchaseReceiptLink = true;
    if (source === "stockReturn") pair.hasStockReturnLink = true;
    if (source === "liveRelation") pair.relationKind = "live";
    if (source === "backfillRelation") pair.relationKind = "backfill";
    if (
      purchaseInvoice &&
      !pair.purchaseInvoices.some(
        (invoice) => invoice.id === purchaseInvoice.id && invoice.kind === purchaseInvoice.kind,
      )
    ) {
      pair.purchaseInvoices.push({ id: purchaseInvoice.id, kind: purchaseInvoice.kind });
    }
    pairs.set(key, pair);
  };

  for (const receipt of purchaseReceipts) {
    if (!receipt.supplierStockReturnName) continue;
    addPair(
      receipt,
      stockReturnByCompanyName.get(`${receipt.companyId}:${receipt.supplierStockReturnName}`),
      "purchaseReceipt",
    );
  }
  for (const stockReturn of stockReturns) {
    if (!stockReturn.purchaseReceiptName) continue;
    addPair(
      purchaseReceiptByCompanyName.get(`${stockReturn.companyId}:${stockReturn.purchaseReceiptName}`),
      stockReturn,
      "stockReturn",
    );
  }
  for (const relation of liveRelations) {
    addPair(
      purchaseReceiptByKindId.get(`live:${relation.purchaseReceiptId}`),
      stockReturnByKindId.get(`live:${relation.supplierStockReturnId}`),
      "liveRelation",
    );
  }
  for (const relation of backfillRelations) {
    addPair(
      purchaseReceiptByKindId.get(`backfill:${relation.purchaseReceiptId}`),
      stockReturnByKindId.get(`backfill:${relation.supplierStockReturnId}`),
      "backfillRelation",
    );
  }
  const purchaseInvoices: PurchaseInvoiceReference[] = [
    ...livePurchaseInvoices.map((row) => ({
      ...row,
      purchaseReceiptName: row.purchaseReceiptName!,
      supplierStockReturnName: row.supplierStockReturnName!,
      kind: "live" as const,
    })),
    ...backfillPurchaseInvoices.map((row) => ({
      ...row,
      purchaseReceiptName: row.purchaseReceiptName!,
      supplierStockReturnName: row.supplierStockReturnName!,
      kind: "backfill" as const,
    })),
  ];
  for (const invoice of purchaseInvoices) {
    addPair(
      purchaseReceiptByCompanyName.get(`${invoice.companyId}:${invoice.purchaseReceiptName}`),
      stockReturnByCompanyName.get(`${invoice.companyId}:${invoice.supplierStockReturnName}`),
      "purchaseInvoice",
      invoice,
    );
  }

  const specialLinkPairs = new Set(
    specialLinks.map((link) => `${link.companyId}:${link.purchaseReceiptName}:${link.purchaseReceiptIsBackfill}:${link.supplierStockReturnName}:${link.supplierStockReturnIsBackfill}`),
  );
  const invalidPairs = [...pairs.values()].filter((pair) => {
    if (specialLinkPairs.has(`${pair.purchaseReceipt.companyId}:${pair.purchaseReceipt.name}:${pair.purchaseReceipt.kind === "backfill"}:${pair.stockReturn.name}:${pair.stockReturn.kind === "backfill"}`)) return false;
    const resolver = resolverByCompany.get(pair.purchaseReceipt.companyId);
    return !(
      resolver &&
      pair.purchaseReceipt.companyId === pair.stockReturn.companyId &&
      resolver.isMatchingIntercompanyPair({
        purchaseReceiptCompanyLocationId: pair.purchaseReceipt.companyLocationId,
        purchaseReceiptSupplier: pair.purchaseReceipt.supplier,
        purchaseReceiptSupplierName: pair.purchaseReceipt.supplierName,
        stockReturnName: pair.stockReturn.name,
        stockReturnCompany: rawPayloadCompany(pair.stockReturn.rawPayload),
        stockReturnSupplier: pair.stockReturn.supplier,
        stockReturnSupplierName: pair.stockReturn.supplierName,
      })
    );
  });

  const summary = {
    mode: apply ? "apply" : "dry-run",
    linksChecked: pairs.size,
    invalidLinks: invalidPairs.length,
    invalid: invalidPairs.map((pair) => ({
      purchaseReceipt: `${pair.purchaseReceipt.kind}:${pair.purchaseReceipt.name}`,
      purchaseReceiptSupplier: pair.purchaseReceipt.supplier,
      stockReturn: `${pair.stockReturn.kind}:${pair.stockReturn.name}`,
      stockReturnCompany: rawPayloadCompany(pair.stockReturn.rawPayload),
      stockReturnSupplier: pair.stockReturn.supplier,
      sources: {
        purchaseReceiptField: pair.hasPurchaseReceiptLink,
        stockReturnField: pair.hasStockReturnLink,
        relation: pair.relationKind,
        purchaseInvoices: pair.purchaseInvoices.map((invoice) => `${invoice.kind}:${invoice.id}`),
      },
    })),
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const pair of invalidPairs) {
      if (pair.purchaseReceipt.kind === "live" && pair.hasPurchaseReceiptLink) {
        await tx.grnPurchaseReceipt.updateMany({
          where: {
            id: pair.purchaseReceipt.id,
            supplierStockReturnName: pair.stockReturn.name,
          },
          data: { supplierStockReturnName: null },
        });
      }
      if (pair.stockReturn.kind === "live" && pair.hasStockReturnLink) {
        await tx.grnSupplierStockReturn.updateMany({
          where: {
            id: pair.stockReturn.id,
            purchaseReceiptName: pair.purchaseReceipt.name,
          },
          data: { purchaseReceiptName: null },
        });
      }
      if (pair.purchaseReceipt.kind === "live" && pair.stockReturn.kind === "live") {
        await tx.grnPurchaseInvoice.updateMany({
          where: {
            purchaseReceiptName: pair.purchaseReceipt.name,
            supplierStockReturnName: pair.stockReturn.name,
          },
          data: {
            purchaseReceiptId: null,
            purchaseReceiptName: null,
          },
        });
      }
      if (pair.stockReturn.kind === "backfill" && pair.hasStockReturnLink) {
        await tx.grnBackfillSupplierStockReturn.updateMany({
          where: {
            id: pair.stockReturn.id,
            purchaseReceiptName: pair.purchaseReceipt.name,
          },
          data: { purchaseReceiptName: null },
        });
      }
      if (pair.relationKind === "live") {
        await tx.grnSupplierStockReturnPurchaseReceipt.deleteMany({
          where: {
            supplierStockReturnId: pair.stockReturn.id,
            purchaseReceiptId: pair.purchaseReceipt.id,
          },
        });
      }
      if (pair.relationKind === "backfill") {
        await tx.grnBackfillSupplierStockReturnPurchaseReceipt.deleteMany({
          where: {
            supplierStockReturnId: pair.stockReturn.id,
            purchaseReceiptId: pair.purchaseReceipt.id,
          },
        });
      }
      for (const invoice of pair.purchaseInvoices) {
        if (invoice.kind === "live") {
          await tx.grnPurchaseInvoice.updateMany({
            where: {
              id: invoice.id,
              purchaseReceiptName: pair.purchaseReceipt.name,
              supplierStockReturnName: pair.stockReturn.name,
            },
            data: { purchaseReceiptId: null, purchaseReceiptName: null },
          });
        } else {
          await tx.grnBackfillPurchaseInvoice.updateMany({
            where: {
              id: invoice.id,
              purchaseReceiptName: pair.purchaseReceipt.name,
              supplierStockReturnName: pair.stockReturn.name,
            },
            data: { purchaseReceiptName: null },
          });
        }
      }
    }
  }, { maxWait: 10_000, timeout: 120_000 });

  const liveResult = await rematchLive(resolverByCompany);
  const backfillResult = await rematchBackfill(resolverByCompany);
  console.log(
    JSON.stringify(
      {
        ...summary,
        liveMatchesCreated: liveResult.matched,
        backfillMatchesCreated: backfillResult.matched,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
