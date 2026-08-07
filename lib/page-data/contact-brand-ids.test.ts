import { describe, expect, it } from "vitest";

import { lineMatchesBrand } from "@/lib/page-data/contact-brand-ids";

describe("lineMatchesBrand", () => {
  it("matches vendor name", () => {
    expect(lineMatchesBrand("Anua", { vendorName: "Anua", productTitle: "Something" })).toBe(
      true
    );
  });

  it("matches whole-word brand in title", () => {
    expect(
      lineMatchesBrand("Anua", { vendorName: null, productTitle: "Anua Soft Cream 50ml" })
    ).toBe(true);
    expect(
      lineMatchesBrand("Anua", { vendorName: null, productTitle: "ANUA / Heartleaf Toner" })
    ).toBe(true);
  });

  it("does not match Banana as Anua", () => {
    expect(
      lineMatchesBrand("Anua", { vendorName: null, productTitle: "Banana Lip Balm" })
    ).toBe(false);
    expect(
      lineMatchesBrand("Anua", { vendorName: null, productTitle: "Organic Banana Mask" })
    ).toBe(false);
  });
});
