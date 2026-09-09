import { getAppBaseUrl } from "@/lib/app-base-url";
import { canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";

export type SmsTrigger =
  | "order_received"
  | "package_ready"
  | "dispatched"
  | "rider_dispatched"
  | "delivery_complete";

export type SmsContext = {
  orderNumber?: string;
  orderName?: string;
  invoiceNumber?: string;
  /** Combined "Shopify# / ERP#" — use {orderReference} in SMS templates to show both in one token. */
  orderReference?: string;
  customerName?: string;
  customerPhone?: string;
  locationName?: string;
  deliveryUrl?: string;
  riderName?: string;
  riderPhone?: string;
};

/** ERP Sales Invoice name only (erpnextInvoiceId). Never Shopify order id. */
export function resolveOrderInvoiceNumber(order: {
  erpnextInvoiceId?: string | null;
}): string {
  const erp = order.erpnextInvoiceId?.trim();
  if (!erp || erp === "pending" || erp === "pending_approval") return "";
  return erp;
}

export function resolveOrderNumber(order: {
  name?: string | null;
  orderNumber?: string | null;
  shopifyOrderId?: string | null;
}): string {
  return order.name?.trim() || order.orderNumber?.trim() || order.shopifyOrderId?.trim() || "";
}

function coercePhoneString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const asString = String(value).trim();
    return asString || undefined;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return undefined;
  return trimmed;
}

function isErpCustomerIdPhone(value: string): boolean {
  return canonicalPhoneForErpCustomerId(value) != null;
}

function phoneFromErpCustomerId(customer: unknown): string | undefined {
  if (typeof customer !== "string") return undefined;
  const phone = coercePhoneString(customer);
  return phone && isErpCustomerIdPhone(phone) ? phone : undefined;
}

function phoneFromCustomerObject(customer: unknown): string | undefined {
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) return undefined;
  const record = customer as Record<string, unknown>;
  return (
    coercePhoneString(record.phone) ??
    coercePhoneString(record.mobile) ??
    coercePhoneString(record.mobile_no)
  );
}

function phoneFromErpPayload(raw: Record<string, unknown>): string | undefined {
  return (
    coercePhoneString(raw.contact_mobile) ??
    coercePhoneString(raw.contact_phone) ??
    phoneFromErpCustomerId(raw.customer)
  );
}

/** Customer phone from order field, shipping address, billing address, or Shopify/ERP raw payload. */
export function resolveCustomerPhone(order: {
  customerPhone?: string | null;
  erpnextCustomerId?: string | null;
  shippingAddress?: unknown;
  billingAddress?: unknown;
  rawPayload?: unknown;
}): string | undefined {
  const direct = coercePhoneString(order.customerPhone);
  if (direct) return direct;

  for (const addr of [order.shippingAddress, order.billingAddress]) {
    if (!addr || typeof addr !== "object" || Array.isArray(addr)) continue;
    const phone = coercePhoneString((addr as Record<string, unknown>).phone);
    if (phone) return phone;
  }

  if (order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)) {
    const raw = order.rawPayload as Record<string, unknown>;

    const fromErp = phoneFromErpPayload(raw);
    if (fromErp) return fromErp;

    const dataObj = raw.data;
    if (dataObj && typeof dataObj === "object" && !Array.isArray(dataObj)) {
      const fromNested = phoneFromErpPayload(dataObj as Record<string, unknown>);
      if (fromNested) return fromNested;
    }

    // Shopify order: phone at root, billing_address.phone, shipping_address.phone
    const fromRoot = coercePhoneString(raw.phone);
    if (fromRoot) return fromRoot;

    const billing = raw.billing_address as Record<string, unknown> | null | undefined;
    const billingPhone = coercePhoneString(billing?.phone);
    if (billingPhone) return billingPhone;

    const shipping = raw.shipping_address as Record<string, unknown> | null | undefined;
    const shippingPhone = coercePhoneString(shipping?.phone);
    if (shippingPhone) return shippingPhone;

    const shopifyCustomerPhone = phoneFromCustomerObject(raw.customer);
    if (shopifyCustomerPhone) return shopifyCustomerPhone;
  }

  const fromErpCustomerId = coercePhoneString(order.erpnextCustomerId);
  if (fromErpCustomerId && isErpCustomerIdPhone(fromErpCustomerId)) return fromErpCustomerId;

  return undefined;
}

/** Delivery/shipping phone only: stored shipping address, then the Shopify/ERP raw payload shipping address. */
export function resolveShippingPhone(order: {
  shippingAddress?: unknown;
  rawPayload?: unknown;
}): string | undefined {
  const addr = order.shippingAddress;
  if (addr && typeof addr === "object" && !Array.isArray(addr)) {
    const phone = coercePhoneString((addr as Record<string, unknown>).phone);
    if (phone) return phone;
  }

  if (order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)) {
    const raw = order.rawPayload as Record<string, unknown>;

    const shipping = raw.shipping_address as Record<string, unknown> | null | undefined;
    const shippingPhone = coercePhoneString(shipping?.phone);
    if (shippingPhone) return shippingPhone;

    const dataObj = raw.data;
    if (dataObj && typeof dataObj === "object" && !Array.isArray(dataObj)) {
      const nested = (dataObj as Record<string, unknown>).shipping_address as
        | Record<string, unknown>
        | null
        | undefined;
      const nestedPhone = coercePhoneString(nested?.phone);
      if (nestedPhone) return nestedPhone;
    }
  }

  return undefined;
}

export function getDeliveryUrl(order: { riderDeliveryToken: string | null }): string {
  if (!order.riderDeliveryToken) return "";
  return `${getAppBaseUrl()}/r/d/${order.riderDeliveryToken}`;
}
