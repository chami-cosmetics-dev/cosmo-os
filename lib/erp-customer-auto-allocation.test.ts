import { describe, expect, it } from "vitest";

import { shouldAutoAllocateErpCustomer } from "@/lib/erp-customer-auto-allocation";

const eligible = {
  syncStatus: "created" as const,
  creatorMer: "MER56",
  creatorHasMerchantRole: true,
  originInstanceKnown: true,
  hasPhone: true,
  otherErpPhoneCheck: "clear" as const,
};

describe("shouldAutoAllocateErpCustomer", () => {
  it("allocates a brand-new phone to its ERP merchant creator", () => {
    expect(shouldAutoAllocateErpCustomer(eligible)).toBe(true);
  });

  it("does not allocate a contact already present in OS", () => {
    expect(
      shouldAutoAllocateErpCustomer({ ...eligible, syncStatus: "unchanged" }),
    ).toBe(false);
    expect(
      shouldAutoAllocateErpCustomer({ ...eligible, syncStatus: "enriched" }),
    ).toBe(false);
  });

  it("does not allocate a phone found in the other ERP", () => {
    expect(
      shouldAutoAllocateErpCustomer({
        ...eligible,
        otherErpPhoneCheck: "found",
      }),
    ).toBe(false);
  });

  it("fails closed when the other ERP cannot be checked", () => {
    expect(
      shouldAutoAllocateErpCustomer({
        ...eligible,
        otherErpPhoneCheck: "failed",
      }),
    ).toBe(false);
  });

  it("requires a mapped merchant role and MER code", () => {
    expect(
      shouldAutoAllocateErpCustomer({
        ...eligible,
        creatorHasMerchantRole: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoAllocateErpCustomer({ ...eligible, creatorMer: null }),
    ).toBe(false);
  });
});
