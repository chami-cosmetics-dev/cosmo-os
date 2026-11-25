import { describe, expect, it } from "vitest";

import {
  handlesQuery,
  verdictOfShopifyStatus,
} from "@/lib/discontinued-items/verification";

describe("verdictOfShopifyStatus", () => {
  it("Draft passes; Active and Archived fail; anything else is not decided", () => {
    expect(verdictOfShopifyStatus("DRAFT")).toBe("PASS");
    expect(verdictOfShopifyStatus("ACTIVE")).toBe("FAIL");
    expect(verdictOfShopifyStatus("ARCHIVED")).toBe("FAIL");
    expect(verdictOfShopifyStatus("active")).toBe("FAIL");
    expect(verdictOfShopifyStatus(null)).toBeNull();
    expect(verdictOfShopifyStatus("UNLISTED")).toBeNull();
  });
});

describe("handlesQuery", () => {
  it("ORs quoted handles and strips quotes", () => {
    expect(handlesQuery(["a-b", 'c"d'])).toBe('handle:"a-b" OR handle:"cd"');
  });
});
