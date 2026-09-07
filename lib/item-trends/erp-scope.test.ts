import { describe, expect, it } from "vitest";

import { allowedInstanceIds, columnMatchesErpScope } from "@/lib/item-trends/erp-scope";

describe("erp stock scope", () => {
  const slots = { erp1: "inst-1", erp2: "inst-2" };

  it("both allows every column", () => {
    const allowed = allowedInstanceIds("both", slots);
    expect(columnMatchesErpScope("inst-1", allowed)).toBe(true);
    expect(columnMatchesErpScope("inst-2", allowed)).toBe(true);
  });

  it("erp1 keeps only that instance", () => {
    const allowed = allowedInstanceIds("erp1", slots);
    expect(columnMatchesErpScope("inst-1", allowed)).toBe(true);
    expect(columnMatchesErpScope("inst-2", allowed)).toBe(false);
    expect(columnMatchesErpScope(null, allowed)).toBe(false);
  });

  it("missing slot matches nothing", () => {
    const allowed = allowedInstanceIds("erp2", { erp1: "inst-1", erp2: null });
    expect(columnMatchesErpScope("inst-1", allowed)).toBe(false);
  });
});
