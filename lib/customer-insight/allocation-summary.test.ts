import { describe, expect, it } from "vitest";

import {
  resolveAllocatedMerchant,
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
