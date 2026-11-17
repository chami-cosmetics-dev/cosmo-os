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
  it("includes cosmetics.lk, store link, merchant advisor, and mobile", () => {
    const msg = buildBirthdayWishMessage({
      customerName: "Nimali",
      merchantName: "Ishadi",
      merchantMobile: "0771234567",
    });
    expect(msg).toContain("Nimali");
    expect(msg).toContain("cosmetics.lk");
    expect(msg).toContain("https://cosmetics.lk");
    expect(msg).toContain("Ishadi");
    expect(msg).toContain("Contact me for further details: 0771234567");
    expect(msg).not.toContain("% off");
    expect(msg).not.toContain("with code");
    expect(msg).not.toContain("[BDWISH]");
    expect(msg).not.toContain("Cosmo purchase");
  });

  it("omits contact line when merchant mobile missing", () => {
    const msg = buildBirthdayWishMessage({
      customerName: "Nimali",
      merchantName: "Ishadi",
    });
    expect(msg).not.toContain("Contact me for further details");
  });
});
