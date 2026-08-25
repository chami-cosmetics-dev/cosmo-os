import { describe, expect, it } from "vitest";

import {
  isNmrApprovedItemCode,
  normalizeNmrItemCode,
} from "@/lib/nmr-approved-items";

describe("NMRA-approved item codes", () => {
  it("normalizes whitespace and casing", () => {
    expect(normalizeNmrItemCode(" cb004_1 ")).toBe("CB004_1");
  });

  it("matches approved codes case-insensitively", () => {
    const codes = new Set(["CB004_1"]);
    expect(isNmrApprovedItemCode(codes, "cb004_1")).toBe(true);
    expect(isNmrApprovedItemCode(codes, "CB024_1")).toBe(false);
  });

  it("does not match an empty code", () => {
    expect(isNmrApprovedItemCode(new Set(["CB004_1"]), null)).toBe(false);
  });
});
