import { describe, expect, it } from "vitest";

import { baseSku, mapGetBySku, skuVariantKeys } from "@/lib/osf/base-sku";

describe("baseSku", () => {
  it("strips trailing _N", () => {
    expect(baseSku("CAN07_1")).toBe("CAN07");
    expect(baseSku("CAN07_12")).toBe("CAN07");
  });

  it("strips trailing -N", () => {
    expect(baseSku("CAN07-2")).toBe("CAN07");
    expect(baseSku("NW005-1")).toBe("NW005");
  });

  it("leaves base SKUs unchanged", () => {
    expect(baseSku("ABC")).toBe("ABC");
    expect(baseSku("CAN07")).toBe("CAN07");
  });

  it("trims whitespace", () => {
    expect(baseSku("  CAN07_1  ")).toBe("CAN07");
  });

  it("returns empty for blank", () => {
    expect(baseSku("")).toBe("");
    expect(baseSku("   ")).toBe("");
  });
});

describe("skuVariantKeys", () => {
  it("adds hyphen twin for underscore SKUs", () => {
    expect(skuVariantKeys("CAN07_1")).toEqual(["CAN07_1", "CAN07-1"]);
  });

  it("adds underscore twin for hyphen SKUs", () => {
    expect(skuVariantKeys("CAN07-1")).toEqual(["CAN07-1", "CAN07_1"]);
  });
});

describe("mapGetBySku", () => {
  it("hits the hyphen twin", () => {
    const map = new Map([["CAN07-1", 9]]);
    expect(mapGetBySku(map, "CAN07_1")).toBe(9);
  });
});
