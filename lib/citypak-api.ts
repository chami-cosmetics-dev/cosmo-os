import { extractOrderSeriesPrefix, isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import {
  getPaymentMethodInfo,
  orderHasCardOnDeliveryGateway,
} from "@/lib/payment-method-label";
import { getAddressField, resolveOrderCustomerName } from "@/lib/reports/csv";

export const CITYPAK_WAYBILL_SOURCE = "citypak_api";
/** WaybillUpload.fileType for OS→CityPak API dispatch batches (bulk history). */
export const CITYPAK_API_BATCH_FILE_TYPE = "citypak_api";
export const CITYPAK_DEFAULT_WEIGHT_G = 500;
export const CITYPAK_DEFAULT_BASE_URL = "https://falcon.citypak.lk";
/** Gap between CityPak create-order calls in bulk dispatch. CityPak has no bulk endpoint. */
export const CITYPAK_BULK_CREATE_GAP_MS = 500;

export type CitypakSender = {
  name: string;
  address1: string;
  city: string;
  contact1: string;
  contact2: string;
  description: string;
};

const VAULT_SENDER: CitypakSender = {
  name: "SupplementVault.lk",
  address1: "347/34, 3/1, Nirmala Mawatha, Lake Road, Boralesgamuwa.",
  city: "Boralesgamuwa",
  contact1: "0761800288",
  contact2: "",
  description: "Supplements & Vitamins",
};

const COSMO_SENDER: CitypakSender = {
  name: "cosmetics.lk",
  address1: "7/1A, Pepiliyana Mawatha, Nugegoda.",
  city: "Nugegoda",
  contact1: "715930200",
  contact2: "703050482",
  description: "Cosmetics",
};

export function getCitypakApiBaseUrl() {
  const fromEnv = process.env.CITYPAK_API_BASE_URL?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : CITYPAK_DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

export function getCitypakSender(): CitypakSender {
  return isVaultOsDeployment() ? VAULT_SENDER : COSMO_SENDER;
}

/** CityPak rejects non-ASCII in text fields. */
export function toCitypakAscii(value: string, maxLen?: number) {
  const ascii = value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (maxLen != null && ascii.length > maxLen) return ascii.slice(0, maxLen).trim();
  return ascii;
}

export function toCitypakPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("94") && digits.length === 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

export function isCitypakPrepaid(financialStatus: string | null | undefined) {
  // Refunded / partially_refunded orders do not go through dispatch.
  return (financialStatus ?? "").toLowerCase() === "paid";
}

/**
 * CityPak COD must be 0 when customer already paid (bank transfer, Koko, Mintpay, online card)
 * or Shopify/ERP marks financialStatus paid. Collect total only for COD / cash / card-on-delivery.
 */
export function isCitypakZeroCodOrder(input: {
  financialStatus?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
}) {
  if (isCitypakPrepaid(input.financialStatus)) return true;
  if (orderHasCardOnDeliveryGateway(input)) return false;
  const variant = getPaymentMethodInfo(input).variant;
  return variant === "bank" || variant === "paid" || variant === "card";
}

export function citypakCodAmount(
  financialStatus: string | null | undefined,
  totalPrice: string | number,
  payment?: {
    paymentGatewayPrimary?: string | null;
    paymentGatewayNames?: string[] | null;
  }
) {
  if (
    isCitypakZeroCodOrder({
      financialStatus,
      paymentGatewayPrimary: payment?.paymentGatewayPrimary,
      paymentGatewayNames: payment?.paymentGatewayNames,
    })
  ) {
    return 0;
  }
  const amount = Number.parseFloat(String(totalPrice));
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

/** Settings prefix SV100 and order SV1008123 both key to 100. Cosmo 110 stays 110. */
export function normalizeCitypakPrefix(value: string) {
  const trimmed = value.trim().replace(/^#/, "");
  return extractOrderSeriesPrefix(trimmed) ?? trimmed.toUpperCase();
}

export function matchCitypakAccount<T extends { invoicePrefix: string }>(
  accounts: T[],
  orderPrefix: string
): T | undefined {
  const wanted = normalizeCitypakPrefix(orderPrefix);
  if (!wanted) return undefined;
  return accounts.find((account) => normalizeCitypakPrefix(account.invoicePrefix) === wanted);
}

export type CitypakCreateOrderBody = {
  token: string;
  reference: string;
  from_name: string;
  from_address_line_1: string;
  from_address_line_2: string;
  from_address_line_3: string;
  from_address_line_4: string;
  from_contact_name: string;
  from_contact_1: string;
  from_contact_2: string;
  to_name: string;
  to_address_line_1: string;
  to_address_line_2: string;
  to_address_line_3: string;
  to_address_line_4: string;
  to_contact_name: string;
  to_contact_1: string;
  to_contact_2: string;
  to_nic: string;
  description: string;
  weight_g: number;
  cash_on_delivery_amount: number;
  number_of_pieces: number;
};

export type CitypakShipmentInput = {
  token: string;
  reference: string;
  receiverName: string;
  receiverAddress1: string;
  receiverAddress2: string;
  receiverCity: string;
  receiverPhone: string;
  cashOnDeliveryAmount: number;
  description?: string;
  weightG?: number;
  numberOfPieces?: number;
};

export function buildCitypakCreateOrderBody(
  input: CitypakShipmentInput
): { ok: true; body: CitypakCreateOrderBody } | { ok: false; error: string } {
  const sender = getCitypakSender();
  const reference = toCitypakAscii(input.reference, 64);
  const toName = toCitypakAscii(input.receiverName, 80);
  const toAddress1 = toCitypakAscii(input.receiverAddress1, 120);
  const toCity = toCitypakAscii(input.receiverCity, 80);
  const toPhone = toCitypakPhone(input.receiverPhone);
  const fromPhone = toCitypakPhone(sender.contact1);

  if (!reference) return { ok: false, error: "CityPak create needs an order reference" };
  if (!toName) return { ok: false, error: "CityPak create needs a customer name" };
  if (!toAddress1) return { ok: false, error: "CityPak create needs a delivery address" };
  if (!toCity) return { ok: false, error: "CityPak create needs a delivery city" };
  if (toPhone.length < 9) return { ok: false, error: "CityPak create needs a valid customer phone" };
  if (fromPhone.length < 9) return { ok: false, error: "CityPak sender phone is not configured" };

  const pieces = input.numberOfPieces ?? 1;
  const weightG = input.weightG ?? CITYPAK_DEFAULT_WEIGHT_G;
  if (pieces < 1 || pieces > 20) {
    return { ok: false, error: "CityPak number_of_pieces must be 1–20" };
  }
  if (weightG < 1 || weightG > 100000) {
    return { ok: false, error: "CityPak weight_g must be 1–100000" };
  }

  return {
    ok: true,
    body: {
      token: input.token,
      reference,
      from_name: toCitypakAscii(sender.name, 80),
      from_address_line_1: toCitypakAscii(sender.address1, 120),
      from_address_line_2: "",
      from_address_line_3: "",
      from_address_line_4: toCitypakAscii(sender.city, 80),
      from_contact_name: toCitypakAscii(sender.name, 80),
      from_contact_1: fromPhone,
      from_contact_2: toCitypakPhone(sender.contact2),
      to_name: toName,
      to_address_line_1: toAddress1,
      to_address_line_2: toCitypakAscii(input.receiverAddress2, 120),
      to_address_line_3: "",
      to_address_line_4: toCity,
      to_contact_name: toName,
      to_contact_1: toPhone,
      to_contact_2: "",
      to_nic: "",
      description: toCitypakAscii(input.description ?? sender.description, 128),
      weight_g: weightG,
      cash_on_delivery_amount: input.cashOnDeliveryAmount,
      number_of_pieces: pieces,
    },
  };
}

export type CitypakCreateOrderSuccess = {
  ok: true;
  orderId: string;
  trackingNumber: string;
  raw: unknown;
};

export type CitypakCreateOrderFailure = {
  ok: false;
  error: string;
  status?: number;
  raw?: unknown;
};

function readCreateOrderResult(payload: unknown): CitypakCreateOrderSuccess | CitypakCreateOrderFailure {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "CityPak create returned an empty body" };
  }
  const record = payload as Record<string, unknown>;
  if (record.success === false) {
    const message = typeof record.message === "string" && record.message.trim()
      ? record.message.trim()
      : "CityPak create returned success=false";
    return { ok: false, error: message, raw: payload };
  }
  if (typeof record.error === "string" && record.error.trim() && record.success !== true) {
    return { ok: false, error: record.error.trim(), raw: payload };
  }

  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : record;
  const orderId = data.order_id != null ? String(data.order_id) : "";
  const items = Array.isArray(data.items) ? data.items : [];
  const firstItem = items[0] && typeof items[0] === "object" ? (items[0] as Record<string, unknown>) : null;
  const trackingNumber = firstItem?.tracking_number != null ? String(firstItem.tracking_number) : "";

  if (!orderId || !trackingNumber) {
    return { ok: false, error: "CityPak create did not return order_id and tracking_number", raw: payload };
  }

  return { ok: true, orderId, trackingNumber, raw: payload };
}

export async function createCitypakOrder(
  input: CitypakShipmentInput,
  options?: { baseUrl?: string }
): Promise<CitypakCreateOrderSuccess | CitypakCreateOrderFailure> {
  const built = buildCitypakCreateOrderBody(input);
  if (!built.ok) return built;

  const baseUrl = (options?.baseUrl ?? getCitypakApiBaseUrl()).replace(/\/+$/, "");
  const url = `${baseUrl}/customer_api/v1/orders`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      /* keep raw text */
    }

    if (!response.ok) {
      const parsed = readCreateOrderResult(payload);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error, status: response.status, raw: payload };
      }
      return { ok: false, error: `CityPak create failed (HTTP ${response.status})`, status: response.status, raw: payload };
    }

    return readCreateOrderResult(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "CityPak create request failed";
    return { ok: false, error: message };
  }
}

