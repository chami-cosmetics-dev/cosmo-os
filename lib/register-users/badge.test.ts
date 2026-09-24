import { describe, expect, it } from "vitest";

import { isOsRegBadgeActive, osRegBadgeDto } from "@/lib/register-users/badge";

function colomboDay(ymd: string): Date {
  return new Date(`${ymd}T12:00:00+05:30`);
}

describe("isOsRegBadgeActive", () => {
  it("is inclusive of start and end Colombo days", () => {
    const start = colomboDay("2026-09-24");
    const end = colomboDay("2026-09-27");
    expect(isOsRegBadgeActive(start, end, colomboDay("2026-09-24"))).toBe(true);
    expect(isOsRegBadgeActive(start, end, colomboDay("2026-09-26"))).toBe(true);
    expect(isOsRegBadgeActive(start, end, colomboDay("2026-09-27"))).toBe(true);
  });

  it("hides before start and after end", () => {
    const start = colomboDay("2026-09-24");
    const end = colomboDay("2026-09-27");
    expect(isOsRegBadgeActive(start, end, colomboDay("2026-09-23"))).toBe(false);
    expect(isOsRegBadgeActive(start, end, colomboDay("2026-09-28"))).toBe(false);
  });

  it("hides when stamp is missing", () => {
    expect(isOsRegBadgeActive(null, colomboDay("2026-09-27"))).toBe(false);
    expect(isOsRegBadgeActive(colomboDay("2026-09-24"), null)).toBe(false);
  });
});

describe("osRegBadgeDto", () => {
  it("returns location while active", () => {
    expect(
      osRegBadgeDto(
        "Kandy",
        colomboDay("2026-09-24"),
        colomboDay("2026-09-27"),
        colomboDay("2026-09-25"),
      ),
    ).toEqual({ location: "Kandy" });
  });

  it("returns null outside window or empty location", () => {
    expect(
      osRegBadgeDto(
        "Kandy",
        colomboDay("2026-09-24"),
        colomboDay("2026-09-27"),
        colomboDay("2026-09-28"),
      ),
    ).toBeNull();
    expect(
      osRegBadgeDto(
        "  ",
        colomboDay("2026-09-24"),
        colomboDay("2026-09-27"),
        colomboDay("2026-09-25"),
      ),
    ).toBeNull();
  });
});
