import { describe, expect, it } from "vitest";

import {
  expireFromManufacture,
  formatDateTyping,
  normalizeStickerDate,
} from "@/lib/sticker-dates";

describe("normalizeStickerDate", () => {
  it("accepts YYYYMMDD", () => {
    expect(normalizeStickerDate("20260703")).toBe("03/07/2026");
  });

  it("accepts DDMMYYYY", () => {
    expect(normalizeStickerDate("03072026")).toBe("03/07/2026");
  });

  it("accepts DD/MM/YYYY", () => {
    expect(normalizeStickerDate("3/7/2026")).toBe("03/07/2026");
  });

  it("rejects invalid calendars", () => {
    expect(normalizeStickerDate("31022026")).toBeNull();
    expect(normalizeStickerDate("20260231")).toBeNull();
  });
});

describe("expireFromManufacture", () => {
  it("adds 3 years", () => {
    expect(expireFromManufacture("03/07/2026")).toBe("03/07/2029");
    expect(expireFromManufacture("20260703")).toBe("03/07/2029");
  });
});

describe("formatDateTyping", () => {
  it("inserts slashes progressively for DDMM", () => {
    expect(formatDateTyping("03")).toBe("03");
    expect(formatDateTyping("0307")).toBe("03/07");
  });

  it("normalizes 8-digit compact inputs to DD/MM/YYYY", () => {
    expect(formatDateTyping("03072026")).toBe("03/07/2026");
    expect(formatDateTyping("20260703")).toBe("03/07/2026");
  });
});
