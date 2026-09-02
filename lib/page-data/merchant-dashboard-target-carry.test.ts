import { describe, expect, it } from "vitest";

import { previousYearMonth } from "@/lib/page-data/merchant-dashboard-history";
import { resolveEffectiveTotalTarget } from "@/lib/merchant-dashboard/channel-sales";

describe("previousYearMonth", () => {
  it("returns prior calendar month", () => {
    expect(previousYearMonth("2026-09")).toBe("2026-08");
    expect(previousYearMonth("2026-01")).toBe("2025-12");
  });
});

describe("merchant target combined from channels", () => {
  it("updates combined when shop and online are set", () => {
    expect(
      resolveEffectiveTotalTarget({
        targetAmount: 999,
        shopTargetAmount: 500_000,
        onlineTargetAmount: 300_000,
      }),
    ).toBe(800_000);
  });

  it("uses combined alone when channels unset", () => {
    expect(
      resolveEffectiveTotalTarget({
        targetAmount: 1_000_000,
        shopTargetAmount: null,
        onlineTargetAmount: null,
      }),
    ).toBe(1_000_000);
  });
});
