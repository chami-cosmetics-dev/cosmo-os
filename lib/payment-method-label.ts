export function formatPaymentMethodLabel(input?: {
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}) {
  const gateways = [
    input?.paymentGatewayPrimary,
    ...(input?.paymentGatewayNames ?? []),
  ]
    .map((gateway) => gateway?.trim())
    .filter((gateway): gateway is string => Boolean(gateway));

  const primary = gateways[0];
  if (!primary) return "-";

  const normalized = primary.toLowerCase().replace(/[_-]+/g, " ");
  if (
    normalized === "cod" ||
    normalized.includes("cash on delivery") ||
    normalized.includes("cash on delivery (cod)")
  ) {
    return "COD";
  }

  if (
    normalized === "cc" ||
    normalized.includes("credit card") ||
    normalized.includes("card") ||
    normalized.includes("shopify payments") ||
    normalized.includes("visa") ||
    normalized.includes("mastercard")
  ) {
    return "CC";
  }

  return primary;
}
