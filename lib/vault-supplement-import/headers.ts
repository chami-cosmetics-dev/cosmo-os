export const PURCHASE_HEADERS = [
  "customer_name",
  "phone",
  "email",
  "address",
  "city",
  "district",
  "invoice_no",
  "invoice_date",
  "item_code",
  "item_name",
  "quantity",
  "unit_price",
  "line_amount",
  "currency",
  "payment_method",
  "location",
  "merchant",
  "source_ref",
] as const;

export type PurchaseHeader = (typeof PURCHASE_HEADERS)[number];

/** Headers that must be present. Optional columns may be omitted. */
export const REQUIRED_PURCHASE_HEADERS: readonly PurchaseHeader[] = [
  "customer_name",
  "phone",
  "email",
  "invoice_no",
  "invoice_date",
  "item_code",
  "item_name",
  "quantity",
  "unit_price",
  "source_ref",
];

export const ITEM_CODE_HEADER = "item_code";

export const REJECT_REASON = {
  phoneOrEmail: "Phone or email is required",
  customerName: "Customer name is required",
  invoiceNumber: "Invoice number is required",
  invoiceDate: "Invoice date must be YYYY-MM-DD",
  itemCode: "Item code is required",
  itemName: "Item name is required",
  quantity: "Quantity must be greater than zero",
  unitPrice: "Unit price is required",
  lineAmount: "Line amount must be a number",
  sourceRef: "Source reference is required",
  unknownItem: "Item code is not on the Supplement Vault ERP item list",
  phoneEmailDiffer: "Phone and email match different contacts",
  phoneMany: "Phone matches more than one contact",
  emailMany: "Email matches more than one contact",
} as const;

export function matchPurchaseHeaders(
  headerCells: string[],
): { ok: true; index: Map<PurchaseHeader, number> } | { ok: false; error: string } {
  const index = new Map<PurchaseHeader, number>();
  headerCells.forEach((raw, column) => {
    const name = raw.trim();
    if ((PURCHASE_HEADERS as readonly string[]).includes(name) && !index.has(name as PurchaseHeader)) {
      index.set(name as PurchaseHeader, column);
    }
  });

  const missing = REQUIRED_PURCHASE_HEADERS.filter((header) => !index.has(header));
  if (missing.length === 0) return { ok: true, index };

  const label = missing.length === 1 ? "header" : "headers";
  return { ok: false, error: `Missing required ${label}: ${missing.join(", ")}` };
}
