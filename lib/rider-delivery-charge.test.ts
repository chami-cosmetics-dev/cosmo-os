import { describe, expect, it } from "vitest";

import {
  extractOrderShippingCity,
  isExcludedFromRiderIncentiveLabel,
  isZoneShippingLabelKey,
  normalizeShippingRuleLabelKey,
  parseRiderDeliveryChargeSheetRows,
  parseRiderDeliveryZoneMembers,
  resolveRiderIncentiveFromRules,
  resolveRiderIncentiveMatch,
  shippingRuleLabelLookupKeys,
  suggestRiderDistrictsFromAddress,
} from "@/lib/rider-delivery-charge";

describe("normalizeShippingRuleLabelKey", () => {
  it("trims and lowercases", () => {
    expect(normalizeShippingRuleLabelKey("  Battaramulla ")).toBe("battaramulla");
  });

  it("inserts space before digits", () => {
    expect(normalizeShippingRuleLabelKey("Colombo2")).toBe("colombo 2");
    expect(normalizeShippingRuleLabelKey("Colombo10")).toBe("colombo 10");
  });
});

describe("shippingRuleLabelLookupKeys", () => {
  it("peels trailing dash segments for ERP DTD labels", () => {
    expect(shippingRuleLabelLookupKeys("Colombo 2 - DTD")).toEqual([
      "colombo 2 - dtd",
      "colombo 2",
    ]);
    expect(shippingRuleLabelLookupKeys("Ja-Ela - DTD")).toEqual(["ja-ela - dtd", "ja-ela"]);
    expect(shippingRuleLabelLookupKeys("Pelawatta - Colombo")).toEqual(["pelawatta - colombo"]);
    expect(shippingRuleLabelLookupKeys("Pelawatta - PEVI")).toEqual(["pelawatta - pevi", "pelawatta"]);
  });
});

describe("isZoneShippingLabelKey", () => {
  it("detects Zone A/B style keys", () => {
    expect(isZoneShippingLabelKey("zone a")).toBe(true);
    expect(isZoneShippingLabelKey("zone b")).toBe(true);
    expect(isZoneShippingLabelKey("colombo 2")).toBe(false);
  });
});

describe("extractOrderShippingCity", () => {
  it("reads shippingAddress.city then rawPayload.shipping_address.city", () => {
    expect(extractOrderShippingCity({ shippingAddress: { city: "Colombo 2" } })).toBe("Colombo 2");
    expect(
      extractOrderShippingCity({
        rawPayload: { shipping_address: { city: "Negombo" } },
      })
    ).toBe("Negombo");
  });
});

