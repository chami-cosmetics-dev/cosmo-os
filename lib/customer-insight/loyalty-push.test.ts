import { describe, expect, it } from "vitest";

import { loyaltyExternalTargets } from "@/lib/customer-insight/loyalty-push";
import { mergeShopifyLoyaltyTags } from "@/lib/shopify-admin";

describe("loyaltyExternalTargets", () => {
  it("maps gold to ERP Gold and Shopify loyalty customer", () => {
    expect(loyaltyExternalTargets("gold")).toEqual({
      erpGroup: "Gold",
      shopifyTag: "loyalty customer",
      label: "Gold",
    });
  });

  it("maps platinum to ERP Platinum and Shopify loyalty customer G2", () => {
    expect(loyaltyExternalTargets("platinum")).toEqual({
      erpGroup: "Platinum",
      shopifyTag: "loyalty customer G2",
      label: "Platinum",
    });
  });
});

describe("mergeShopifyLoyaltyTags", () => {
  it("adds gold tag and drops platinum tag", () => {
    expect(mergeShopifyLoyaltyTags("vip, loyalty customer G2", "gold")).toBe(
      "vip, loyalty customer"
    );
  });

  it("adds G2 and drops gold tag", () => {
    expect(mergeShopifyLoyaltyTags("loyalty customer, vip", "platinum")).toBe(
      "vip, loyalty customer G2"
    );
  });
});
