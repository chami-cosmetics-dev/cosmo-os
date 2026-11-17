import { describe, expect, it } from "vitest";

import {
  buildLoyaltyWishPlaceholderVars,
  renderSmsTemplatePlaceholders,
} from "@/lib/sms-templates/render";

describe("renderSmsTemplatePlaceholders", () => {
  it("replaces known placeholders", () => {
    const out = renderSmsTemplatePlaceholders(
      "Hi {{customerName}}, {{discountPercent}}% — call {{merchantPhone}}",
      buildLoyaltyWishPlaceholderVars({
        customerName: "Ayesha",
        tier: "Gold",
        discountPercent: 10,
        merchantName: "Maheshi",
        merchantPhone: "0771",
        officePhone: "011",
      }),
    );
    expect(out).toBe("Hi Ayesha, 10% — call 0771");
  });

  it("leaves unknown placeholders intact", () => {
    expect(renderSmsTemplatePlaceholders("x {{unknown}} y", {})).toBe("x {{unknown}} y");
  });

  it("falls back customer name to Customer", () => {
    const vars = buildLoyaltyWishPlaceholderVars({
      customerName: "  ",
      tier: "Gold",
      discountPercent: 10,
      merchantName: "",
      merchantPhone: "",
      officePhone: "",
    });
    expect(vars.customerName).toBe("Customer");
  });
});
