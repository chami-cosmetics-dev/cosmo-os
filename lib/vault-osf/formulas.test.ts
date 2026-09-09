import { describe, expect, it } from "vitest";

import { maxSale, monthsOfCover, reorderQty, sumNullable } from "@/lib/vault-osf/formulas";

describe("vault OSF formulas", () => {
  it("matches NW004-2 sample AVE and reorder", () => {
    expect(maxSale([27, 32, 46, 20, 18, 1])).toBe(46);
    expect(monthsOfCover(19, 46)).toBeCloseTo(0.413, 3);
    expect(reorderQty(9.152, 6)).toBeCloseTo(3.152, 3);
  });

  it("matches RE001-1 overstock (signed, not floored)", () => {
    expect(monthsOfCover(150, 25)).toBe(6);
    expect(reorderQty(40, 90)).toBe(-50);
  });

  it("blanks AVE when max sale missing or zero", () => {
    expect(monthsOfCover(19, null)).toBeNull();
    expect(monthsOfCover(19, 0)).toBeNull();
    expect(maxSale([null, null])).toBeNull();
    expect(maxSale([null, 0, 12])).toBe(12);
  });

  it("blanks reorder when ROP unset; Total ROP blank when all unset", () => {
    expect(reorderQty(null, 6)).toBeNull();
    expect(sumNullable([null, null, null])).toBeNull();
    expect(sumNullable([9, null, 20])).toBe(29);
  });
});
