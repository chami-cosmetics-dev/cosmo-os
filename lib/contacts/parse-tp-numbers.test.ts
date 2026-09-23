import { describe, expect, it } from "vitest";

import { parseTpNumbers } from "@/lib/contacts/parse-tp-numbers";

describe("parseTpNumbers", () => {
  it("splits on commas and newlines, trims, and dedupes", () => {
    expect(parseTpNumbers("0771, 0772\n0771\n 0773 ")).toEqual([
      "0771",
      "0772",
      "0773",
    ]);
  });

  it("returns empty for blank input", () => {
    expect(parseTpNumbers("  \n,  ")).toEqual([]);
  });
});
