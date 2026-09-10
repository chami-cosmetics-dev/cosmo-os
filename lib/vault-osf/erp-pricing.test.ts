import { describe, expect, it } from "vitest";

import {
  applyDiscount,
  collectStandardSellingCandidates,
  isItemCodeSellingRule,
  mergePriceCandidates,
  resolveDiscountPercent,
  type ItemPriceRow,
  type PricingRuleRow,
} from "@/lib/vault-osf/erp-pricing";

const itemRule = (over: Partial<PricingRuleRow> = {}): PricingRuleRow => ({
  apply_on: "Item Code",
  selling: 1,
  coupon_code_based: 0,
  disable: 0,
  rate_or_discount: "Discount Percentage",
  discount_percentage: 10,
  item_code: "NW004-2",
  valid_from: "2026-09-03",
  valid_upto: "2026-09-30",
  ...over,
});

describe("vault OSF pricing rules", () => {
  it("applies item-code percent to MRP (NW004-2 10%)", () => {
    expect(applyDiscount(9500, 10).discountedPrice).toBe(8550);
    expect(resolveDiscountPercent([itemRule()], "NW004-2", "2026-09-07")).toBe(10);
  });

  it("ignores transaction, coupon, group, brand, disabled, expired", () => {
    expect(isItemCodeSellingRule(itemRule({ apply_on: "Transaction" }))).toBe(false);
    expect(isItemCodeSellingRule(itemRule({ apply_on: "Item Group" }))).toBe(false);
    expect(isItemCodeSellingRule(itemRule({ coupon_code_based: 1 }))).toBe(false);
    expect(resolveDiscountPercent([itemRule({ disable: 1 })], "NW004-2", "2026-09-07")).toBeNull();
    expect(resolveDiscountPercent([itemRule()], "NW004-2", "2026-08-01")).toBeNull();
    expect(applyDiscount(9500, null).discountedPrice).toBeNull();
  });

  it("takes the larger discount when two item-code rules overlap", () => {
    const rules = [itemRule({ discount_percentage: 10 }), itemRule({ discount_percentage: 15 })];
    expect(resolveDiscountPercent(rules, "NW004-2", "2026-09-07")).toBe(15);
  });
});

const priceRow = (over: Partial<ItemPriceRow> = {}): ItemPriceRow => ({
  item_code: "NW023-1",
  price_list_rate: 10900,
  valid_from: null,
  valid_upto: null,
  modified: "2026-07-01 10:00:00",
  customer: null,
  ...over,
});

describe("vault OSF MRP selection", () => {
  it("honours the Item Price validity window", () => {
    const rows = [
      priceRow({ price_list_rate: 6360, valid_from: "2026-07-06" }),
      priceRow({ price_list_rate: 9999, valid_from: "2026-10-01" }),
    ];
    const map = collectStandardSellingCandidates(rows, "2026-09-09");
    expect(map.get("NW023-1")?.rate).toBe(6360);
    expect(collectStandardSellingCandidates(
      [priceRow({ valid_upto: "2026-08-01" })],
      "2026-09-09",
    ).size).toBe(0);
  });

  it("takes the newest valid_from, not page order (JS012-1)", () => {
    const rows = [
      priceRow({ item_code: "JS012-1", price_list_rate: 12950, valid_from: "2026-07-31" }),
      priceRow({ item_code: "JS012-1", price_list_rate: 9950, valid_from: null }),
    ];
    expect(collectStandardSellingCandidates(rows, "2026-09-09").get("JS012-1")?.rate).toBe(12950);
  });

  it("drops zero and customer-specific rates", () => {
    const rows = [
      priceRow({ price_list_rate: 0, valid_from: "2026-07-28" }),
      priceRow({ price_list_rate: 8000, customer: "Walk In" }),
    ];
    expect(collectStandardSellingCandidates(rows, "2026-09-09").size).toBe(0);
  });

  it("merges instances so an ERP2-only price is not lost (CG003-1)", () => {
    const erp1 = collectStandardSellingCandidates([], "2026-09-09");
    const erp2 = collectStandardSellingCandidates(
      [priceRow({ item_code: "CG003-1", price_list_rate: 9500 })],
      "2026-09-09",
    );
    expect(mergePriceCandidates(erp1, erp2).get("CG003-1")?.rate).toBe(9500);
  });

  it("breaks a valid_from tie on modified (NW023-1 across instances)", () => {
    const erp1 = collectStandardSellingCandidates(
      [priceRow({ price_list_rate: 10900, modified: "2026-07-01 10:00:00" })],
      "2026-09-09",
    );
    const erp2 = collectStandardSellingCandidates(
      [priceRow({ price_list_rate: 18500, modified: "2026-08-20 09:00:00" })],
      "2026-09-09",
    );
    expect(mergePriceCandidates(erp1, erp2).get("NW023-1")?.rate).toBe(18500);
  });
});
