import { describe, expect, it } from "vitest";

import {
  buildAllocatedCustomerIdentitySets,
  orderMatchesAllocatedCustomer,
} from "@/lib/page-data/merchant-dashboard-sales";

describe("allocated top-customer identity matching", () => {
  it("matches order phones to allocated contact variants", () => {
    const allocated = buildAllocatedCustomerIdentitySets([
      { phoneNumber: "0760691207", email: null },
    ]);

    expect(
      orderMatchesAllocatedCustomer(
        { customerPhone: "760691207", customerEmail: null },
        allocated,
      ),
    ).toBe(true);
    expect(
      orderMatchesAllocatedCustomer(
        { customerPhone: "0773781105", customerEmail: null },
        allocated,
      ),
    ).toBe(false);
  });

  it("matches secondary phones and emails", () => {
    const allocated = buildAllocatedCustomerIdentitySets([
      {
        phoneNumber: "0711111111",
        email: "primary@example.com",
        phones: [{ phoneNumber: "0722222222" }],
        emails: [{ email: "alt@example.com" }],
      },
    ]);

    expect(
      orderMatchesAllocatedCustomer(
        { customerPhone: "0722222222", customerEmail: null },
        allocated,
      ),
    ).toBe(true);
    expect(
      orderMatchesAllocatedCustomer(
        { customerPhone: null, customerEmail: "alt@example.com" },
        allocated,
      ),
    ).toBe(true);
  });

  it("rejects unallocated identities", () => {
    const allocated = buildAllocatedCustomerIdentitySets([]);
    expect(
      orderMatchesAllocatedCustomer(
        { customerPhone: "0760691207", customerEmail: "x@y.com" },
        allocated,
      ),
    ).toBe(false);
  });
});
