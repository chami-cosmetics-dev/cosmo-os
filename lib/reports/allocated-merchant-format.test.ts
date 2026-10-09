import { describe, expect, it } from "vitest";

import {
  formatAllocatedMerchantExport,
  formatStoredAllocatedMerchant,
} from "@/lib/reports/allocated-merchant-format";

describe("formatAllocatedMerchantExport", () => {
  it("joins display name and MER", () => {
    expect(formatAllocatedMerchantExport("Sandali", "MER91")).toBe(
      "Sandali(MER91)"
    );
    expect(formatAllocatedMerchantExport("sandali (MER91)", "MER91")).toBe(
      "sandali(MER91)"
    );
  });

  it("keeps a name with no MER, and a MER with no name", () => {
    expect(formatAllocatedMerchantExport("Zeenath", "Zeenath")).toBe("Zeenath");
    expect(formatAllocatedMerchantExport("MER91", "MER91")).toBe("MER91");
    expect(formatAllocatedMerchantExport("", "")).toBe("");
  });

  it("splits a MER-name coupon into name(MER)", () => {
    expect(formatAllocatedMerchantExport("MER56-Dinuli", "MER56-Dinuli")).toBe(
      "Dinuli(MER56)"
    );
  });

  it("pulls MER out of a bucket label", () => {
    expect(
      formatAllocatedMerchantExport(
        "DM - General (MER115 / DM_General)",
        "DM - General"
      )
    ).toBe("DM - General(MER115)");
  });
});

describe("formatStoredAllocatedMerchant", () => {
  const roster = new Map([
    ["sandali", { value: "MER91", label: "Sandali (MER91)" }],
    ["mer91", { value: "MER91", label: "Sandali (MER91)" }],
  ]);

  it("formats either stored name or stored MER", () => {
    expect(formatStoredAllocatedMerchant("Sandali", roster)).toBe(
      "Sandali(MER91)"
    );
    expect(formatStoredAllocatedMerchant("MER91", roster)).toBe(
      "Sandali(MER91)"
    );
  });

  it("folds a longer stored name onto the short roster name", () => {
    const merchants = new Map([
      ["dulshi", { value: "MER40", label: "Dulshi (MER40)" }],
      ["mer40", { value: "MER40", label: "Dulshi (MER40)" }],
    ]);
    expect(formatStoredAllocatedMerchant("Dulshi", merchants)).toBe("Dulshi(MER40)");
    expect(formatStoredAllocatedMerchant("Dulshi Fernando", merchants)).toBe(
      "Dulshi(MER40)"
    );
    expect(formatStoredAllocatedMerchant("Dulshan", merchants)).toBe("Dulshan");
  });

  it("leaves an unknown label unchanged", () => {
    expect(formatStoredAllocatedMerchant("Dinuli", roster)).toBe("Dinuli");
    expect(formatStoredAllocatedMerchant("  ", roster)).toBe("");
  });
});
