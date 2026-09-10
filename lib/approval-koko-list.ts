import { Prisma } from "@prisma/client";

import { APPROVAL_SPLIT_KOKO } from "@/lib/approval-payment-split";
import {
  ORDER_PAYMENT_APPROVAL,
  PAYMENT_METHOD_CHANGE_APPROVAL,
} from "@/lib/approval-workflow";
import { prisma } from "@/lib/prisma";

export type ApprovalKokoListFields = {
  multipleKokoPayments: boolean;
  kokoReferences: Array<{ reference: string; amount: string }>;
  kokoPaymentAmount: string | null;
};

export async function loadKokoFieldsForApprovals(
  approvalIds: string[],
): Promise<Map<string, ApprovalKokoListFields>> {
  const result = new Map<string, ApprovalKokoListFields>();
  if (approvalIds.length === 0) return result;

  const [approvals, kokoRefs, kokoLines] = await Promise.all([
    prisma.approvalRequest.findMany({
      where: { id: { in: approvalIds } },
      select: { id: true, multipleKokoPayments: true, kokoReference: true },
    }),
    prisma.approvalKokoReference.findMany({
      where: { approvalRequestId: { in: approvalIds } },
      orderBy: [{ approvalRequestId: "asc" }, { sortOrder: "asc" }],
      select: {
        approvalRequestId: true,
        reference: true,
        amount: true,
      },
    }),
    prisma.approvalPaymentLine.findMany({
      where: {
        approvalRequestId: { in: approvalIds },
        paymentMethod: APPROVAL_SPLIT_KOKO,
      },
      select: { approvalRequestId: true, amount: true },
    }),
  ]);

  const refsByApproval = new Map<string, Array<{ reference: string; amount: string }>>();
  for (const row of kokoRefs) {
    const list = refsByApproval.get(row.approvalRequestId) ?? [];
    list.push({
      reference: row.reference,
      amount: row.amount.toString(),
    });
    refsByApproval.set(row.approvalRequestId, list);
  }

  const kokoAmountByApproval = new Map<string, string>();
  for (const line of kokoLines) {
    kokoAmountByApproval.set(line.approvalRequestId, line.amount.toString());
  }

  for (const approval of approvals) {
    const refs = refsByApproval.get(approval.id) ?? [];
    const legacyRefs =
      refs.length === 0 && approval.kokoReference
        ? [{ reference: approval.kokoReference, amount: "" }]
        : refs;

    result.set(approval.id, {
      multipleKokoPayments: approval.multipleKokoPayments,
      kokoReferences: legacyRefs,
      kokoPaymentAmount: kokoAmountByApproval.get(approval.id) ?? null,
    });
  }

  return result;
}

export function mergeKokoFieldsIntoApproval<T extends { id: string }>(
  row: T,
  kokoByApproval: Map<string, ApprovalKokoListFields>,
): T & ApprovalKokoListFields {
  const koko = kokoByApproval.get(row.id) ?? {
    multipleKokoPayments: false,
    kokoReferences: [],
    kokoPaymentAmount: null,
  };
  return { ...row, ...koko };
}

/** Approved finance KOKO refs per order for invoice dumps (Dump 2 / 3). */
export async function loadKokoRefNumbersForOrders(
  companyId: string,
  orderIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (orderIds.length === 0) return result;

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      companyId,
      orderId: { in: orderIds },
      status: "approved",
      type: { in: [ORDER_PAYMENT_APPROVAL, PAYMENT_METHOD_CHANGE_APPROVAL] },
    },
    orderBy: [{ reviewedAt: "desc" }, { updatedAt: "desc" }],
    select: { id: true, orderId: true },
  });

  const kokoByApproval = await loadKokoFieldsForApprovals(approvals.map((approval) => approval.id));

  for (const approval of approvals) {
    if (!approval.orderId || result.has(approval.orderId)) continue;
    const refs = (kokoByApproval.get(approval.id)?.kokoReferences ?? [])
      .map((row) => row.reference.trim())
      .filter(Boolean);
    if (refs.length > 0) {
      result.set(approval.orderId, refs.join(","));
    }
  }

  return result;
}

export type OrderKokoRefDetail = {
  kokoRefNumber: string;
  kokoReferences: Array<{ reference: string; amount: string }>;
};

const EMPTY_ORDER_KOKO_REF: OrderKokoRefDetail = {
  kokoRefNumber: "",
  kokoReferences: [],
};

function pickOrderKokoRefFromApprovals(
  approvals: Array<{ id: string; orderId: string | null }>,
  kokoByApproval: Map<string, ApprovalKokoListFields>,
): OrderKokoRefDetail {
  for (const approval of approvals) {
    const refs = (kokoByApproval.get(approval.id)?.kokoReferences ?? [])
      .map((row) => ({
        reference: row.reference.trim(),
        amount: row.amount,
      }))
      .filter((row) => row.reference);
    if (refs.length > 0) {
      return {
        kokoReferences: refs,
        kokoRefNumber: refs.map((row) => row.reference).join(","),
      };
    }
  }
  return EMPTY_ORDER_KOKO_REF;
}

/** Approved finance KOKO refs for one order (detail page). */
export async function loadOrderKokoRefDetail(
  companyId: string,
  orderId: string,
): Promise<OrderKokoRefDetail> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      companyId,
      orderId,
      status: "approved",
      type: { in: [ORDER_PAYMENT_APPROVAL, PAYMENT_METHOD_CHANGE_APPROVAL] },
    },
    orderBy: [{ reviewedAt: "desc" }, { updatedAt: "desc" }],
    select: { id: true, orderId: true },
  });
  if (approvals.length === 0) return EMPTY_ORDER_KOKO_REF;
  const kokoByApproval = await loadKokoFieldsForApprovals(approvals.map((approval) => approval.id));
  return pickOrderKokoRefFromApprovals(approvals, kokoByApproval);
}

/** Order ids whose finance KOKO reference matches search text. */
export async function findOrderIdsByKokoReferenceSearch(
  companyId: string,
  searchTerm: string,
): Promise<string[]> {
  const trimmed = searchTerm.trim();
  if (!trimmed) return [];
  const pattern = `%${trimmed}%`;
  const rows = await prisma.$queryRaw<Array<{ orderId: string }>>(Prisma.sql`
    SELECT DISTINCT ar."orderId" AS "orderId"
    FROM "ApprovalRequest" ar
    LEFT JOIN "ApprovalKokoReference" akr ON akr."approvalRequestId" = ar."id"
    WHERE ar."companyId" = ${companyId}
      AND ar."orderId" IS NOT NULL
      AND (
        ar."kokoReference" ILIKE ${pattern}
        OR akr."reference" ILIKE ${pattern}
      )
  `);
  return rows.map((row) => row.orderId).filter(Boolean);
}
