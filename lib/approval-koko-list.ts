import { APPROVAL_SPLIT_KOKO } from "@/lib/approval-payment-split";
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