export type CitypakShipmentOverride = {
  receiverName: string;
  receiverAddress1: string;
  receiverAddress2: string;
  receiverCity: string;
  receiverPhone: string;
  cashOnDeliveryAmount?: number;
};

export function citypakWaybillPdfRequestUrl(
  baseUrl: string,
  citypakOrderId: string,
  pageSize: "A4" | "A5" | "A6" = "A4"
) {
  const params = new URLSearchParams({
    page_size: pageSize,
    per_page_waybill_count: "1",
  });
  return `${baseUrl.replace(/\/+$/, "")}/customer_api/v1/orders/${encodeURIComponent(citypakOrderId)}/waybills?${params}`;
}

export function citypakWaybillDownloadPath(orderId: string) {
  return `/api/admin/orders/${orderId}/citypak-waybill`;
}

export function citypakWaybillByIdPath(waybillId: string) {
  return `/api/admin/waybills/${waybillId}/citypak-pdf`;
}

export function mergeShippingAddressWithCitypakOverride(
  current: unknown,
  override: CitypakShipmentOverride
): Record<string, unknown> {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  return {
    ...base,
    name: override.receiverName,
    address1: override.receiverAddress1,
    address2: override.receiverAddress2,
    city: override.receiverCity,
    phone: override.receiverPhone,
  };
}

