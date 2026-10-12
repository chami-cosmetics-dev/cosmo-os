import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { isAppProxyTimestampFresh, verifyAppProxySignature } from "./app-proxy-signature";

const SECRET = "hush";

function sign(params: Record<string, string>): string {
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("");
  return createHmac("sha256", SECRET).update(message).digest("hex");
}

describe("verifyAppProxySignature", () => {
  it("joins repeated keys with commas", () => {
    // Shopify signs `extra=1&extra=2` as `extra=1,2`.
    const signature = sign({ extra: "1,2", shop: "shop-name.myshopify.com", timestamp: "1317327555" });
    const sp = new URLSearchParams(
      `extra=1&extra=2&shop=shop-name.myshopify.com&timestamp=1317327555&signature=${signature}`,
    );
    expect(verifyAppProxySignature(sp, SECRET)).toBe(true);
  });

  it("accepts a valid signature", () => {
    const params = { shop: "cosmetics-lk.myshopify.com", path_prefix: "/apps/wishlist-buddy", timestamp: "1700000000" };
    const sp = new URLSearchParams({ ...params, signature: sign(params) });
    expect(verifyAppProxySignature(sp, SECRET)).toBe(true);
  });

  it("rejects a tampered param", () => {
    const params = { shop: "cosmetics-lk.myshopify.com", timestamp: "1700000000" };
    const sp = new URLSearchParams({ ...params, signature: sign(params) });
    sp.set("shop", "evil.myshopify.com");
    expect(verifyAppProxySignature(sp, SECRET)).toBe(false);
  });

  it("rejects missing signature or secret", () => {
    expect(verifyAppProxySignature(new URLSearchParams("shop=a"), SECRET)).toBe(false);
    const params = { shop: "a" };
    expect(verifyAppProxySignature(new URLSearchParams({ ...params, signature: sign(params) }), "")).toBe(false);
  });
});

describe("isAppProxyTimestampFresh", () => {
  it("accepts recent and rejects stale or missing timestamps", () => {
    const now = 1_700_000_000_000;
    expect(isAppProxyTimestampFresh(new URLSearchParams("timestamp=1700000000"), now)).toBe(true);
    expect(isAppProxyTimestampFresh(new URLSearchParams("timestamp=1699990000"), now)).toBe(false);
    expect(isAppProxyTimestampFresh(new URLSearchParams(""), now)).toBe(false);
  });
});
