import type { FulfillmentStage } from "@prisma/client";

export function orderStageUpdate(stage: FulfillmentStage, at: Date = new Date()) {
  return {
    fulfillmentStage: stage,
    fulfillmentStageEnteredAt: at,
  };
}

export function orderStageUpdateIfChanged(
  currentStage: FulfillmentStage,
  nextStage: FulfillmentStage,
  at: Date = new Date(),
) {
  if (currentStage === nextStage) {
    return {};
  }
  return orderStageUpdate(nextStage, at);
}

type OrderStageTimingInput = {
  fulfillmentStage: FulfillmentStage;
  fulfillmentStageEnteredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sampleFreeIssueCompleteAt?: Date | null;
  packageReadyAt?: Date | null;
  dispatchedAt?: Date | null;
  deliveryCompleteAt?: Date | null;
  invoiceCompleteAt?: Date | null;
  latestReturnDate?: Date | null;
};

/** Resolve when the order entered its current stage (fallback when field is null). */
export function resolveOrderStageEnteredAt(order: OrderStageTimingInput): Date {
  if (order.fulfillmentStageEnteredAt) {
    return order.fulfillmentStageEnteredAt;
  }

  switch (order.fulfillmentStage) {
    case "order_received":
    case "sample_free_issue":
      return order.createdAt;
    case "print":
      return order.sampleFreeIssueCompleteAt ?? order.createdAt;
    case "ready_to_dispatch":
      return order.packageReadyAt ?? order.updatedAt;
    case "dispatched":
      return order.dispatchedAt ?? order.updatedAt;
    case "delivery_complete":
      return order.deliveryCompleteAt ?? order.updatedAt;
    case "invoice_complete":
      return order.invoiceCompleteAt ?? order.updatedAt;
    case "returned_to_store":
      return order.latestReturnDate ?? order.updatedAt;
    default:
      return order.createdAt;
  }
}

export function waitingHoursSince(since: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / (60 * 60 * 1000)));
}
