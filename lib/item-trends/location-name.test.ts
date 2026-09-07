import { describe, expect, it } from "vitest";

import { displayWarehouseName } from "@/lib/item-trends/location-name";

describe("displayWarehouseName", () => {
  it("keeps a plain shop name", () => {
    expect(displayWarehouseName("GCC")).toBe("GCC");
  });

  it("drops company code prefix", () => {
    expect(displayWarehouseName("LWK - OGF")).toBe("OGF");
    expect(displayWarehouseName("LMJ - PEPILIYANA")).toBe("PEPILIYANA");
  });
});
