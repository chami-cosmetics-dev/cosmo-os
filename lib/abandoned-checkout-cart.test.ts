import { describe, expect, it } from "vitest";

import {
  buildCartFingerprint,
  isProperCartSubset,
  normalizeAbandonedCheckoutLines,
} from "@/lib/abandoned-checkout-cart";

describe("normalizeAbandonedCheckoutLines", () => {
  it("merges GraphQL nodes by variant id and qty", () => {
    const lines = normalizeAbandonedCheckoutLines({
      nodes: [
        { title: "Serum", quantity: 1, variant: { id: "gid://shopify/ProductVariant/1" } },
        { title: "Serum", quantity: 2, variant: { id: "gid://shopify/ProductVariant/1" } },
      ],
    });
    expect(lines).toEqual([{ key: "v:gid://shopify/ProductVariant/1", quantity: 3 }]);
  });

  it("falls back to normalized title when ids missing", () => {
    const lines = normalizeAbandonedCheckoutLines([
      { title: "  Face Cream ", quantity: 1 },
      { title: "face cream", quantity: 1 },
    ]);
    expect(lines).toEqual([{ key: "t:face cream", quantity: 2 }]);
  });

  it("reads REST variant_id / product_id", () => {
    const lines = normalizeAbandonedCheckoutLines([
      { title: "A", quantity: 1, variant_id: 11 },
      { title: "B", quantity: 2, product_id: 22 },
    ]);
    expect(buildCartFingerprint(lines)).toBe("p:22@2|v:11@1");
  });
});

describe("buildCartFingerprint", () => {
  it("is qty-aware for exact match", () => {
    const a = normalizeAbandonedCheckoutLines([{ title: "A", quantity: 1 }]);
    const b = normalizeAbandonedCheckoutLines([{ title: "A", quantity: 2 }]);
    expect(buildCartFingerprint(a)).not.toBe(buildCartFingerprint(b));
  });
});

describe("isProperCartSubset", () => {
  it("true when older is proper subset of newer", () => {
    const older = normalizeAbandonedCheckoutLines([{ title: "A", quantity: 1 }]);
    const newer = normalizeAbandonedCheckoutLines([
      { title: "A", quantity: 1 },
      { title: "B", quantity: 1 },
    ]);
    expect(isProperCartSubset(older, newer)).toBe(true);
  });

  it("false for equal carts", () => {
    const a = normalizeAbandonedCheckoutLines([{ title: "A", quantity: 1 }]);
    const b = normalizeAbandonedCheckoutLines([{ title: "A", quantity: 1 }]);
    expect(isProperCartSubset(a, b)).toBe(false);
  });

  it("false for disjoint carts", () => {
    const a = normalizeAbandonedCheckoutLines([{ title: "A", quantity: 1 }]);
    const b = normalizeAbandonedCheckoutLines([{ title: "B", quantity: 1 }]);
    expect(isProperCartSubset(a, b)).toBe(false);
  });

  it("false when newer is smaller", () => {
    const older = normalizeAbandonedCheckoutLines([
      { title: "A", quantity: 1 },
      { title: "B", quantity: 1 },
    ]);
    const newer = normalizeAbandonedCheckoutLines([{ title: "A", quantity: 1 }]);
    expect(isProperCartSubset(older, newer)).toBe(false);
  });

  it("true when newer has higher qty of same product", () => {
    const older = normalizeAbandonedCheckoutLines([{ title: "A", quantity: 1 }]);
    const newer = normalizeAbandonedCheckoutLines([{ title: "A", quantity: 2 }]);
    expect(isProperCartSubset(older, newer)).toBe(true);
  });
});
