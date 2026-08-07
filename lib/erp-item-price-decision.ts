import { STANDARD_SELLING_PRICE_LIST } from "@/lib/sticker-lwk-erp-price-list";

export type ErpItemPriceApplyDecision =
  | { apply: false; reason: "not_standard_selling" | "not_selling" | "invalid_rate" | "missing_sku" }
  | { apply: true; sku: string; rate: string };

type ErpItemPriceDecisionInput = {
  item_code: string;
  price_list: string;
  price_list_rate: number;
  selling?: number | null;
  buying?: number | null;
};

/**
 * Decide whether an ERP Item Price row should overwrite Cosmo ProductItem.price.
 * Only Standard Selling rates are written — never invents or transforms the rate.
 */
export function decideErpItemPriceProductSync(
  data: ErpItemPriceDecisionInput,
  standardSellingList: string = STANDARD_SELLING_PRICE_LIST,
): ErpItemPriceApplyDecision {
  const sku = data.item_code?.trim() ?? "";
  if (!sku) return { apply: false, reason: "missing_sku" };

  const priceList = data.price_list?.trim() ?? "";
  if (priceList.toLowerCase() !== standardSellingList.toLowerCase()) {
    return { apply: false, reason: "not_standard_selling" };
  }

  // Prefer explicit selling=1; if unset, still accept Standard Selling (ERP list is selling).
  if (data.selling === 0 || data.buying === 1) {
    return { apply: false, reason: "not_selling" };
  }

  const rate = Number(data.price_list_rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { apply: false, reason: "invalid_rate" };
  }

  return { apply: true, sku, rate: rate.toFixed(2) };
}
