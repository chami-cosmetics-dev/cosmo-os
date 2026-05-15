import { prisma } from "@/lib/prisma";

export type ExchangeReason = "damaged_item" | "wrong_item" | "other";
export type ExchangeStatus = "pending" | "solved";

export type ExchangeTrackingItem = {
  id: string;
  originalReference: string;
  replacementReference: string;
  originalOrderId: string | null;
  replacementOrderId: string | null;
  merchant: { id: string; name: string | null; email: string | null } | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  reason: ExchangeReason;
  status: ExchangeStatus;
  remark: string | null;
  actionDate: string | null;
  requiresOldItemCollection: boolean;
  oldItemCollectionStatus: "pending" | "collected" | "not_collected" | null;
  oldItemCollectionRemark: string | null;
  exchangePaymentDifference: string | null;
  createdAt: string;
};

export type ExchangesTrackingData = {
  exchanges: ExchangeTrackingItem[];
  counts: { all: number; pending: number; solved: number };
};

function isMissingOrderExchangeTableError(error: unknown) {
  const meta = error && typeof error === "object" && "meta" in error
    ? (error as { meta?: { modelName?: unknown; table?: unknown } }).meta
    : null;
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2021" &&
      (meta?.modelName === "OrderExchange" || String(meta?.table ?? "").includes("OrderExchange"))
  );
}

export async function fetchExchangesTrackingData(input: {
  companyId: string;
  viewerUserId: string;
  canManage: boolean;
}): Promise<ExchangesTrackingData> {
  try {
    const rows = await prisma.orderExchange.findMany({
      where: {
        companyId: input.companyId,
        ...(input.canManage ? {} : { merchantUserId: input.viewerUserId }),
      },
      orderBy: [{ createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        originalReference: true,
        replacementReference: true,
        originalOrderId: true,
        replacementOrderId: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        reason: true,
        status: true,
        remark: true,
        actionDate: true,
        createdAt: true,
        merchantUser: { select: { id: true, name: true, email: true } },
        riderDeliveryTasks: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            requiresOldItemCollection: true,
            oldItemCollectionStatus: true,
            oldItemCollectionRemark: true,
            exchangePaymentDifference: true,
          },
        },
      },
    });

    const exchanges = rows.map((item) => {
      const latestTask = item.riderDeliveryTasks[0] ?? null;
      return {
        id: item.id,
        originalReference: item.originalReference,
        replacementReference: item.replacementReference,
        originalOrderId: item.originalOrderId,
        replacementOrderId: item.replacementOrderId,
        merchant: item.merchantUser,
        customerName: item.customerName,
        customerEmail: item.customerEmail,
        customerPhone: item.customerPhone,
        reason: item.reason,
        status: item.status,
        remark: item.remark,
        actionDate: item.actionDate?.toISOString() ?? null,
        requiresOldItemCollection:
          latestTask?.requiresOldItemCollection ??
          (item.reason === "damaged_item" || item.reason === "wrong_item"),
        oldItemCollectionStatus: latestTask?.oldItemCollectionStatus ?? null,
        oldItemCollectionRemark: latestTask?.oldItemCollectionRemark ?? null,
        exchangePaymentDifference: latestTask?.exchangePaymentDifference?.toString() ?? null,
        createdAt: item.createdAt.toISOString(),
      };
    });

    const counts = exchanges.reduce(
      (acc, item) => {
        acc.all += 1;
        if (item.status === "solved") acc.solved += 1;
        else acc.pending += 1;
        return acc;
      },
      { all: 0, pending: 0, solved: 0 }
    );

    return { exchanges, counts };
  } catch (error) {
    if (isMissingOrderExchangeTableError(error)) {
      return { exchanges: [], counts: { all: 0, pending: 0, solved: 0 } };
    }
    throw error;
  }
}
