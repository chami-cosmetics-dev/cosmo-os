import { describe, expect, it } from "vitest";

import { buildBirthdayWishMessage } from "@/lib/page-data/merchant-birthday-wish-message";
import { daysUntilNextBirthday } from "@/lib/page-data/merchant-dashboard-birthdays";

describe("daysUntilNextBirthday", () => {
  it("returns 0 when birthday is today", () => {
    // 2026-08-08
    const now = new Date("2026-08-08T06:00:00.000Z");
    expect(daysUntilNextBirthday(8, 8, now)).toBe(0);
  });

  it("counts forward within the year", () => {
    const now = new Date("2026-08-08T06:00:00.000Z");
    expect(daysUntilNextBirthday(8, 18, now)).toBe(10);
  });
});

describe("buildBirthdayWishMessage", () => {
  it("includes name, merchant, discount, and marker", () => {
    const msg = buildBirthdayWishMessage({
      customerName: "Nimali",
      merchantName: "Ishadi",
      discountPercent: 10,
      code: "BD10",
    });
    expect(msg).toContain("Nimali");
    expect(msg).toContain("Ishadi");
    expect(msg).toContain("10%");
    expect(msg).toContain("BD10");
    expect(msg).toContain("[BDWISH]");
  });
});
