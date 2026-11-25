import { describe, expect, it } from "vitest";

import {
  BUILTIN_SMS_TEMPLATES,
  discountPercentForTier,
  isValidSmsTemplateKey,
  purposeForLoyaltyTier,
} from "@/lib/sms-templates/catalog";
import { mergeSmsTemplates } from "@/lib/sms-templates/merge";

describe("sms template catalog", () => {
  it("ships four builtin wish templates", () => {
    expect(BUILTIN_SMS_TEMPLATES).toHaveLength(4);
    expect(BUILTIN_SMS_TEMPLATES.filter((t) => t.purpose === "gold_wish")).toHaveLength(2);
    expect(BUILTIN_SMS_TEMPLATES.filter((t) => t.purpose === "platinum_wish")).toHaveLength(2);
  });

  it("validates keys", () => {
    expect(isValidSmsTemplateKey("loyalty_gold_wish_1")).toBe(true);
    expect(isValidSmsTemplateKey("1bad")).toBe(false);
    expect(isValidSmsTemplateKey("Bad_Case")).toBe(false);
  });

  it("maps tier helpers", () => {
    expect(purposeForLoyaltyTier("gold")).toBe("gold_wish");
    expect(purposeForLoyaltyTier("platinum")).toBe("platinum_wish");
    expect(discountPercentForTier("gold")).toBe(10);
    expect(discountPercentForTier("platinum")).toBe(15);
  });

  it("merge returns builtins when DB empty", () => {
    const merged = mergeSmsTemplates([]);
    expect(merged).toHaveLength(4);
    expect(merged.every((t) => t.builtin && !t.saved)).toBe(true);
    expect(merged.every((t) => t.body.includes("discountPercent") || t.body.includes("%"))).toBe(
      true,
    );
  });

  it("merge overlays saved body", () => {
    const merged = mergeSmsTemplates([
      {
        id: "1",
        key: "loyalty_gold_wish_1",
        name: "Custom Gold",
        purpose: "gold_wish",
        body: "Custom {{customerName}}",
        active: true,
      },
    ]);
    const row = merged.find((t) => t.key === "loyalty_gold_wish_1");
    expect(row?.body).toBe("Custom {{customerName}}");
    expect(row?.name).toBe("Custom Gold");
    expect(row?.saved).toBe(true);
    expect(merged).toHaveLength(4);
  });
});
