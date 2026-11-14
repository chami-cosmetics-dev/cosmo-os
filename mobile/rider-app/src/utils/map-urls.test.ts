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

  it("prefers directions from current GPS origin when provided", () => {
    const urls = buildMapUrlCandidates("7b, nugegoda", { latitude: 6.9, longitude: 79.9 });
    expect(urls[0]).toContain("google.com/maps/dir/");
    expect(urls[0]).toContain("origin=6.9%2C79.9");
    expect(urls[0]).toContain(encodeURIComponent("7b, nugegoda"));
  });
});
