/** Normalize Adapt CSV headers (case, punctuation, BOM). */
export function normalizeAdaptHeader(header: string): string {
  return String(header)
    .trim()
    .replace(/^\ufeff/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Canonical field keys used by classifiers (after alias resolution). */
export const ADAPT_FIELD = {
  salesInvoiceMasterId: "sales_invoice_master_id",
  salesInvoiceNo: "sales_invoice_no",
  salesLocationId: "sales_location_id",
  locationName: "location_name",
  invoiceDate: "invoice_date",
  merchentId: "merchent_id",
  knownName: "knownname",
  customerMasterId: "customer_master_id",
  customerTp: "customer_tp",
  customerTpRaw: "customer_tp_raw",
  customerEmail: "customer_email",
  attentionName: "attention_name",
  paymentMethode: "payment_methode",
  inPaymentTypeName: "in_payment_type_name",
  ttlAmount: "ttl_amount",
  activeFlag: "active_flag",
  deletedOn: "deleted_on",
  cancelComent: "cancel_coment",
  district: "district",
  zone: "zone",
  nearestOutlet: "nearest_outlet",
  customerShippingAddress: "customer_shipping_address",
  postCode: "post_code",
  customerNote: "customer_note",
  specialNote: "special_note",
  cashAmount: "invoice_payment_cash_amount",
  cardAmount: "invoice_payment_card_amount",
} as const;

const HEADER_ALIASES: Record<string, string> = {
  known_name: ADAPT_FIELD.knownName,
  knownname: ADAPT_FIELD.knownName,
  merchant_id: ADAPT_FIELD.merchentId,
  merchent_id: ADAPT_FIELD.merchentId,
  payment_method: ADAPT_FIELD.paymentMethode,
  payment_methode: ADAPT_FIELD.paymentMethode,
  cancel_comment: ADAPT_FIELD.cancelComent,
  cancel_coment: ADAPT_FIELD.cancelComent,
  shipping_service_name: "shiping_service_name",
  shiping_service_name: "shiping_service_name",
};

/** Map a raw header row to canonical Adapt field keys. */
export function mapAdaptHeaders(headers: string[]): string[] {
  return headers.map((h) => {
    const n = normalizeAdaptHeader(h);
    return HEADER_ALIASES[n] ?? n;
  });
}

export function rowFromValues(
  canonicalHeaders: string[],
  values: string[]
): Record<string, string | undefined> {
  const row: Record<string, string | undefined> = {};
  for (let i = 0; i < canonicalHeaders.length; i += 1) {
    const key = canonicalHeaders[i];
    if (!key) continue;
    row[key] = values[i];
  }
  return row;
}

export function cell(row: Record<string, string | undefined>, key: string): string | null {
  const raw = row[key]?.trim() ?? "";
  return raw ? raw : null;
}
