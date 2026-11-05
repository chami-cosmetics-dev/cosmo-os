import { afterEach, describe, expect, it } from "vitest";

import {
  buildMerchantOrderStatusUrl,
  openMerchantOrderStatusToken,
  sealMerchantOrderStatusToken,
} from "@/lib/merchant-orders/status-token";

describe("merchant order status token", () => {
  afterEach(() => {
    delete process.env.MERCHANT_ORDERS_API_KEY;
    delete process.env.MERCHANT_ORDERS_STATUS_SECRET;
    delete process.env.APP_BASE_URL;
  });

  it("seals and opens an order id", () => {
    process.env.MERCHANT_ORDERS_API_KEY = "status-test-key";
    const token = sealMerchantOrderStatusToken("clxyzorder123");
    expect(token).toBeTruthy();
    expect(token).not.toContain("clxyzorder123");
    expect(openMerchantOrderStatusToken(token!)).toBe("clxyzorder123");
  });

  it("rejects tampered tokens", () => {
    process.env.MERCHANT_ORDERS_API_KEY = "status-test-key";
    const token = sealMerchantOrderStatusToken("clxyzorder123")!;
    const flipped = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(openMerchantOrderStatusToken(flipped)).toBeNull();
    expect(openMerchantOrderStatusToken("not-a-token")).toBeNull();
  });

  it("builds a Cosmo status URL", () => {
    process.env.MERCHANT_ORDERS_API_KEY = "status-test-key";
    process.env.APP_BASE_URL = "https://os.cosmetics.lk";
    const url = buildMerchantOrderStatusUrl("clxyzorder123");
    expect(url.startsWith("https://os.cosmetics.lk/o/")).toBe(true);
    const token = url.slice("https://os.cosmetics.lk/o/".length);
    expect(openMerchantOrderStatusToken(token)).toBe("clxyzorder123");
  });

  it("returns empty when no secret is configured", () => {
    expect(sealMerchantOrderStatusToken("clxyzorder123")).toBeNull();
    expect(buildMerchantOrderStatusUrl("clxyzorder123")).toBe("");
  });
});
