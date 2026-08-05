/** Adapt invoice line-item shape stored on AdaptPurchaseHistory.lineItems. */

export type AdaptLineItemJson = {
  id: string;
  itemId: string | null;
  itemCode: string | null;
  itemName: string;
  unitPrice: string;
  quantity: number;
};

export type AdaptLineItemCsvRow = {
  salesInvoiceMasterId: string | null;
  salesInvoiceNo: string | null;
  itemId: string | null;
  itemCode: string | null;
  itemName: string | null;
  unitPrice: string | null;
  quantity: string | null;
};

const HEADER_ALIASES: Record<keyof AdaptLineItemCsvRow, string[]> = {
  salesInvoiceMasterId: ["sales_invoice_master_id"],
  salesInvoiceNo: ["sales_invoice_no"],
  itemId: ["item_id"],
  itemCode: ["item_code"],
  itemName: ["item_name"],
  unitPrice: ["unit_price"],
  quantity: ["quantity"],
};

export function mapAdaptLineItemHeaders(headers: string[]): Record<keyof AdaptLineItemCsvRow, number> {
  const lower = headers.map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const out = {} as Record<keyof AdaptLineItemCsvRow, number>;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
    [keyof AdaptLineItemCsvRow, string[]]
  >) {
    const idx = lower.findIndex((h) => aliases.includes(h));
    out[field] = idx;
  }
  return out;
}

export function rowFromAdaptLineItemValues(
  values: string[],
  map: Record<keyof AdaptLineItemCsvRow, number>
): AdaptLineItemCsvRow {
  const at = (key: keyof AdaptLineItemCsvRow) => {
    const i = map[key];
    if (i < 0 || i >= values.length) return null;
    const v = values[i]?.trim() ?? "";
    return v.length ? v : null;
  };
  return {
    salesInvoiceMasterId: at("salesInvoiceMasterId"),
    salesInvoiceNo: at("salesInvoiceNo"),
    itemId: at("itemId"),
    itemCode: at("itemCode"),
    itemName: at("itemName"),
    unitPrice: at("unitPrice"),
    quantity: at("quantity"),
  };
}

export function normalizeAdaptLineItem(
  row: AdaptLineItemCsvRow,
  indexInInvoice: number
): AdaptLineItemJson | null {
  const masterId = row.salesInvoiceMasterId?.trim() || null;
  if (!masterId) return null;

  const rawQty = row.quantity?.trim() ?? "";
  const qty = Number.parseFloat(rawQty);
  if (!Number.isFinite(qty)) return null;

  const rawPrice = row.unitPrice?.trim() ?? "0";
  const priceNum = Number.parseFloat(rawPrice);
  const unitPrice = Number.isFinite(priceNum) ? String(priceNum) : "0";

  const itemName = (row.itemName?.trim() || row.itemCode?.trim() || "Item").slice(0, 500);
  const itemId = row.itemId?.trim() || null;
  const itemCode = row.itemCode?.trim() || null;
  const id = itemId
    ? `${masterId}:${itemId}:${indexInInvoice}`
    : `${masterId}:row:${indexInInvoice}`;

  return {
    id,
    itemId,
    itemCode,
    itemName,
    unitPrice,
    quantity: qty,
  };
}

/** Map stored Adapt line items to Contact Master purchase-history UI shape. */
export function adaptLineItemsForPurchaseUi(
  raw: unknown
): Array<{
  id: string;
  quantity: number;
  price: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
}> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{
    id: string;
    quantity: number;
    price: string;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
  }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Partial<AdaptLineItemJson>;
    const id = typeof item.id === "string" ? item.id : null;
    const itemName = typeof item.itemName === "string" ? item.itemName : null;
    const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
    if (!id || !itemName || !Number.isFinite(quantity)) continue;
    out.push({
      id,
      quantity,
      price: typeof item.unitPrice === "string" ? item.unitPrice : String(item.unitPrice ?? "0"),
      productTitle: itemName,
      variantTitle: null,
      sku: typeof item.itemCode === "string" ? item.itemCode : null,
    });
  }
  return out;
}
