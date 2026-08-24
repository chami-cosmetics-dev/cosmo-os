import { describe, expect, it } from "vitest";

import { matchScan } from "@/lib/store-stock-count/match-scan";

const rows = [
  { skuKey: "A", barcodes: ["47901111", "ALT-A"] },
  { skuKey: "B", barcodes: ["47902222"] },
  { skuKey: "C", barcodes: ["47901111"] },
];

describe("matchScan", () => {
  it("returns none for empty", () => {
    expect(matchScan("  ", rows)).toEqual({ kind: "none" });
  });

  it("unique exact match", () => {
    expect(matchScan("47902222", rows)).toEqual({ kind: "unique", skuKey: "B" });
    expect(matchScan("ALT-A", rows)).toEqual({ kind: "unique", skuKey: "A" });
  });

  it("ambiguous when two SKUs share barcode", () => {
    const r = matchScan("47901111", rows);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      expect(r.skuKeys.sort()).toEqual(["A", "C"]);
    }
  });

  it("digits-only fallback", () => {
    expect(matchScan("4790-2222", [{ skuKey: "B", barcodes: ["47902222"] }])).toEqual({
      kind: "unique",
      skuKey: "B",
    });
  });

  it("unknown", () => {
    expect(matchScan("0000", rows)).toEqual({ kind: "none" });
  });
});
