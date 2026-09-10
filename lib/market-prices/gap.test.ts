import { describe, expect, it } from "vitest";

import {
  calculateCompetitorStats,
  calculateGapPct,
  calculateSingleCompetitorGaps,
  isAboveMarket,
  isCheapestInMarket,
} from "./gap";
import { isPriceCheckStale } from "./stale";

describe("gap calculations", () => {
  describe("calculateCompetitorStats", () => {
    it("returns null stats for empty array or only invalid numbers", () => {
      expect(calculateCompetitorStats([])).toEqual({
        count: 0,
        min: null,
        max: null,
        median: null,
      });

      expect(calculateCompetitorStats([null, undefined, 0, -500])).toEqual({
        count: 0,
        min: null,
        max: null,
        median: null,
      });
    });

    it("calculates median for odd count of prices", () => {
      const stats = calculateCompetitorStats([5000, 3000, 4000]);
      expect(stats).toEqual({
        count: 3,
        min: 3000,
        max: 5000,
        median: 4000,
      });
    });

    it("calculates median for even count of prices", () => {
      const stats = calculateCompetitorStats([3000, 4000, 5000, 6000]);
      expect(stats).toEqual({
        count: 4,
        min: 3000,
        max: 6000,
        median: 4500,
      });
    });

    it("handles single price", () => {
      const stats = calculateCompetitorStats([4200]);
      expect(stats).toEqual({
        count: 1,
        min: 4200,
        max: 4200,
        median: 4200,
      });
    });
  });

  describe("calculateGapPct", () => {
    it("returns correct positive and negative percentages rounded to 1 decimal", () => {
      // 5500 vs 5000 -> +10%
      expect(calculateGapPct(5500, 5000)).toBe(10);

      // 4500 vs 5000 -> -10%
      expect(calculateGapPct(4500, 5000)).toBe(-10);

      // 5333 vs 5000 -> +6.66% -> 6.7%
      expect(calculateGapPct(5333, 5000)).toBe(6.7);
    });

    it("returns null when either price is invalid or non-positive", () => {
      expect(calculateGapPct(null, 5000)).toBeNull();
      expect(calculateGapPct(5000, null)).toBeNull();
      expect(calculateGapPct(0, 5000)).toBeNull();
      expect(calculateGapPct(5000, 0)).toBeNull();
      expect(calculateGapPct(-100, 5000)).toBeNull();
    });
  });

  describe("isCheapestInMarket", () => {
    it("returns true only when our price is strictly less than every competitor price", () => {
      expect(isCheapestInMarket(3900, [4000, 4200, 4500])).toBe(true);
      expect(isCheapestInMarket(4000, [4000, 4200])).toBe(false);
      expect(isCheapestInMarket(4300, [4000, 4200])).toBe(false);
    });

    it("returns false if our price is null or there are no competitors", () => {
      expect(isCheapestInMarket(null, [4000])).toBe(false);
      expect(isCheapestInMarket(3000, [])).toBe(false);
    });
  });

  describe("isAboveMarket", () => {
    it("returns true if gap is greater than 5%", () => {
      expect(isAboveMarket(5.1)).toBe(true);
      expect(isAboveMarket(5.0)).toBe(false);
      expect(isAboveMarket(-2)).toBe(false);
      expect(isAboveMarket(null)).toBe(false);
    });
  });

  describe("calculateSingleCompetitorGaps", () => {
    it("calculates gap for each price layer", () => {
      const gaps = calculateSingleCompetitorGaps(
        { mrp: 5500, promo: 4800, ogf: 5000, hasPromo: true },
        5000,
      );
      expect(gaps).toEqual({
        mrp: 10,
        promo: -4,
        ogf: 0,
      });
    });
  });
});

describe("stale price detection", () => {
  it("marks date older than 14 calendar days as stale", () => {
    expect(isPriceCheckStale("2026-08-15", "2026-09-05")).toBe(true); // 21 days
    expect(isPriceCheckStale("2026-08-21", "2026-09-05")).toBe(true); // 15 days (> 14 days)
    expect(isPriceCheckStale("2026-08-22", "2026-09-05")).toBe(false); // 14 days exactly (not > 14)
  });

  it("marks date within 14 calendar days as not stale", () => {
    expect(isPriceCheckStale("2026-08-25", "2026-09-05")).toBe(false); // 11 days
    expect(isPriceCheckStale("2026-09-05", "2026-09-05")).toBe(false); // 0 days
  });

  it("returns false for null or invalid dates", () => {
    expect(isPriceCheckStale(null)).toBe(false);
    expect(isPriceCheckStale("")).toBe(false);
  });
});