export function draftCitypakShipmentFields(input: {
  shippingAddress: unknown;
  billingAddress?: unknown;
  rawPayload?: unknown;
  customerPhone?: string | null;
  financialStatus?: string | null;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  totalPrice?: string | number;
}): CitypakShipmentOverride {
  const shippingAddress = input.shippingAddress;
  const receiverName = resolveOrderCustomerName({
    shippingAddress,
    billingAddress: input.billingAddress,
    rawPayload: input.rawPayload,
  });
  const receiverPhone =
    input.customerPhone ||
    getAddressField(shippingAddress, "phone") ||
    getAddressField(input.billingAddress, "phone");
  return {
    receiverName,
    receiverAddress1: getAddressField(shippingAddress, "address1"),
    receiverAddress2: getAddressField(shippingAddress, "address2"),
    receiverCity: getAddressField(shippingAddress, "city"),
    receiverPhone: toCitypakPhone(receiverPhone),
    cashOnDeliveryAmount: citypakCodAmount(input.financialStatus, input.totalPrice ?? 0, {
      paymentGatewayPrimary: input.paymentGatewayPrimary,
      paymentGatewayNames: input.paymentGatewayNames,
    }),
  };
}

function isPdfBytes(bytes: Buffer, contentType: string) {
  if (contentType.toLowerCase().includes("pdf")) return true;
  return bytes.subarray(0, 5).toString("utf8") === "%PDF-";
}

export type CitypakWaybillPdfSuccess = { ok: true; bytes: Buffer };
export type CitypakWaybillPdfFailure = { ok: false; error: string; status?: number };

export async function downloadCitypakWaybillPdf(
  input: { token: string; citypakOrderId: string; pageSize?: "A4" | "A5" | "A6" },
  options?: { baseUrl?: string }
): Promise<CitypakWaybillPdfSuccess | CitypakWaybillPdfFailure> {
  const citypakOrderId = input.citypakOrderId.trim();
  if (!citypakOrderId) return { ok: false, error: "CityPak waybill download needs order_id" };

  const baseUrl = (options?.baseUrl ?? getCitypakApiBaseUrl()).replace(/\/+$/, "");
  const url = citypakWaybillPdfRequestUrl(baseUrl, citypakOrderId, input.pageSize ?? "A4");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${input.token}` },
      signal: AbortSignal.timeout(15000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      let message = `CityPak waybill download failed (HTTP ${response.status})`;
      try {
        const payload = JSON.parse(bytes.toString("utf8")) as { message?: unknown; error?: unknown };
        if (typeof payload.message === "string" && payload.message.trim()) message = payload.message.trim();
        else if (typeof payload.error === "string" && payload.error.trim()) message = payload.error.trim();
      } catch {
        /* keep default */
      }
      return { ok: false, error: message, status: response.status };
    }

    if (!isPdfBytes(bytes, contentType)) {
      return { ok: false, error: "CityPak waybill download did not return a PDF" };
    }

    return { ok: true, bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : "CityPak waybill download failed";
    return { ok: false, error: message };
  }
}
