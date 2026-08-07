import { describe, expect, it } from "vitest";

import {
  canFilterAllInsightContacts,
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

describe("canFilterAllInsightContacts", () => {
  it("allows admins", () => {
    expect(canFilterAllInsightContacts({ roleNames: ["admin"] })).toBe(true);
    expect(canFilterAllInsightContacts({ roleNames: ["super_admin"] })).toBe(true);
  });

  it("allows Contact Master / allocation manage permission", () => {
    expect(
      canFilterAllInsightContacts({
        roleNames: ["viewer"],
        permissionKeys: ["contacts.master.read"],
      })
    ).toBe(true);
    expect(
      canFilterAllInsightContacts({
        roleNames: ["merchant"],
        permissionKeys: ["contacts.allocation.manage"],
      })
    ).toBe(true);
  });

  it("denies merchants without company-wide contact permission", () => {
    expect(
      canFilterAllInsightContacts({
        roleNames: ["merchant"],
        permissionKeys: ["contacts.insight.read"],
      })
    ).toBe(false);
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
