import type {
  DeliveryCollectionStatus,
  DeliveryPaymentMethod,
  Order,
} from "@prisma/client";

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function inferExpectedPaymentMethod(
  order: Pick<Order, "financialStatus" | "paymentGatewayPrimary"> & {
    paymentGatewayNames?: string[];
  }
): DeliveryPaymentMethod {
  const gatewayCandidates = [
    order.paymentGatewayPrimary,
    ...(order.paymentGatewayNames ?? []),
    order.financialStatus,
  ].map(normalizeText);

  if (gatewayCandidates.some((value) => value.includes("bank"))) {
    return "bank_transfer";
  }
  if (
    gatewayCandidates.some(
      (value) =>
        value.includes("card") ||
        value.includes("visa") ||
        value.includes("master") ||
        value.includes("shopify_payments")
    )
  ) {
    return "card";
  }
  if (
    normalizeText(order.financialStatus).includes("paid") &&
    !gatewayCandidates.some((value) => value.includes("cod"))
  ) {
    return "already_paid";
  }
  return "cod";
}

export function inferCollectionStatus(params: {
  paymentMethod: DeliveryPaymentMethod;
  expectedAmount: number;
  collectedAmount: number;
}): DeliveryCollectionStatus {
  const expected = Number.isFinite(params.expectedAmount) ? params.expectedAmount : 0;
  const collected = Number.isFinite(params.collectedAmount) ? params.collectedAmount : 0;

  if (params.paymentMethod === "already_paid") {
    return "collected";
  }
  if (collected <= 0) {
    return "not_collected";
  }
  if (collected + 0.001 < expected) {
    return "partially_collected";
  }
  return "collected";
}

export function isCashCollectionMethod(method: DeliveryPaymentMethod) {
  return method === "cod";
}
