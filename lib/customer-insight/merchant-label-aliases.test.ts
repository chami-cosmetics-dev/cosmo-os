import { describe, expect, it } from "vitest";

import {
  canonicalizeMerchantDisplayName,
  expandAssignedMerchantFilter,
  findAssignedMerchantAliasGroup,
  insightMerchantOptionLabel,
  insightMerchantOptionValue,
  isDmGeneralAssignedMerchant,
  merchantPreviewViewerFromSelection,
} from "@/lib/customer-insight/merchant-label-aliases";
import {
  hasInsightAdminView,
  insightVisibility,
} from "@/lib/customer-insight/ownership";

describe("assigned merchant aliases", () => {
  it("treats MER115 and DM - General as the same group", () => {
    expect(findAssignedMerchantAliasGroup("MER115")?.value).toBe("DM - General");
    expect(findAssignedMerchantAliasGroup("DM - General")?.value).toBe(
      "DM - General"
    );
    expect(findAssignedMerchantAliasGroup("DM_General")?.value).toBe(
      "DM - General"
    );
    expect(expandAssignedMerchantFilter("MER115")).toEqual(
      expect.arrayContaining(["DM - General", "MER115", "DM_General"])
    );
  });

  it("keeps STAFF SALES as its own bucket", () => {
    expect(findAssignedMerchantAliasGroup("STAFF SALES")?.value).toBe(
      "STAFF SALES"
    );
    expect(expandAssignedMerchantFilter("STAFF SALES")).toEqual(["STAFF SALES"]);
  });

  it("treats Semini and Sanda/semini as the same merchant", () => {
    expect(findAssignedMerchantAliasGroup("Semini")?.value).toBe("Sanda/semini");
    expect(findAssignedMerchantAliasGroup("Sanda/semini")?.value).toBe(
      "Sanda/semini"
    );
    expect(expandAssignedMerchantFilter("Semini")).toEqual(
      expect.arrayContaining(["Sanda/semini", "Semini"])
    );
  });

  it("canonicalizes duplicate merchant display names", () => {
    expect(canonicalizeMerchantDisplayName("Ms Kaushallya sewwandhi")).toBe(
      "Kaushallya"
    );
    expect(canonicalizeMerchantDisplayName("Kaushalya")).toBe("Kaushallya");
    expect(canonicalizeMerchantDisplayName("Rukshika Naduni")).toBe("Naduni");
    expect(canonicalizeMerchantDisplayName("Semini")).toBe("Sanda/semini");
  });

  it("detects DM-General assigned merchant labels", () => {
    expect(isDmGeneralAssignedMerchant("DM - General")).toBe(true);
    expect(isDmGeneralAssignedMerchant("MER115")).toBe(true);
    expect(isDmGeneralAssignedMerchant("DM-General")).toBe(true);
    expect(isDmGeneralAssignedMerchant("Dinuli")).toBe(false);
  });

  it("builds clear merchant option value/label from MER + knownName", () => {
    expect(
      insightMerchantOptionValue({
        knownName: "sandali",
        name: "Sadali Navodya",
        couponCodes: ["MER91-Sandali", "MER91"],
      })
    ).toBe("MER91");
    expect(
      insightMerchantOptionLabel({
        knownName: "sandali",
        name: "Sadali Navodya",
        couponCodes: ["MER91-Sandali", "MER91"],
      })
    ).toBe("sandali (MER91)");
  });

  it("builds preview viewer without admin privileges", () => {
    const fromUser = merchantPreviewViewerFromSelection({
      selected: "MER91",
      merchantUser: {
        knownName: "sandali",
        name: "Sadali Navodya",
        email: "s@example.com",
        couponCodes: ["MER91"],
      },
    });
    expect(fromUser.roleNames).toEqual(["merchant"]);
    expect(fromUser.permissionKeys).toEqual([]);
    expect(fromUser.knownName).toBe("sandali");
    expect(fromUser.couponCodes).toEqual(["MER91"]);

    const fromBucket = merchantPreviewViewerFromSelection({
      selected: "DM - General",
      aliasLabels: ["DM - General", "MER115"],
    });
    expect(fromBucket.knownName).toBe("DM - General");
    expect(fromBucket.roleNames).toEqual(["merchant"]);
    expect(hasInsightAdminView(fromBucket)).toBe(false);
    expect(insightVisibility(fromBucket, "DM - General")).toBe("owner");
    expect(insightVisibility(fromBucket, "Other Merchant")).toBe("limited");
  });

  it("falls back to knownName when merchant has no MER", () => {
    expect(
      insightMerchantOptionValue({
        knownName: "Mahesha",
        couponCodes: [],
      })
    ).toBe("Mahesha");
    expect(
      insightMerchantOptionLabel({
        knownName: "Mahesha",
        couponCodes: [],
      })
    ).toBe("Mahesha");
  });
});
