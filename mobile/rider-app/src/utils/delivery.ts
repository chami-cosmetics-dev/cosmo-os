import type { CompletedDelivery } from "@/src/storage/completed-deliveries";
import type { DeliveryStatus, PaymentMethod, TenantMobileDelivery } from "@/src/types";

type RenderableDelivery = Pick<TenantMobileDelivery, "id" | "orderLabel" | "amount">;

export function isRenderableDelivery(delivery: RenderableDelivery | CompletedDelivery) {
  return (
    typeof delivery.id === "string" &&
    delivery.id.trim().length > 0 &&
    typeof delivery.orderLabel === "string" &&
    delivery.orderLabel.trim().length > 0 &&
    typeof delivery.amount === "string" &&
    delivery.amount.trim().length > 0
  );
}

export function getRouteBadgeLabel(status: DeliveryStatus | string) {
  switch (status) {
    case "accepted":
      return "In transit";
    case "arrived":
      return "At stop";
    case "assigned":
      return "Next stop";
    default:
      return String(status).replace("_", " ");
  }
}

export function getPriorityLabel(delivery: {
  expectedPaymentMethod?: PaymentMethod | null;
  payment?: { paymentMethod?: PaymentMethod | null } | null;
}) {
  const method = delivery.expectedPaymentMethod ?? delivery.payment?.paymentMethod;
  switch (method) {
    case "cod":
      return "Cash on delivery";
    case "already_paid":
      return "Prepared order";
    case "bank_transfer":
      return "Bank transfer";
    case "card":
      return "Card payment";
    default:
      return "Open delivery";
  }
}

export function getPaymentMethodLabel(method: PaymentMethod | null | undefined) {
  switch (method) {
    case "cod":
      return "Cash on Delivery";
    case "bank_transfer":
      return "Bank Transfer";
    case "card":
      return "Card Payment";
    case "already_paid":
      return "Online Transfer";
    default:
      return "Not set";
  }
}

export function isCashFlowDelivery(delivery: {
  expectedPaymentMethod?: PaymentMethod | null;
  payment?: { paymentMethod?: PaymentMethod | null } | null;
}) {
  const method = delivery.payment?.paymentMethod ?? delivery.expectedPaymentMethod;
  return method === "cod";
}

export function requiresPaymentReference(method: PaymentMethod) {
  return method === "bank_transfer" || method === "card";
}

export function amountsMatch(expected: string, actual: number) {
  return Math.abs(Number(expected) - actual) < 0.01;
}
