import "server-only";

import { calculateExchangePaymentDifference, orderDisplayLabel, requiresOldItemCollection } from "@/lib/rider-delivery-special";

type SpecialOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
  totalPrice: { toString(): string };
  returns?: Array<{ actionType: string | null }>;
  exchangesAsReplacement?: Array<{
    id: string;
    reason: string;
    originalReference: string;
    originalOrder: {
      id: string;
      name: string | null;
      orderNumber: string | null;
      shopifyOrderId: string;
      totalPrice: { toString(): string };
    } | null;
  }>;
};

type SpecialTask = {
  deliveryKind: "normal" | "rearranged" | "exchange";
  oldOrderLabel: string | null;
  replacementOrderLabel: string | null;
  requiresOldItemCollection: boolean;
  oldItemCollectionStatus: "pending" | "collected" | "not_collected";
  oldItemCollectionRemark: string | null;
  exchangePaymentDifference: { toString(): string } | null;
};

export function resolveMobileSpecialDelivery(input: {
  order: SpecialOrder;
  task: SpecialTask;
}) {
  const exchange = input.order.exchangesAsReplacement?.[0] ?? null;
  if (exchange) {
    return {
      deliveryKind: "exchange" as const,
      oldOrderLabel: exchange.originalOrder
        ? orderDisplayLabel(exchange.originalOrder)
        : exchange.originalReference,
      replacementOrderLabel: orderDisplayLabel(input.order),
      requiresOldItemCollection: requiresOldItemCollection(exchange.reason),
      oldItemCollectionStatus: input.task.oldItemCollectionStatus,
      oldItemCollectionRemark: input.task.oldItemCollectionRemark,
      exchangePaymentDifference:
        input.task.exchangePaymentDifference ??
        calculateExchangePaymentDifference({
          originalOrder: exchange.originalOrder,
          replacementOrder: input.order,
        }),
    };
  }

  const isRearranged =
    input.task.deliveryKind === "rearranged" ||
    Boolean(input.order.returns?.some((item) => item.actionType === "rearrange"));

  if (isRearranged) {
    return {
      deliveryKind: "rearranged" as const,
      oldOrderLabel: null,
      replacementOrderLabel: null,
      requiresOldItemCollection: false,
      oldItemCollectionStatus: input.task.oldItemCollectionStatus,
      oldItemCollectionRemark: input.task.oldItemCollectionRemark,
      exchangePaymentDifference: null,
    };
  }

  return null;
}

