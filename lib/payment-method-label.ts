import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";

export type PaymentMethodVariant = "cod" | "bank" | "card" | "cash" | "paid" | "other";

export type PaymentMethodInfo = {
  label: string;
  variant: PaymentMethodVariant;
};

export function getPaymentMethodInfo(input?: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  financialStatus?: string | null;
}): PaymentMethodInfo {
  const gateways = [
    input?.paymentGatewayPrimary,
    ...(input?.paymentGatewayNames ?? []),
  ]
    .map((g) => g?.trim())
    .filter((g): g is string => Boolean(g));

  const primary = gateways[0];
  const normalized = primary?.toLowerCase().replace(/[_\-\s]+/g, " ").trim() ?? "";
  const financialNorm = input?.financialStatus?.toLowerCase().trim() ?? "";
  // Treat ERPNext's literal "None" as no payment method
  if (normalized === "none") return financialNorm === "paid" ? { label: "Paid", variant: "paid" } : { label: "—", variant: "other" };

  if (normalized === "bank transfer" || normalized.includes("bank")) {
    return { label: "Bank Transfer", variant: "bank" };
  }
  if (normalized === "cod" || normalized.includes("cash on delivery")) {
    return { label: "Cash", variant: "cash" };
  }
  if (normalized.includes("card payment on delivery") || normalized.includes("card on delivery")) {
    return { label: "Card on Delivery", variant: "card" };
  }
  if (normalized === "cash") {
    return { label: "Cash", variant: "cash" };
  }
  if (normalized === "koko") {
    return { label: "KOKO", variant: "paid" };
  }
  if (normalized === "mintpay" || normalized.includes("mintpay")) {
    return { label: "Mintpay", variant: "paid" };
  }
  if (normalized === "cc" || normalized === "cc checkout" || normalized === "cc_checkout" || normalized === "cc-checkout") {
    return { label: "CC Checkout", variant: "card" };
  }
  if (
    normalized.includes("credit card") ||
    normalized.includes("card") ||
    normalized.includes("shopify payments") ||
    normalized.includes("visa") ||
    normalized.includes("mastercard") ||
    normalized.includes("amex")
  ) {
    return { label: "Card", variant: "card" };
  }
  if (primary) {
    return { label: primary, variant: "other" };
  }
  if (financialNorm === "paid") return { label: "Paid", variant: "paid" };
  if (financialNorm === "pending") return { label: "COD", variant: "cod" };
  return { label: "—", variant: "other" };
}

export function formatPaymentMethodLabel(input?: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}): string {
  return getPaymentMethodInfo(input).label;
}

/**
 * COD and Cash (POS/web “Cash”) can be switched to Bank Transfer / KOKO / Mintpay.
 * Already bank / card / paid gateways cannot.
 */
export function canRequestPaymentMethodChange(input?: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  financialStatus?: string | null;
}): boolean {
  const info = getPaymentMethodInfo(input);
  if (info.variant === "cod" || info.variant === "cash") return true;

  const pendingFinancial = input?.financialStatus?.toLowerCase().trim() ?? "";
  if (pendingFinancial === "pending" && (info.variant === "other" || info.label === "—")) {
    return true;
  }
  return false;
}

export function isCardOnDeliveryGateway(gateway: string | null | undefined): boolean {
  const normalized = gateway?.toLowerCase().replace(/[_\-\s]+/g, " ").trim() ?? "";
  return (
    normalized.includes("card payment on delivery") ||
    normalized.includes("card on delivery") ||
    normalized.includes("card delivery")
  );
}

export type PaymentMethodChangeTarget = "bank_transfer" | "koko" | "mintpay";

export function paymentMethodChangeTargetLabel(target: PaymentMethodChangeTarget): string {
  switch (target) {
    case "koko":
      return "KOKO";
    case "mintpay":
      return "Mintpay";
    default:
      return "Bank Transfer";
  }
}

export function paymentMethodChangeGateway(target: PaymentMethodChangeTarget): string {
  switch (target) {
    case "koko":
      return "koko";
    case "mintpay":
      return "mintpay";
    default:
      return "bank_transfer";
  }
}

export function parsePaymentMethodChangeTarget(
  requestNote: string | null | undefined,
): PaymentMethodChangeTarget | null {
  const note = requestNote?.trim().toLowerCase() ?? "";
  if (!note) return null;
  if (note.startsWith("bank transfer")) return "bank_transfer";
  if (note.includes("mintpay")) return "mintpay";
  if (note.startsWith("koko")) return "koko";
  return null;
}

export function orderHasCardOnDeliveryGateway(order: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}): boolean {
  if (order.paymentGatewayPrimary) {
    return isCardOnDeliveryGateway(order.paymentGatewayPrimary);
  }
  return (order.paymentGatewayNames ?? []).some((g) => isCardOnDeliveryGateway(g));
}

/**
 * Vault OS Card on Delivery: finance gates fulfillment, SI stays unpaid, PE waits for door collection.
 * Cosmo: treat as normal unpaid delivery collection (no intake finance).
 */
export function isUnpaidCardOnDeliveryFinance(
  order: {
    paymentGatewayPrimary?: string | null;
    paymentGatewayNames?: string[] | null;
  },
  options?: { vaultOs?: boolean },
): boolean {
  const vaultOs = options?.vaultOs ?? isVaultOsDeployment();
  if (!vaultOs) return false;
  return orderHasCardOnDeliveryGateway(order);
}

/** ORDER_PAYMENT finance approve must never mark Card on Delivery paid. */
export function orderPaymentFinanceApproveMarksPaid(
  order: {
    paymentGatewayPrimary?: string | null;
    paymentGatewayNames?: string[] | null;
  },
  extra?: { requestNote?: string | null },
): boolean {
  if (orderHasCardOnDeliveryGateway(order)) return false;
  if (isCardOnDeliveryGateway(extra?.requestNote)) return false;
  return true;
}
