import { describe, expect, it } from "vitest";

import {
  checkResultForStatus,
  couponPrefix,
  deriveGiftVoucherStatus,
  formatVoucherCode,
  generateRandomVoucherCodes,
  normalizeVoucherCode,
  parseVoucherCodeList,
} from "@/lib/gift-vouchers/types";

describe("formatVoucherCode", () => {
  it("builds COS + 3-digit group number + 5-digit random part", () => {
    expect(formatVoucherCode(141, 48213)).toBe("COS14148213");
  });

  it("zero-pads the random part", () => {
    expect(formatVoucherCode(141, 7)).toBe("COS14100007");
  });

  it("lets group numbers above 999 use 4 digits", () => {
    expect(formatVoucherCode(1000, 12345)).toBe("COS100012345");
  });
});

describe("generateRandomVoucherCodes", () => {
  /** Deterministic stand-in for crypto randomInt: walks a fixed list, then wraps. */
  function sequenceRandom(values: number[]) {
    let i = 0;
    return () => values[i++ % values.length];
  }

  it("returns the requested number of codes, sorted ascending", () => {
    const codes = generateRandomVoucherCodes({
      groupNumber: 141,
      quantity: 3,
      exclude: new Set(),
      randomInt: sequenceRandom([48213, 7, 91000]),
    });
    expect(codes?.map((c) => c.code)).toEqual(["COS14100007", "COS14148213", "COS14191000"]);
    expect(codes?.map((c) => c.randomPart)).toEqual([7, 48213, 91000]);
  });

  it("skips repeated random parts and excluded codes", () => {
    const codes = generateRandomVoucherCodes({
      groupNumber: 141,
      quantity: 2,
      exclude: new Set(["COS14148213"]),
      randomInt: sequenceRandom([48213, 20000, 20000, 30000]),
    });
    expect(codes?.map((c) => c.code)).toEqual(["COS14120000", "COS14130000"]);
  });

  it("asks for 5-digit random parts including leading zeros", () => {
    const calls: Array<[number, number]> = [];
    generateRandomVoucherCodes({
      groupNumber: 141,
      quantity: 1,
      exclude: new Set(),
      randomInt: (min, max) => {
        calls.push([min, max]);
        return 1;
      },
    });
    expect(calls).toEqual([[0, 99999]]);
  });

  it("returns null when the group has run out of random parts", () => {
    expect(
      generateRandomVoucherCodes({
        groupNumber: 141,
        quantity: 100001,
        exclude: new Set(),
        randomInt: () => 0,
      }),
    ).toBeNull();
  });
});

describe("normalizeVoucherCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeVoucherCode("  gv0001 ")).toBe("GV0001");
  });
});

describe("deriveGiftVoucherStatus", () => {
  const group = { startDate: "2026-10-10", endDate: "2026-10-20" };

  it("is PENDING before the start date", () => {
    expect(deriveGiftVoucherStatus({ ...group, used: false, today: "2026-10-09" })).toBe("PENDING");
  });

  it("is ACTIVE on the start and end dates", () => {
    expect(deriveGiftVoucherStatus({ ...group, used: false, today: "2026-10-10" })).toBe("ACTIVE");
    expect(deriveGiftVoucherStatus({ ...group, used: false, today: "2026-10-20" })).toBe("ACTIVE");
  });

  it("is EXPIRED after the end date", () => {
    expect(deriveGiftVoucherStatus({ ...group, used: false, today: "2026-10-21" })).toBe("EXPIRED");
  });

  it("is USED regardless of dates once redeemed", () => {
    expect(deriveGiftVoucherStatus({ ...group, used: true, today: "2026-10-21" })).toBe("USED");
    expect(deriveGiftVoucherStatus({ ...group, used: true, today: "2026-10-01" })).toBe("USED");
  });
});

describe("checkResultForStatus", () => {
  it("maps statuses to check results", () => {
    expect(checkResultForStatus("ACTIVE")).toBe("VALID");
    expect(checkResultForStatus("PENDING")).toBe("NOT_YET_ACTIVE");
    expect(checkResultForStatus("EXPIRED")).toBe("EXPIRED");
    expect(checkResultForStatus("USED")).toBe("USED");
  });
});

describe("parseVoucherCodeList", () => {
  it("accepts one code per line, Excel columns, commas and stray spaces", () => {
    expect(parseVoucherCodeList(" gv0001\r\nGV0002\tGV0003, gv0004\n\n").codes).toEqual([
      "GV0001",
      "GV0002",
      "GV0003",
      "GV0004",
    ]);
  });

  it("does not split codes containing the letter s", () => {
    expect(parseVoucherCodeList("SALES01\nXMAS02").codes).toEqual(["SALES01", "XMAS02"]);
  });

  it("reports duplicates once and keeps the first occurrence", () => {
    const result = parseVoucherCodeList("GV1\ngv1\nGV1\nGV2");
    expect(result.codes).toEqual(["GV1", "GV2"]);
    expect(result.duplicates).toEqual(["GV1"]);
  });

  it("reports codes with unsupported characters", () => {
    const result = parseVoucherCodeList("GV1\nGV#2\nGV_3");
    expect(result.codes).toEqual(["GV1", "GV_3"]);
    expect(result.invalid).toEqual(["GV#2"]);
  });
});

describe("couponPrefix", () => {
  it("takes the first word, uppercased", () => {
    expect(couponPrefix("SGV 1000")).toBe("SGV");
    expect(couponPrefix("  sgv   1000 ")).toBe("SGV");
    expect(couponPrefix("SGV")).toBe("SGV");
  });

  it("returns null for an empty coupon", () => {
    expect(couponPrefix("   ")).toBeNull();
  });
});
