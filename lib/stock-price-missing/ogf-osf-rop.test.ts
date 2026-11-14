import { describe, expect, it } from "vitest";

import {
  applyOgfRopGate,
  isOgfOsfColumn,
  ogfRopColumnKeys,
} from "@/lib/stock-price-missing/ogf-osf-rop";

describe("isOgfOsfColumn", () => {
  it("matches LWK and OGF shop columns", () => {
    expect(isOgfOsfColumn({ key: "lwk", label: "LWK" })).toBe(true);
    expect(isOgfOsfColumn({ key: "ogf", label: "OGF" })).toBe(true);
    expect(isOgfOsfColumn({ key: "cosmo_shop_ogf", label: "OGF Shop" })).toBe(true);
    expect(
      isOgfOsfColumn({
        key: "shop",
        label: "Shop",
        warehouses: ["OGF Shop Warehouse - Cosmo"],
      }),
    ).toBe(true);
    expect(
      isOgfOsfColumn({
        key: "shop",
        label: "Shop",
        warehouses: ["Shop Warehouse - LWK"],
      }),
    ).toBe(true);
  });

  it("skips other shops", () => {
    expect(isOgfOsfColumn({ key: "lmj", label: "LMJ" })).toBe(false);
    expect(isOgfOsfColumn({ key: "cosmetics_lk", label: "Cosmetics.lk" })).toBe(false);
    expect(
      isOgfOsfColumn({
        key: "cosmo_shop_gcc",
        label: "GCC Shop",
        warehouses: ["GCC Shop Warehouse - Cosmo"],
      }),
    ).toBe(false);
  });
});

describe("ogfRopColumnKeys", () => {
  it("keeps active includeInRop OGF columns only", () => {
    expect(
      ogfRopColumnKeys([
        { key: "lwk", label: "LWK", active: true, includeInRop: true },
        { key: "cosmo_shop_ogf", label: "OGF Shop", active: true, includeInRop: false },
        { key: "lmj", label: "LMJ", active: true, includeInRop: true },
        { key: "ogf", label: "OGF", active: false, includeInRop: true },
      ]),
    ).toEqual(["lwk"]);
  });
});

describe("applyOgfRopGate", () => {
  it("drops OGF-only when OSF has no OGF ROP", () => {
    expect(applyOgfRopGate("OGF", false)).toBeNull();
  });

  it("keeps Standard-only when OSF has no OGF ROP", () => {
    expect(applyOgfRopGate("Standard", false)).toBe("Standard");
    expect(applyOgfRopGate("Both", false)).toBe("Standard");
  });

  it("leaves gap alone when SKU has OGF ROP or columns missing", () => {
    expect(applyOgfRopGate("OGF", true)).toBe("OGF");
    expect(applyOgfRopGate("Both", true)).toBe("Both");
    expect(applyOgfRopGate("OGF", null)).toBe("OGF");
    expect(applyOgfRopGate(null, false)).toBeNull();
  });
});
