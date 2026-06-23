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
