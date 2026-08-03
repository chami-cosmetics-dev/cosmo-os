import { describe, expect, it } from "vitest";

import { shopifyCheckoutWebhookSchema } from "@/lib/validation/shopify-checkout";

describe("shopifyCheckoutWebhookSchema", () => {
  const base = {
    email: "buyer@example.com",
    created_at: "2026-08-03T10:00:00Z",
    updated_at: "2026-08-03T10:05:00Z",
    total_price: "1500.00",
    currency: "LKR",
    line_items: [{ title: "Serum", quantity: 1, price: "1500.00" }],
  };

  it("accepts legacy payloads with numeric id", () => {
    const result = shopifyCheckoutWebhookSchema.safeParse({
      ...base,
      id: 450789469,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("450789469");
    }
  });

  it("accepts 2026-04 payloads with token and no id", () => {
    const result = shopifyCheckoutWebhookSchema.safeParse({
      ...base,
      token: "c6e185593768c4e69bdbe896a548031a",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("c6e185593768c4e69bdbe896a548031a");
      expect(result.data.token).toBe("c6e185593768c4e69bdbe896a548031a");
    }
  });

  it("prefers token when both id and token are present", () => {
    const result = shopifyCheckoutWebhookSchema.safeParse({
      ...base,
      id: 450789469,
      token: "c6e185593768c4e69bdbe896a548031a",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("c6e185593768c4e69bdbe896a548031a");
    }
  });

  it("rejects payloads missing both id and token", () => {
    const result = shopifyCheckoutWebhookSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("rejects null id without token", () => {
    const result = shopifyCheckoutWebhookSchema.safeParse({
      ...base,
      id: null,
    });
    expect(result.success).toBe(false);
  });
});
