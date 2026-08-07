import { describe, expect, it } from "vitest";

import {
  insightVisibility,
  isAllocatedOwner,
  isAdminOrSuperAdmin,
  viewerMerchantLabels,
} from "@/lib/customer-insight/ownership";

describe("viewerMerchantLabels", () => {
  it("dedupes case-insensitively and skips blanks", () => {
    expect(
      viewerMerchantLabels({
        knownName: "Dinuli",
        name: "dinuli",
        email: "dinuli@example.com",
      })
    ).toEqual(["Dinuli", "dinuli@example.com"]);
  });
});

describe("isAllocatedOwner", () => {
  it("matches assignedMerchant to knownName", () => {
    expect(
      isAllocatedOwner(
        { knownName: "Dinuli", name: "Other", email: "x@y.com", roleNames: ["merchant"] },
        "Dinuli"
      )
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(
      isAllocatedOwner(
        { knownName: "Dinuli", roleNames: [] },
        "dinuli"
      )
    ).toBe(true);
  });

  it("rejects non-matching merchant", () => {
    expect(
      isAllocatedOwner(
        { knownName: "Alice", name: "Alice", email: "a@b.com", roleNames: ["merchant"] },
        "Bob"
      )
    ).toBe(false);
  });

  it("admins always own", () => {
    expect(
      isAllocatedOwner({ knownName: "Alice", roleNames: ["admin"] }, "Bob")
    ).toBe(true);
    expect(isAdminOrSuperAdmin(["super_admin"])).toBe(true);
  });
});

describe("insightVisibility", () => {
  it("returns owner vs limited", () => {
    expect(
      insightVisibility({ knownName: "A", roleNames: ["merchant"] }, "A")
    ).toBe("owner");
    expect(
      insightVisibility({ knownName: "A", roleNames: ["merchant"] }, "B")
    ).toBe("limited");
  });
});
