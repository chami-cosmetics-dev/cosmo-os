import type {
  DeliveryPayment,
  Order,
  RiderCashHandover,
  RiderCashHandoverItem,
  RiderDeliveryTask,
} from "@prisma/client";

function formatMoney(value: { toString(): string } | null | undefined) {
  return value?.toString() ?? "0.00";
}

function extractCustomerName(shippingAddress: unknown, billingAddress: unknown) {
  const candidate = [shippingAddress, billingAddress].find(
    (value) => value && typeof value === "object"
  ) as
    | {
        first_name?: string | null;
        last_name?: string | null;
        name?: string | null;
      }
    | undefined;

  if (!candidate) return null;
  const full = candidate.name?.trim();
  if (full) return full;
  const joined = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ").trim();
  return joined || null;
}

export function toMobileDeliveryDto(input: {
  order: Pick<
    Order,
    | "id"
    | "orderNumber"
    | "name"
    | "shopifyOrderId"
    | "totalPrice"
    | "currency"
    | "customerPhone"
    | "customerEmail"
    | "shippingAddress"
    | "billingAddress"
    | "paymentGatewayPrimary"
    | "financialStatus"
    | "deliveryOutcome"
    | "deliveryFailedReason"
    | "dispatchedAt"
  > & {
    paymentGatewayNames?: string[];
  };
  task: Pick<
    RiderDeliveryTask,
    | "id"
    | "status"
    | "assignedAt"
    | "acceptedAt"
    | "arrivedAt"
    | "completedAt"
    | "failedAt"
    | "failureReason"
    | "latestSyncAt"
  >;
  payment?: Pick<
    DeliveryPayment,
    | "expectedAmount"
    | "collectedAmount"
    | "paymentMethod"
    | "collectionStatus"
    | "referenceNote"
    | "bankReference"
    | "cardReference"
    | "collectedAt"
  > | null;
  companyLocation?: { id: string; name: string | null } | null;
}) {
  const { order, task, payment, companyLocation } = input;
  return {
    id: task.id,
    orderId: order.id,
    orderLabel: order.name ?? order.orderNumber ?? order.shopifyOrderId,
    orderNumber: order.orderNumber,
    customerName: extractCustomerName(order.shippingAddress, order.billingAddress),
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    amount: formatMoney(order.totalPrice),
    currency: order.currency,
    expectedPaymentMethod: order.paymentGatewayPrimary,
    financialStatus: order.financialStatus,
    deliveryStatus: task.status,
    deliveryOutcome: order.deliveryOutcome,
    deliveryFailedReason: order.deliveryFailedReason,
    assignedAt: task.assignedAt.toISOString(),
    acceptedAt: task.acceptedAt?.toISOString() ?? null,
    arrivedAt: task.arrivedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    failedAt: task.failedAt?.toISOString() ?? null,
    latestSyncAt: task.latestSyncAt?.toISOString() ?? null,
    dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
    companyLocation,
    payment: payment
      ? {
          expectedAmount: formatMoney(payment.expectedAmount),
          collectedAmount: formatMoney(payment.collectedAmount),
          paymentMethod: payment.paymentMethod,
          collectionStatus: payment.collectionStatus,
          referenceNote: payment.referenceNote,
          bankReference: payment.bankReference,
          cardReference: payment.cardReference,
          collectedAt: payment.collectedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export function toMobileHandoverDto(input: {
  handover: RiderCashHandover;
  items: Array<RiderCashHandoverItem & { companyLocation: { id: string; name: string } }>;
}) {
  const { handover, items } = input;
  return {
    id: handover.id,
    handoverDate: handover.handoverDate.toISOString(),
    submittedAt: handover.submittedAt.toISOString(),
    receivedAt: handover.receivedAt?.toISOString() ?? null,
    status: handover.status,
    totalExpectedCash: formatMoney(handover.totalExpectedCash),
    totalHandedOverCash: formatMoney(handover.totalHandedOverCash),
    varianceAmount: formatMoney(handover.varianceAmount),
    notes: handover.notes,
    items: items.map((item) => ({
      id: item.id,
      companyLocationId: item.companyLocationId,
      companyLocationName: item.companyLocation.name,
      cashAmount: formatMoney(item.cashAmount),
      orderCount: item.orderCount,
    })),
  };
}
