import { describe, expect, it } from "vitest";

import {
  parseStorefrontProductHandles,
  storefrontOriginFromLocation,
} from "@/lib/osf/sync-shopify-site-status-parse";

describe("storefrontOriginFromLocation", () => {
  it("prefers cosmetics.lk shop name", () => {
    expect(
      storefrontOriginFromLocation({
        shopifyShopName: "cosmetics.lk",
        shopifyAdminStoreHandle: "u71ajc-11",
      }),
    ).toBe("https://cosmetics.lk");
  });

  it("falls back to myshopify host", () => {
    expect(
      storefrontOriginFromLocation({
        shopifyShopName: null,
        shopifyAdminStoreHandle: "u71ajc-11",
      }),
    ).toBe("https://u71ajc-11.myshopify.com");
  });
});

describe("parseStorefrontProductHandles", () => {
  it("keeps product handles from the store origin", () => {
    const xml = `
      <url><loc>https://cosmetics.lk/products/jovees-sun-defence-cream-spf-50-pa-50g</loc></url>
      <url><loc>https://other.example/products/ignore-me</loc></url>
    `;
    const handles = parseStorefrontProductHandles(xml, "https://cosmetics.lk");
    expect([...handles]).toEqual(["jovees-sun-defence-cream-spf-50-pa-50g"]);
  });
});
