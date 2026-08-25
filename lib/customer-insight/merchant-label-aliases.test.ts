import { describe, expect, it } from "vitest";

import {
  expandAssignedMerchantFilter,
  findAssignedMerchantAliasGroup,
  insightMerchantOptionLabel,
  insightMerchantOptionValue,
} from "@/lib/customer-insight/merchant-label-aliases";

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
