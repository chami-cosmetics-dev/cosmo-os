import { resolveCustomerPhone } from "@/lib/order-sms-resolvers";

/** Shopify-style addresses: `phone` may be a string or numeric JSON value. */
export function getPhoneFromAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  if (typeof a.phone === "string" && a.phone.trim()) return a.phone.trim();
  if (typeof a.phone === "number" && Number.isFinite(a.phone)) return String(a.phone);
  return "";
}

/** Copy a resolved phone onto an address object when the address has none. */
export function withAddressPhone(addr: unknown, phone: string): unknown {
  const trimmed = phone.trim();
  if (!trimmed) return addr;
  if (!addr || typeof addr !== "object" || Array.isArray(addr)) {
    return { phone: trimmed };
  }
  if (getPhoneFromAddress(addr)) return addr;
  return { ...(addr as Record<string, unknown>), phone: trimmed };
}

export function resolveInvoicePrintPhones(order: {
  customerPhone?: string | null;
  shippingAddress?: unknown;
  billingAddress?: unknown;
  rawPayload?: unknown;
}): {
  resolvedPhone: string;
  billingPhone: string;
  shippingPhone: string;
  billingAddress: unknown;
  shippingAddress: unknown;
} {
  const resolvedPhone =
    resolveCustomerPhone({
      customerPhone: order.customerPhone,
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      rawPayload: order.rawPayload,
    }) ?? "";
  const billingPhone = getPhoneFromAddress(order.billingAddress) || resolvedPhone;
  const shippingPhone = getPhoneFromAddress(order.shippingAddress) || resolvedPhone;

  return {
    resolvedPhone,
    billingPhone,
    shippingPhone,
    billingAddress: withAddressPhone(order.billingAddress, billingPhone),
    shippingAddress: withAddressPhone(order.shippingAddress, shippingPhone),
  };
}
