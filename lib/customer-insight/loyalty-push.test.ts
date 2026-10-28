import { describe, expect, it } from "vitest";

import {
  loyaltyErpSlotsToCreate,
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
  it("tells staff which ERP create failed", () => {
    expect(missingErpLoyaltyMessage(["erp2"], "0712345678")).toBe(
      "Could not create this customer in ERP2 for phone 0712345678. Retry Send after ERP is reachable."
    );
  });

  it("lists multiple missing slots", () => {
    expect(missingErpLoyaltyMessage(["erp1", "erp2"], null)).toBe(
      "Could not create this customer in ERP1 and ERP2. Retry Send after ERP is reachable."
    );
  });
});

describe("loyaltyErpSlotsToCreate", () => {
  it("creates only the missing slot", () => {
    expect(
      loyaltyErpSlotsToCreate({
        instanceSlots: ["erp1", "erp2"],
        foundSlots: ["erp1"],
        missingSlots: ["erp2"],
        errorSlots: [],
      })
    ).toEqual(["erp2"]);
  });

  it("creates both when neither ERP has the customer", () => {
    expect(
      loyaltyErpSlotsToCreate({
        instanceSlots: ["erp1", "erp2"],
        foundSlots: [],
        missingSlots: ["erp1", "erp2"],
        errorSlots: [],
      })
    ).toEqual(["erp1", "erp2"]);
  });

  it("does not create when lookup failed", () => {
    expect(
      loyaltyErpSlotsToCreate({
        instanceSlots: ["erp1", "erp2"],
        foundSlots: ["erp1"],
        missingSlots: ["erp2"],
        errorSlots: ["erp2"],
      })
    ).toEqual([]);
  });

  it("does not create a slot already found", () => {
    expect(
      loyaltyErpSlotsToCreate({
        instanceSlots: ["erp1", "erp2"],
        foundSlots: ["erp1", "erp2"],
        missingSlots: [],
        errorSlots: [],
      })
    ).toEqual([]);
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
