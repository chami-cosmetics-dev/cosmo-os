import { describe, expect, it } from "vitest";

import { PURCHASE_HEADERS, matchPurchaseHeaders } from "@/lib/vault-supplement-import/headers";

describe("matchPurchaseHeaders", () => {
  it("matches headers in any order and ignores extra columns", () => {
    const shuffled = ["notes", ...[...PURCHASE_HEADERS].reverse()];
    const matched = matchPurchaseHeaders(shuffled);
    expect(matched.ok).toBe(true);
    if (!matched.ok) return;
    expect(matched.index.get("customer_name")).toBe(shuffled.indexOf("customer_name"));
    expect(matched.index.has("item_code")).toBe(true);
  });

  it("names the missing required header", () => {
    const headers = PURCHASE_HEADERS.filter((header) => header !== "item_code");
    const matched = matchPurchaseHeaders([...headers]);
    expect(matched).toEqual({ ok: false, error: "Missing required header: item_code" });
  });
});
