import { describe, expect, it } from "vitest";

import {
  notifyRequestBodySchema,
  shopifyNumericId,
  stockRequestListQuerySchema,
  stockRequestPatchBodySchema,
} from "./validation";

describe("shopifyNumericId", () => {
  it("accepts numbers and GIDs", () => {
    expect(shopifyNumericId("gid://shopify/ProductVariant/4455")).toBe("4455");
    expect(shopifyNumericId(4455)).toBe("4455");
    expect(shopifyNumericId("abc")).toBeNull();
    expect(shopifyNumericId(null)).toBeNull();
  });
});

describe("notifyRequestBodySchema", () => {
  const valid = { variantId: "gid://shopify/ProductVariant/12", name: " Nimal ", email: "Nimal@Example.com", phone: "+94 77 123 4567" };

  it("normalizes a valid form", () => {
    const parsed = notifyRequestBodySchema.parse(valid);
    expect(parsed).toMatchObject({ variantId: "12", name: "Nimal", email: "nimal@example.com", phone: "0771234567" });
  });

  it("rejects bad phone, email, and filled honeypot", () => {
    expect(notifyRequestBodySchema.safeParse({ ...valid, phone: "12345" }).success).toBe(false);
    expect(notifyRequestBodySchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(notifyRequestBodySchema.safeParse({ ...valid, website: "spam.example" }).success).toBe(false);
  });
});

describe("stockRequestPatchBodySchema", () => {
  it("requires at least one field and a known status", () => {
    expect(stockRequestPatchBodySchema.safeParse({}).success).toBe(false);
    expect(stockRequestPatchBodySchema.safeParse({ status: "closed" }).success).toBe(false);
    expect(stockRequestPatchBodySchema.safeParse({ status: "order_placed" }).success).toBe(true);
  });
});

describe("stockRequestListQuerySchema", () => {
  it("accepts known stock filters and rejects others", () => {
    expect(stockRequestListQuerySchema.parse({ stock: "found" }).stock).toBe("found");
    expect(stockRequestListQuerySchema.parse({ stock: "restocked", status: "open" })).toMatchObject({
      stock: "restocked",
      status: "open",
    });
    expect(stockRequestListQuerySchema.safeParse({ stock: "pending" }).success).toBe(false);
  });
});
