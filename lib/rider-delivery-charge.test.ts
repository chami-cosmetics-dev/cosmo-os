import { describe, expect, it } from "vitest";

import {
  normalizeShippingRuleLabelKey,
  parseRiderDeliveryChargeSheetRows,
  resolveRiderIncentiveFromRules,
  resolveRiderIncentiveMatch,
} from "@/lib/rider-delivery-charge";

describe("normalizeShippingRuleLabelKey", () => {
  it("trims and lowercases", () => {
    expect(normalizeShippingRuleLabelKey("  Battaramulla ")).toBe("battaramulla");
  });
});

describe("resolveRiderIncentiveFromRules", () => {
  it("uses rider charge from matched label, not shipping amount", () => {
    const map = new Map<string, string>([
      ["battaramulla", "300.00"],
      ["deraniyagala", "400.00"],
    ]);
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "Battaramulla",
        chargeByLabelKey: map,
      }).toString()
    ).toBe("300");
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "Deraniyagala",
        chargeByLabelKey: map,
      }).toString()
    ).toBe("400");
  });

  it("returns 0 when label missing or unmatched", () => {
    const map = new Map<string, string>([["colombo 1", "300.00"]]);
    expect(
      resolveRiderIncentiveFromRules({ shippingRuleLabel: null, chargeByLabelKey: map }).toString()
    ).toBe("0");
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "Unknown",
        chargeByLabelKey: map,
      }).toString()
    ).toBe("0");
  });
});

describe("resolveRiderIncentiveMatch", () => {
  it("flags unmatched labels", () => {
    const map = new Map<string, string>([["battaramulla", "300.00"]]);
    expect(
      resolveRiderIncentiveMatch({ shippingRuleLabel: "Battaramulla", chargeByLabelKey: map })
    ).toMatchObject({
      matched: true,
      labelKey: "battaramulla",
    });
    expect(
      resolveRiderIncentiveMatch({ shippingRuleLabel: "Unknown", chargeByLabelKey: map })
    ).toMatchObject({
      matched: false,
      labelKey: "unknown",
    });
    expect(
      resolveRiderIncentiveMatch({ shippingRuleLabel: null, chargeByLabelKey: map })
    ).toMatchObject({
      matched: false,
      labelKey: null,
    });
  });
});

describe("parseRiderDeliveryChargeSheetRows", () => {
  it("parses excel-style header rows", () => {
    const { rows, errors, skippedBlank } = parseRiderDeliveryChargeSheetRows([
      [
        "Shipping Rule Label",
        "District",
        "Shipping Account",
        "Cost Center",
        "Shipping Amount",
        "Delivery Charges for riders ",
      ],
      ["Battaramulla", "Colombo", "5307", "Main", 400, 300],
      ["Deraniyagala", "Kegalle", "5307", "Main", 500, 400],
    ]);
    expect(errors).toEqual([]);
    expect(skippedBlank).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.labelKey === "battaramulla")?.riderDeliveryCharge).toBe("300.00");
    expect(rows.find((r) => r.labelKey === "deraniyagala")?.shippingAmount).toBe("500.00");
  });

  it("skips blank rider-charge rows without hard error", () => {
    const { rows, errors, skippedBlank } = parseRiderDeliveryChargeSheetRows([
      [
        "Shipping Rule Label",
        "District",
        "Shipping Account",
        "Cost Center",
        "Shipping Amount",
        "Delivery Charges for riders ",
      ],
      ["Battaramulla", "Colombo", "5307", "Main", 400, 300],
      ["Remote Area", "Kandy", "5307", "Main", 600, ""],
      ["Also Blank", "Galle", "5307", "Main", 500, null],
    ]);
    expect(errors).toEqual([]);
    expect(skippedBlank).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.labelKey).toBe("battaramulla");
  });
});
