import { describe, expect, it } from "vitest";

import {
  clampPage,
  nightlyLogsQuerySchema,
  parseBatchDate,
} from "@/lib/nightly-logs";

describe("nightly-logs helpers", () => {
  it("parses batch date from batch code", () => {
    expect(parseBatchDate("14092026123045")).toBe("14/09/2026");
  });

  it("clamps page within range", () => {
    expect(clampPage(1, 20, 0)).toBe(1);
    expect(clampPage(9, 20, 45)).toBe(3);
    expect(clampPage(0, 20, 45)).toBe(1);
  });

  it("validates query defaults", () => {
    expect(nightlyLogsQuerySchema.parse({})).toEqual({
      kind: "ogf",
      page: 1,
      limit: 20,
    });
    expect(nightlyLogsQuerySchema.parse({ kind: "sms", page: "2", limit: "10" })).toEqual({
      kind: "sms",
      page: 2,
      limit: 10,
    });
  });
});
