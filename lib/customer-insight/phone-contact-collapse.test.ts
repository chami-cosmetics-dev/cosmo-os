import { describe, expect, it } from "vitest";

import {
  addAbsorbedAmounts,
  canonicalPhonesForContact,
  collapsePhoneSubsetContacts,
  merchantKeptForPrimaryNumber,
  previousMerchantShouldClear,
  transferAbsorbedNumbers,
} from "@/lib/customer-insight/phone-contact-collapse";

describe("collapsePhoneSubsetContacts", () => {
  it("keeps the profile that has primary and previous, drops the other number's card", () => {
    const linked = {
      id: "linked",
      phoneNumber: "0771111111",
      phones: [{ phoneNumber: "0772222222" }],
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    };
    const previousOnly = {
      id: "old",
      phoneNumber: "0772222222",
      phones: [],
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const other = {
      id: "other",
      phoneNumber: "0773333333",
      phones: [],
      updatedAt: new Date("2026-02-01T00:00:00Z"),
    };

    const collapsed = collapsePhoneSubsetContacts([previousOnly, other, linked]);
    expect(collapsed.contacts.map((row) => row.id).sort()).toEqual(["linked", "other"]);
    expect(collapsed.absorbedIdsByKeeperId.get("linked")).toEqual(["old"]);
  });

  it("treats country-code and local forms as the same number", () => {
    const collapsed = collapsePhoneSubsetContacts([
      {
        id: "linked",
        phoneNumber: "0771111111",
        phones: [{ phoneNumber: "94772222222" }],
      },
      {
        id: "old",
        phoneNumber: "0772222222",
        phones: [],
      },
    ]);
    expect(collapsed.contacts.map((row) => row.id)).toEqual(["linked"]);
  });

  it("keeps the newer profile when both contacts list the same numbers", () => {
    const collapsed = collapsePhoneSubsetContacts([
      {
        id: "older",
        phoneNumber: "0771111111",
        phones: [{ phoneNumber: "0772222222" }],
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "newer",
        phoneNumber: "0772222222",
        phones: [{ phoneNumber: "0771111111" }],
        updatedAt: new Date("2026-10-01T00:00:00Z"),
      },
    ]);
    expect(collapsed.contacts.map((row) => row.id)).toEqual(["newer"]);
    expect(collapsed.absorbedIdsByKeeperId.get("newer")).toEqual(["older"]);
  });

  it("does not merge contacts that only share one number and each have another", () => {
    const collapsed = collapsePhoneSubsetContacts([
      {
        id: "a",
        phoneNumber: "0771111111",
        phones: [{ phoneNumber: "0772222222" }],
      },
      {
        id: "b",
        phoneNumber: "0772222222",
        phones: [{ phoneNumber: "0773333333" }],
      },
    ]);
    expect(collapsed.contacts.map((row) => row.id).sort()).toEqual(["a", "b"]);
    expect(collapsed.absorbedIdsByKeeperId.size).toBe(0);
  });
});

describe("canonicalPhonesForContact", () => {
  it("dedupes primary and alias formats", () => {
    expect(
      canonicalPhonesForContact({
        id: "c",
        phoneNumber: "0771111111",
        phones: [{ phoneNumber: "+94771111111" }, { phoneNumber: "0772222222" }],
      }).sort()
    ).toEqual(["0771111111", "0772222222"]);
  });
});

describe("primary merchant", () => {
  it("keeps the primary number merchant and clears a different previous merchant", () => {
    expect(merchantKeptForPrimaryNumber("Sandali")).toBe("Sandali");
    expect(previousMerchantShouldClear("Sandali", "Naduni")).toBe(true);
  });

  it("does not clear the previous card when it has the same merchant", () => {
    expect(previousMerchantShouldClear("Sandali", "sandali")).toBe(false);
    expect(previousMerchantShouldClear("Sandali", "  ")).toBe(false);
  });

  it("does not copy the previous merchant onto an unallocated primary", () => {
    expect(merchantKeptForPrimaryNumber(null)).toBeNull();
    expect(previousMerchantShouldClear(null, "Naduni")).toBe(true);
  });
});

describe("absorbed amounts", () => {
  it("adds only the absorbed contact's extra onto the keeper", () => {
    const totals = new Map([
      ["linked", 100],
      ["old", 40],
    ]);
    addAbsorbedAmounts(totals, new Map([["linked", ["old"]]]), new Map([["old", 15]]));
    expect(totals.get("linked")).toBe(115);
    expect(totals.get("old")).toBe(40);
  });

  it("moves spend off the absorbed card", () => {
    const spend = new Map([
      ["linked", 10],
      ["old", 7],
    ]);
    transferAbsorbedNumbers(spend, new Map([["linked", ["old"]]]));
    expect(spend.get("linked")).toBe(17);
    expect(spend.has("old")).toBe(false);
  });
});
