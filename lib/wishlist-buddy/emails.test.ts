import { describe, expect, it } from "vitest";

import { buildBackInStockEmail, buildCheckingAvailabilityEmail } from "./emails";

const base = {
  customerName: "Nimal Perera",
  productTitle: "Rose Serum",
  variantTitle: "30ml",
  productUrl: "https://cosmetics.lk/products/rose-serum?variant=1",
  shopName: "Cosmetics.lk",
};

describe("buildCheckingAvailabilityEmail", () => {
  it("promises a call, not stock", () => {
    const email = buildCheckingAvailabilityEmail(base);
    expect(email.subject).toBe("We're checking availability: Rose Serum (30ml)");
    expect(email.plain).toContain("Hi Nimal,");
    expect(email.plain).toContain("we're checking availability and will call you");
    expect(email.fromName).toBe("Cosmetics.lk");
  });
});

describe("buildBackInStockEmail", () => {
  it("links to the product", () => {
    const email = buildBackInStockEmail(base);
    expect(email.subject).toBe("Back in stock: Rose Serum (30ml)");
    expect(email.html).toContain('href="https://cosmetics.lk/products/rose-serum?variant=1"');
    expect(email.plain).toContain(base.productUrl);
  });

  it("escapes customer-supplied text in HTML", () => {
    const email = buildBackInStockEmail({ ...base, customerName: "<script>x</script>", productUrl: null });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("Shop now");
  });

  it("falls back to the default shop name", () => {
    expect(buildBackInStockEmail({ ...base, shopName: null }).fromName).toBe("Cosmetics.lk");
  });
});
