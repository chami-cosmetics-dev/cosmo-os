import type { ShopifyOrderWebhookPayload } from "@/lib/validation/shopify-order";

export type ErpSalesInvoiceItem = {
  item_code: string;
  item_name?: string;
  qty: number;
  rate?: number;
  warehouse: string;
  price_list_rate?: number;
};

type ShopifyLineItem = ShopifyOrderWebhookPayload["line_items"][number];

export type ErpShopifyItemRateMode = "net" | "list" | "erp_price_list";

export function shopifyLineItemUnitDiscount(li: ShopifyLineItem): number {
  const row = li as Record<string, unknown>;
  const totalDiscount = parseFloat(String(row.total_discount ?? "0"));
  if (!Number.isFinite(totalDiscount) || totalDiscount <= 0 || li.quantity <= 0) return 0;
  return totalDiscount / li.quantity;
}

/** Pre-discount unit rate from Shopify line item (`price` + per-unit line discount). */
export function shopifyLineItemListRate(li: ShopifyLineItem): number {
  const netRate = parseFloat(li.price);
  const unitDiscount = shopifyLineItemUnitDiscount(li);
  if (unitDiscount <= 0) return netRate;
  return parseFloat((netRate + unitDiscount).toFixed(2));
}

export function buildErpItemsFromShopifyLineItems(
  lineItems: ShopifyLineItem[],
  warehouse: string,
  rateMode: ErpShopifyItemRateMode,
): ErpSalesInvoiceItem[] {
  return lineItems.map((li) => {
    const netRate = parseFloat(li.price);
    const listRate = shopifyLineItemListRate(li);
    const item: ErpSalesInvoiceItem = {
      item_code: li.sku ?? String(li.variant_id ?? li.id),
      item_name: li.title ?? undefined,
      qty: li.quantity,
      warehouse,
    };

    if (rateMode === "erp_price_list") {
      return item;
    }

    const useList = rateMode === "list" && listRate > netRate;
    item.rate = useList ? listRate : netRate;
    if (useList) item.price_list_rate = listRate;
    return item;
  });
}

export function sumErpInvoiceItemsTotal(
  items: ErpSalesInvoiceItem[],
  extraShipping = 0,
): number {
  return items.reduce((sum, li) => sum + (li.rate ?? 0) * li.qty, 0) + extraShipping;
}

/**
 * Bake order-level Shopify discount into product line rates.
 *
 * Cosmetics ERP Server Script "Validate Coupon Payment Type" zeros header
 * `discount_amount` on normal SIs when `coupon_code` is empty (Cosmo omits
 * coupon_code on create). Header discount therefore does not survive Before Save.
 * Putting the gap into rates keeps SI grand_total = Shopify total.
 */
export function applyOrderDiscountToErpItemRates(
  items: ErpSalesInvoiceItem[],
  discountAmount: number,
  options?: { skipItemCodes?: Iterable<string> },
): ErpSalesInvoiceItem[] {
  const discount = parseFloat(Number(discountAmount).toFixed(2));
  if (!(discount > 0)) return items.map((row) => ({ ...row }));

  const skip = new Set(
    [...(options?.skipItemCodes ?? [])].map((code) => code.trim()).filter(Boolean),
  );

  const eligibleIdx: number[] = [];
  let base = 0;
  items.forEach((row, idx) => {
    if (skip.has((row.item_code ?? "").trim())) return;
    const amount = (row.rate ?? 0) * row.qty;
    if (!(amount > 0) || !(row.qty > 0)) return;
    eligibleIdx.push(idx);
    base += amount;
  });
  if (!(base > 0) || eligibleIdx.length === 0) return items.map((row) => ({ ...row }));

  const out = items.map((row) => ({ ...row }));
  let allocated = 0;
  for (let i = 0; i < eligibleIdx.length; i += 1) {
    const idx = eligibleIdx[i]!;
    const row = out[idx]!;
    const amount = (row.rate ?? 0) * row.qty;
    const isLast = i === eligibleIdx.length - 1;
    const share = isLast
      ? parseFloat((discount - allocated).toFixed(2))
      : parseFloat(((amount / base) * discount).toFixed(2));
    allocated = parseFloat((allocated + share).toFixed(2));
    const newAmount = Math.max(0, parseFloat((amount - share).toFixed(2)));
    row.rate = parseFloat((newAmount / row.qty).toFixed(2));
  }
  return out;
}
