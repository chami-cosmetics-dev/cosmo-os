import { describe, expect, it } from "vitest";

import { displayWarehouseName } from "@/lib/item-trends/location-name";

describe("displayWarehouseName", () => {
  it("maps company codes to physical shops", () => {
    expect(displayWarehouseName("LWK")).toBe("OGF");
    expect(displayWarehouseName("LML")).toBe("Pepiliyana");
    expect(displayWarehouseName("LMJ")).toBe("Pepiliyana");
    expect(displayWarehouseName("MNK")).toBe("Cool Planet");
    expect(displayWarehouseName("AJS")).toBe("Kiribathgoda");
    expect(displayWarehouseName("DRO")).toBe("Maharagama");
    expect(displayWarehouseName("CHAMI")).toBe("GCC");
  });

  it("keeps a plain shop name", () => {
    expect(displayWarehouseName("GCC")).toBe("GCC");
    expect(displayWarehouseName("GCC Shop")).toBe("GCC");
  });

  it("drops company code prefix", () => {
    expect(displayWarehouseName("LWK - OGF")).toBe("OGF");
    expect(displayWarehouseName("LML - pepiliyana")).toBe("Pepiliyana");
    expect(displayWarehouseName("LMJ - PEPILIYANA")).toBe("Pepiliyana");
    expect(displayWarehouseName("MNK - Cool planet")).toBe("Cool Planet");
    expect(displayWarehouseName("AJS - Kiribathgoda")).toBe("Kiribathgoda");
    expect(displayWarehouseName("DRO - Maharagama")).toBe("Maharagama");
    expect(displayWarehouseName("CHAMI - GCC")).toBe("GCC");
  });

  it("leaves online / main labels alone", () => {
    expect(displayWarehouseName("Cosmetics.lk")).toBe("Cosmetics.lk");
    expect(displayWarehouseName("LWK Main")).toBe("LWK Main");
  });
});
