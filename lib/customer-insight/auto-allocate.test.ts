import { describe, expect, it } from "vitest";

import {
  getMerchantDisplayName,
  resolveAutoAllocateMerchant,
} from "@/lib/customer-insight/auto-allocate";

describe("getMerchantDisplayName", () => {
  it("prefers knownName then name then email", () => {
    expect(
      getMerchantDisplayName({
        knownName: "Dinuli",
        name: "D Name",
        email: "d@x.com",
      })
    ).toBe("Dinuli");
    expect(getMerchantDisplayName({ name: "D Name", email: "d@x.com" })).toBe(
      "D Name"
    );
    expect(getMerchantDisplayName({ email: "d@x.com" })).toBe("d@x.com");
    expect(getMerchantDisplayName({})).toBeNull();
  });
});

describe("resolveAutoAllocateMerchant", () => {
  it("fills empty assignment", () => {
    expect(
      resolveAutoAllocateMerchant({
        assignedMerchant: null,
        purchaseMerchantLabel: "Dinuli",
      })
    ).toBe("Dinuli");
  });

  it("does not overwrite existing", () => {
    expect(
      resolveAutoAllocateMerchant({
        assignedMerchant: "Alice",
        purchaseMerchantLabel: "Dinuli",
      })
    ).toBeNull();
  });

  it("returns null when no purchase merchant", () => {
    expect(
      resolveAutoAllocateMerchant({
        assignedMerchant: null,
        purchaseMerchantLabel: "  ",
      })
    ).toBeNull();
  });
});
