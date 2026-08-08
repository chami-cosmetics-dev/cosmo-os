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
    return { label: "COD", variant: "cod" };
  }
  if (normalized.includes("card payment on delivery") || normalized.includes("card on delivery")) {
    return { label: "Card on Delivery", variant: "card" };
  }
  if (normalized === "cash") {
    return { label: "Cash", variant: "cash" };
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
 * COD and Cash (POS/web “Cash”) can be switched to Bank Transfer / KOKO.
 * Already bank / card / paid gateways cannot.
 */
export function canRequestPaymentMethodChange(input?: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  financialStatus?: string | null;
}): boolean {
  const info = getPaymentMethodInfo(input);
  if (info.variant === "cod" || info.variant === "cash") return true;

  const financialNorm = input?.financialStatus?.toLowerCase().trim() ?? "";
  if (financialNorm === "pending" && (info.variant === "other" || info.label === "—")) {
    return true;
  }
  return false;
}
