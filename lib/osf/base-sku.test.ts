import { describe, expect, it } from "vitest";

import { baseSku } from "@/lib/osf/base-sku";

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
