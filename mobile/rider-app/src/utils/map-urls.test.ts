import { describe, expect, it } from "vitest";

import { buildMapUrlCandidates, hasUsableAddress } from "@/src/utils/map-urls";

describe("hasUsableAddress", () => {
  it("rejects empty and placeholder", () => {
    expect(hasUsableAddress("")).toBe(false);
    expect(hasUsableAddress("No address")).toBe(false);
    expect(hasUsableAddress("7b, pepiliyana mawatha")).toBe(true);
  });
});

describe("buildMapUrlCandidates", () => {
  it("returns geo then https candidates with encoded address", () => {
    const urls = buildMapUrlCandidates("7b, nugegoda");
    expect(urls[0]).toMatch(/^geo:0,0\?q=/);
    expect(urls.some((u) => u.includes("google.com/maps"))).toBe(true);
    expect(urls.every((u) => u.includes(encodeURIComponent("7b, nugegoda")))).toBe(true);
  });
});
