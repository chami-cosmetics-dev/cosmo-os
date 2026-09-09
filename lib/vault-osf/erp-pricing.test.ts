import { describe, expect, it } from "vitest";

import {
  applyDiscount,
  isItemCodeSellingRule,
  resolveDiscountPercent,
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
