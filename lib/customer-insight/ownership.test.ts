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

  it("matches historical Semini label to Sanda/semini merchant", () => {
    expect(
      isAllocatedOwner(
        { knownName: "Sanda/semini", roleNames: ["merchant"] },
        "Semini"
      )
    ).toBe(true);
  });

  it("matches Kaushallya aliases to the same merchant", () => {
    expect(
      isAllocatedOwner(
        { knownName: "Kaushallya", roleNames: ["merchant"] },
        "Ms Kaushallya sewwandhi"
      )
    ).toBe(true);
    expect(
      isAllocatedOwner(
        { knownName: "Kaushallya", roleNames: ["merchant"] },
        "Kaushalya"
      )
    ).toBe(true);
  });

  it("matches Naduni aliases to the same merchant", () => {
    expect(
      isAllocatedOwner(
        { knownName: "Naduni", roleNames: ["merchant"] },
        "Rukshika Naduni"
      )
    ).toBe(true);
  });

  it("does not grant DM-General contacts to unrelated merchants", () => {
    expect(
      isAllocatedOwner(
        { knownName: "Dinuli", roleNames: ["merchant-level-01"] },
        "DM - General"
      )
    ).toBe(false);
    expect(
      isAllocatedOwner(
        { knownName: "Dinuli", roleNames: ["merchant-level-01"], couponCodes: ["MER56-Dinuli"] },
        "MER115"
      )
    ).toBe(false);
  });

  it("matches assignedMerchant to MER code from couponCodes", () => {
    expect(
      isAllocatedOwner(
        { roleNames: ["merchant"], couponCodes: ["MER56-Kaushalya"] },
        "MER56"
      )
    ).toBe(true);
    expect(
      isAllocatedOwner(
        { roleNames: ["merchant"], couponCodes: ["MER56-Kaushalya"] },
        "MER99"
      )
    ).toBe(false);
  });

  it("admins always own", () => {
    expect(
      isAllocatedOwner({ knownName: "Alice", roleNames: ["admin"] }, "Bob")
    ).toBe(true);
  });

  it("treats insight admin view as allocated owner", () => {
    expect(
      isAllocatedOwner(
        {
          knownName: "Alice",
          roleNames: ["manager"],
          permissionKeys: ["contacts.insight.admin_view"],
        },
        "Bob"
      )
    ).toBe(true);
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

  it("allows insight admin view permission", () => {
    expect(
      canFilterAllInsightContacts({
        roleNames: ["manager"],
        permissionKeys: ["contacts.insight.admin_view"],
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
