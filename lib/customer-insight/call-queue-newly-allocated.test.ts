import { describe, expect, it } from "vitest";

import {
  contactAllocatedToMerchantAliases,
  shouldShowNewlyAllocatedBadge,
} from "@/lib/customer-insight/call-queue-newly-allocated";

describe("shouldShowNewlyAllocatedBadge", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("hides when not flagged", () => {
    expect(
      shouldShowNewlyAllocatedBadge({
        newlyAllocated: false,
        lastContactedAt: null,
        now,
      })
    ).toBe(false);
  });

  it("shows when flagged and never contacted", () => {
    expect(
      shouldShowNewlyAllocatedBadge({
        newlyAllocated: true,
        lastContactedAt: null,
        now,
      })
    ).toBe(true);
  });

  it("hides when old merchant contacted within 2 months", () => {
    expect(
      shouldShowNewlyAllocatedBadge({
        newlyAllocated: true,
        lastContactedAt: new Date("2026-08-01T12:00:00.000Z"),
        now,
      })
    ).toBe(false);
  });

  it("shows when last contact older than 2 months", () => {
    expect(
      shouldShowNewlyAllocatedBadge({
        newlyAllocated: true,
        lastContactedAt: new Date("2026-06-01T12:00:00.000Z"),
        now,
      })
    ).toBe(true);
  });
});

describe("contactAllocatedToMerchantAliases", () => {
  it("matches case-insensitive aliases", () => {
    expect(contactAllocatedToMerchantAliases("MER91", ["mer91", "Alice"])).toBe(true);
    expect(contactAllocatedToMerchantAliases("Bob", ["mer91"])).toBe(false);
    expect(contactAllocatedToMerchantAliases(null, ["mer91"])).toBe(false);
  });
});
