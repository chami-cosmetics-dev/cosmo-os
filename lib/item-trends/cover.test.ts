import { describe, expect, it } from "vitest";

import {
  compareChannelKind,
  computeCoverMath,
  trailing30Window,
  TRAILING_COVER_DAYS,
} from "@/lib/item-trends/cover";
import { addUtcDays } from "@/lib/osf/assist-window";
import { formatAppIsoDate } from "@/lib/format-datetime";

describe("computeCoverMath", () => {
  it("keeps week need from range and cover days from last-30 avg", () => {
    // Range: 14 units / 7 days → week need 14. Last 30: 60 → avg 2. Stock 10 → cover 5.
    const result = computeCoverMath({
      stockQty: 10,
      unitsInRange: 14,
      daysInRange: 7,
      last30Units: 60,
    });
    expect(result.avgDaily).toBe(2);
    expect(result.weekNeed).toBe(14);
    expect(result.last30AvgDaily).toBe(2);
    expect(result.coverDays).toBe(5);
    expect(result.isOosInRange).toBe(false);
  });

  it("still computes legacy send math from range (unused in UI)", () => {
    const result = computeCoverMath({
      stockQty: 3,
      unitsInRange: 14,
      daysInRange: 7,
      last30Units: 60,
    });
    expect(result.shouldSend).toBe(true);
    expect(result.suggestedSendQty).toBe(11);
    expect(result.coverDays).toBe(1.5);
  });

  it("returns null cover days when last-30 avg is zero", () => {
    const result = computeCoverMath({
      stockQty: 10,
      unitsInRange: 14,
      daysInRange: 7,
      last30Units: 0,
    });
    expect(result.last30AvgDaily).toBe(0);
    expect(result.coverDays).toBeNull();
    expect(result.weekNeed).toBe(14);
  });

  it("marks OOS when sold in range and stock is zero", () => {
    const result = computeCoverMath({ stockQty: 0, unitsInRange: 5, daysInRange: 10, last30Units: 5 });
    expect(result.isOosInRange).toBe(true);
  });
});

describe("trailing30Window", () => {
  it(`spans ${TRAILING_COVER_DAYS} inclusive Colombo days ending today`, () => {
    const now = new Date("2026-09-14T12:00:00+05:30");
    const { fromYmd, toYmd } = trailing30Window(now);
    expect(toYmd).toBe(formatAppIsoDate(now));
    expect(fromYmd).toBe(addUtcDays(toYmd, -(TRAILING_COVER_DAYS - 1)));
  });
});

describe("compareChannelKind", () => {
  it("sorts online before physical", () => {
    expect(compareChannelKind("online", "physical")).toBeLessThan(0);
    expect(compareChannelKind("physical", "online")).toBeGreaterThan(0);
  });
});
