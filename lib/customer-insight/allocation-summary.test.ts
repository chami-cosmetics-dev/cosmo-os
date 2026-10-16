import { describe, expect, it } from "vitest";

import {
  buildPurchaseChannelSplit,
  merCodeFromDiscountCodes,
  resolveOrderMerchantKey,
  pickLastPurchaseSource,
  resolveAllocatedMerchant,
  resolveMerchantKeyFromLabels,
  uniqueContactPhones,
} from "@/lib/customer-insight/allocation-summary";

describe("uniqueContactPhones", () => {
  it("prefers primary then unique aliases", () => {
    expect(
      uniqueContactPhones("0771234567", [
        { phoneNumber: "0771234567" },
        { phoneNumber: "0719990000" },
        { phoneNumber: "  " },
      ])
    ).toEqual(["0771234567", "0719990000"]);
  });

  it("falls back to alias when primary empty", () => {
    expect(uniqueContactPhones(null, [{ phoneNumber: "0711111111" }])).toEqual([
      "0711111111",
    ]);
  });
});

describe("resolveAllocatedMerchant", () => {
  it("maps alias labels onto roster merchant", () => {
    const aliasToRoster = new Map([
      ["sandali", { value: "MER91", label: "Sandali" }],
    ]);
    expect(resolveAllocatedMerchant("Sandali", aliasToRoster)).toEqual({
      value: "MER91",
      label: "Sandali",
    });
  });

  it("keeps unmatched labels as their own merchant", () => {
    expect(resolveAllocatedMerchant("Zeenath", new Map())).toEqual({
      value: "Zeenath",
      label: "Zeenath",
    });
  });
});

describe("buildPurchaseChannelSplit", () => {
  it("is 100% merchant when the only purchase was through the merchant", () => {
    expect(buildPurchaseChannelSplit(1, 0)).toEqual({
      byMerchant: 1,
      byOther: 0,
      byMerchantPercent: 100,
      byOtherPercent: 0,
    });
  });

  it("always adds up to 100 after rounding", () => {
    const split = buildPurchaseChannelSplit(1, 2);
    expect(split.byMerchantPercent).toBe(33);
    expect(split.byOtherPercent).toBe(67);
  });

  it("is 0 / 0 with no purchases", () => {
    expect(buildPurchaseChannelSplit(0, 0)).toMatchObject({
      byMerchantPercent: 0,
      byOtherPercent: 0,
    });
  });
});

describe("resolveMerchantKeyFromLabels", () => {
  const aliasToRoster = new Map([
    ["mer91", { value: "MER91", label: "Sandali (MER91)" }],
    ["sandali", { value: "MER91", label: "Sandali (MER91)" }],
  ]);

  it("maps any matching label onto the roster value", () => {
    expect(
      resolveMerchantKeyFromLabels([null, "Sandali", "x@y.com"], aliasToRoster)
    ).toBe("mer91");
  });

  it("falls back to the first label when off-roster", () => {
    expect(resolveMerchantKeyFromLabels([" Zeenath "], aliasToRoster)).toBe(
      "zeenath"
    );
  });

  it("returns null when there is no label", () => {
    expect(resolveMerchantKeyFromLabels([null, " "], aliasToRoster)).toBeNull();
  });
});

describe("pickLastPurchaseSource", () => {
  it("picks the sale closest to lastPurchaseAt", () => {
    const last = new Date("2026-10-10T08:00:00Z");
    expect(
      pickLastPurchaseSource(
        [
          { at: new Date("2026-10-01T08:00:00Z"), merchantKey: "mer90" },
          { at: new Date("2026-10-10T02:30:00Z"), merchantKey: null },
        ],
        last
      )
    ).toEqual({ at: new Date("2026-10-10T02:30:00Z"), merchantKey: null });
  });

  it("returns null with no candidates", () => {
    expect(pickLastPurchaseSource([], new Date())).toBeNull();
  });
});

describe("merCodeFromDiscountCodes", () => {
  it("finds the MER code among ERP { code } rows", () => {
    expect(
      merCodeFromDiscountCodes([{ code: "SAVE10" }, { code: "MER101-Nimesha", amount: 0 }])
    ).toBe("MER101");
  });

  it("handles plain string rows and missing codes", () => {
    expect(merCodeFromDiscountCodes(["mer 90"])).toBe("MER90");
    expect(merCodeFromDiscountCodes([{ code: "SAVE10" }])).toBeNull();
    expect(merCodeFromDiscountCodes(null)).toBeNull();
  });
});

describe("resolveOrderMerchantKey", () => {
  const aliasToRoster = new Map([
    ["mer101", { value: "MER101", label: "Nimesha (MER101)" }],
    ["cashier", { value: "MER5", label: "Cashier (MER5)" }],
  ]);
  const cashier = { knownName: "Cashier", name: null, email: null, couponCodes: [] };

  it("prefers the MER coupon over the POS cashier", () => {
    expect(
      resolveOrderMerchantKey(
        { discountCodes: [{ code: "MER101", amount: 0 }], assignedMerchant: cashier },
        aliasToRoster
      )
    ).toBe("mer101");
  });

  it("falls back to the assigned merchant without a MER coupon", () => {
    expect(
      resolveOrderMerchantKey({ discountCodes: null, assignedMerchant: cashier }, aliasToRoster)
    ).toBe("mer5");
  });

  it("is null with no coupon and no merchant", () => {
    expect(
      resolveOrderMerchantKey({ discountCodes: [], assignedMerchant: null }, aliasToRoster)
    ).toBeNull();
  });
});
