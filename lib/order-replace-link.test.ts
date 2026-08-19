import { describe, expect, it } from "vitest";

import { orderNumberMatchCandidates } from "@/lib/order-replace-link";
import { replacedByOrderBodySchema } from "@/lib/validation/order-replace-link";

describe("orderNumberMatchCandidates", () => {
  it("returns trimmed raw, no-hash, and hash variants", () => {
    expect(orderNumberMatchCandidates("  #1001 ")).toEqual(["#1001", "1001"]);
    expect(orderNumberMatchCandidates("SI-9")).toEqual(["SI-9", "#SI-9"]);
  });

  it("returns empty for blank", () => {
    expect(orderNumberMatchCandidates("   ")).toEqual([]);
  });
});

describe("replacedByOrderBodySchema", () => {
  it("accepts null clear", () => {
    expect(replacedByOrderBodySchema.parse({ replacedByOrderNumber: null })).toEqual({
      replacedByOrderNumber: null,
    });
  });

  it("accepts trimmed order number", () => {
    expect(replacedByOrderBodySchema.parse({ replacedByOrderNumber: "  SI-1  " })).toEqual({
      replacedByOrderNumber: "SI-1",
    });
  });

  it("rejects empty string", () => {
    expect(replacedByOrderBodySchema.safeParse({ replacedByOrderNumber: "  " }).success).toBe(
      false
    );
  });
});