describe("parseRiderDeliveryZoneMembers", () => {
  it("parses Zone Name → City and ignores amounts", () => {
    const parsed = parseRiderDeliveryZoneMembers([
      [
        "District",
        "Zone Name",
        "City Name",
        "Delivery Price",
        "Delivery Person Charges",
      ],
      ["Colombo", "Zone A", "Colombo 2", 240, 180],
      ["Colombo", "Zone A", "Bambalapitiya", 999, 999],
      ["Gampaha", "Zone B", "Negombo", 400, 350],
    ]);
    expect(parsed.format).toBe("final-working");
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.find((r) => r.districtLabelKey === "colombo 2")).toMatchObject({
      zoneKey: "zone a",
      zoneLabel: "Zone A",
      districtLabel: "Colombo 2",
    });
    expect(parsed.rows.every((r) => !("riderDeliveryCharge" in r))).toBe(true);
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

  it("matches Kohilawatta - PEVI to sheet Kohilawatta-Colombo", () => {
    const map = new Map<string, string>([
      ["kohilawatta-colombo", "400.00"],
      ["ambathale", "400.00"],
      ["ja-ela", "400.00"],
    ]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Kohilawatta - PEVI",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: true,
      labelKey: "kohilawatta-colombo",
      amount: expect.anything(),
    });
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "Kohilawatta - PEVI",
        chargeByLabelKey: map,
      }).toString()
    ).toBe("400");
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Ja-Ela - DTD",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: true,
      labelKey: "ja-ela",
    });
  });

  it("keeps Pelawatta separate from Pelawatta - Colombo", () => {
    const map = new Map<string, string>([
      ["pelawatta", "180.00"],
      ["pelawatta - colombo", "300.00"],
      ["pelawatta - kalutara", "400.00"],
    ]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Pelawatta - PEVI",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: true,
      labelKey: "pelawatta",
    });
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "Pelawatta - Colombo",
        chargeByLabelKey: map,
      }).toString()
    ).toBe("300");
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Pelawatta - Colombo",
        chargeByLabelKey: new Map<string, string>([["pelawatta", "180.00"]]),
      })
    ).toMatchObject({
      matched: false,
      labelKey: "pelawatta - colombo",
    });
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Pelawatte",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: false,
      labelKey: "pelawatte",
    });
  });

  it("does not guess when two district rows share the city", () => {
    const map = new Map<string, string>([
      ["moragala - gampaha", "400.00"],
      ["moragala - kalutara", "400.00"],
    ]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Moragala - PEVI",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: false,
      labelKey: "moragala - pevi",
    });
  });

  it("matches Colombo 2 - DTD to sheet Colombo 2", () => {
    const map = new Map<string, string>([
      ["colombo 2", "300.00"],
      ["battaramulla", "350.00"],
    ]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Colombo 2 - DTD",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: true,
      labelKey: "colombo 2",
    });
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "Battaramulla - DTD",
        chargeByLabelKey: map,
      }).toString()
    ).toBe("350");
  });

  it("matches Zone A + city Colombo 2 to charge for colombo 2", () => {
    const map = new Map<string, string>([
      ["colombo 2", "300.00"],
      ["battaramulla", "350.00"],
    ]);
    const zoneMembersByZone = new Map<string, Set<string>>([
      ["zone a", new Set(["colombo 2", "bambalapitiya"])],
    ]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Zone A",
        shippingCity: "Colombo 2",
        chargeByLabelKey: map,
        zoneMembersByZone,
      })
    ).toMatchObject({
      matched: true,
      labelKey: "colombo 2",
    });
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "Zone A",
        shippingCity: "Colombo 2",
        chargeByLabelKey: map,
        zoneMembersByZone,
      }).toString()
    ).toBe("300");
  });

  it("excludes Pick Up and STAFFDC from incentive (not unmatched)", () => {
    const map = new Map<string, string>([
      ["nugegoda", "300.00"],
      ["delgoda", "400.00"],
    ]);
    expect(isExcludedFromRiderIncentiveLabel("Pick Up")).toBe(true);
    expect(isExcludedFromRiderIncentiveLabel("FREESHIP")).toBe(false);
    expect(isExcludedFromRiderIncentiveLabel("STAFFDC")).toBe(true);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Pick Up",
        shippingCity: "Nugegoda",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: true,
      excludedFromIncentive: true,
      amount: expect.anything(),
    });
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "Pick Up",
        shippingCity: "delgoda",
        chargeByLabelKey: map,
      }).toString()
    ).toBe("0");
  });

  it("pays FREESHIP from the delivery district", () => {
    const map = new Map<string, string>([
      ["nugegoda", "300.00"],
      ["delgoda", "400.00"],
    ]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "FREESHIP",
        shippingCity: "Nugegoda",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: true,
      labelKey: "nugegoda",
    });
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "free shipping",
        shippingCity: "delgoda",
        chargeByLabelKey: map,
      }).toString()
    ).toBe("400");
  });

  it("matches ERP Delivery + city mattakkuliya to district charge", () => {
    const map = new Map<string, string>([["mattakkuliya", "300.00"]]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Delivery",
        shippingCity: "mattakkuliya",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: true,
      labelKey: "mattakkuliya",
    });
  });

  it("matches missing label via shipping city when in charge sheet", () => {
    const map = new Map<string, string>([["nugegoda", "300.00"]]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: null,
        shippingCity: "Nugegoda",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: true,
      labelKey: "nugegoda",
    });
  });

  it("uses manual district key over unmatched auto label", () => {
    const map = new Map<string, string>([["mattakkuliya", "300.00"]]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Delivery",
        shippingCity: "Sri Lanka",
        chargeByLabelKey: map,
        manualIncentiveLabelKey: "Mattakkuliya",
      })
    ).toMatchObject({
      matched: true,
      labelKey: "mattakkuliya",
      manualOverride: true,
    });
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: null,
        shippingCity: null,
        chargeByLabelKey: map,
        manualIncentiveLabelKey: "mattakkuliya",
      }).toString()
    ).toBe("300");
  });

  it("uses a typed manual amount over an unmatched label", () => {
    const map = new Map<string, string>([["mattakkuliya", "300.00"]]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Delivery",
        shippingCity: "Sri Lanka",
        chargeByLabelKey: map,
        manualIncentiveAmount: "450.50",
      })
    ).toMatchObject({
      matched: true,
      manualOverride: true,
      labelKey: null,
    });
    expect(
      resolveRiderIncentiveFromRules({
        shippingRuleLabel: "Delivery",
        chargeByLabelKey: map,
        manualIncentiveAmount: "450.50",
      }).toString()
    ).toBe("450.5");
  });

  it("keeps Pick Up excluded even when manual key present", () => {
    const map = new Map<string, string>([["nugegoda", "300.00"]]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Pick Up",
        manualIncentiveLabelKey: "nugegoda",
        chargeByLabelKey: map,
      })
    ).toMatchObject({
      matched: true,
      excludedFromIncentive: true,
    });
  });

  it("suggests Mattakkuliya from address text", () => {
    const options = [
      { labelKey: "colombo 1", label: "Colombo 1", riderDeliveryCharge: "300.00" },
      { labelKey: "mattakkuliya", label: "Mattakkuliya", riderDeliveryCharge: "300.00" },
      { labelKey: "nugegoda", label: "Nugegoda", riderDeliveryCharge: "300.00" },
    ];
    const suggested = suggestRiderDistrictsFromAddress({
      addressText: "No 12, Main Rd, Mattakkuliya",
      city: "Sri Lanka",
      options,
      limit: 3,
    });
    expect(suggested[0]?.labelKey).toBe("mattakkuliya");
  });

  it("falls back to city→charge when city not listed in zone members", () => {
    const map = new Map<string, string>([["negombo", "280.00"]]);
    const zoneMembersByZone = new Map<string, Set<string>>([
      ["zone a", new Set(["colombo 2"])],
    ]);
    expect(
      resolveRiderIncentiveMatch({
        shippingRuleLabel: "Zone A",
        shippingCity: "Negombo",
        chargeByLabelKey: map,
        zoneMembersByZone,
      })
    ).toMatchObject({
      matched: true,
      labelKey: "negombo",
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
