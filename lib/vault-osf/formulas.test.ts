import { describe, expect, it } from "vitest";

import {
  averageMonthlySale,
  maxSale,
  monthsOfCover,
  reorderQty,
  sumNullable,
} from "@/lib/vault-osf/formulas";

describe("vault OSF formulas", () => {
  it("computes AVE as total sale / months that have sales", () => {
    expect(maxSale([27, 32, 46, 20, 18, 1])).toBe(46);
    expect(averageMonthlySale([27, 32, 46, 20, 18, 1])).toBeCloseTo(144 / 6, 5);
    // April/May blank — only June counts
    expect(averageMonthlySale([null, null, 46, null, null, null])).toBe(46);
    expect(averageMonthlySale([null, 10, 20, null])).toBe(15);
    expect(reorderQty(9.152, 6)).toBeCloseTo(3.152, 3);
  });

  it("matches RE001-1 signed reorder; monthsOfCover kept as helper", () => {
    expect(monthsOfCover(150, 25)).toBe(6);
    expect(reorderQty(40, 90)).toBe(-50);
  });

  it("blanks AVE when no month sales", () => {
    expect(averageMonthlySale([null, null])).toBeNull();
    expect(averageMonthlySale([], 0)).toBeNull();
    expect(maxSale([null, null])).toBeNull();
    expect(maxSale([null, 0, 12])).toBe(12);
  });

  it("blanks reorder when ROP unset; Total ROP blank when all unset", () => {
    expect(reorderQty(null, 6)).toBeNull();
    expect(sumNullable([null, null, null])).toBeNull();
    expect(sumNullable([9, null, 20])).toBe(29);
  });
});
