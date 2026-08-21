import { describe, expect, it } from "vitest";

import {
  loyaltyExternalTargets,
  missingErpLoyaltyMessage,
} from "@/lib/customer-insight/loyalty-push";
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

describe("missingErpLoyaltyMessage", () => {
  it("tells staff which ERP to create first", () => {
    expect(missingErpLoyaltyMessage(["erp2"], "0712345678")).toBe(
      "Create this customer in ERP2 first for phone 0712345678, then retry Send."
    );
  });

  it("lists multiple missing slots", () => {
    expect(missingErpLoyaltyMessage(["erp1", "erp2"], null)).toBe(
      "Create this customer in ERP1 and ERP2 first, then retry Send."
    );
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
