import { describe, expect, it } from "vitest";

import { formatPickListMoney, pickListMoneyAmount } from "@/lib/pick-list-money";

describe("pickListMoneyAmount", () => {
  it("keeps a positive amount at two decimals", () => {
    expect(pickListMoneyAmount("8250")).toBe("8250.00");
    expect(pickListMoneyAmount(9500.5)).toBe("9500.50");
    expect(pickListMoneyAmount({ toString: () => "120.1" })).toBe("120.10");
  });

  it("drops blank and non-positive amounts", () => {
    expect(pickListMoneyAmount(null)).toBeNull();
    expect(pickListMoneyAmount("")).toBeNull();
    expect(pickListMoneyAmount(0)).toBeNull();
    expect(pickListMoneyAmount("0.00")).toBeNull();
  });
});

describe("formatPickListMoney", () => {
  it("formats LKR-style thousands and a blank dash", () => {
    expect(formatPickListMoney("8250.00")).toBe("8,250.00");
    expect(formatPickListMoney(null)).toBe("—");
  });
});
