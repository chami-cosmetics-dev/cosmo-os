import { describe, expect, it } from "vitest";

import {
  mobileDeliveriesQuerySchema,
  mobileDeliveryStatusFilterSchema,
  mobileLoginSchema,
  riderCashHandoverCreateSchema,
  riderDeliveryCompleteSchema,
  riderDeliveryFailSchema,
  riderPaymentSchema,
} from "@/lib/mobile/validation";

describe("mobileLoginSchema", () => {
  it("accepts valid login payload", () => {
    const result = mobileLoginSchema.safeParse({
      email: "rider@example.com",
      password: "password123",
      deviceName: "Transit-Pad-04",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = mobileLoginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });

    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = mobileLoginSchema.safeParse({
      email: "rider@example.com",
      password: "short",
    });

    expect(result.success).toBe(false);
  });
});

describe("mobileDeliveryStatusFilterSchema", () => {
  it("accepts known delivery statuses", () => {
    expect(mobileDeliveryStatusFilterSchema.safeParse("assigned").success).toBe(true);
    expect(mobileDeliveryStatusFilterSchema.safeParse("active").success).toBe(true);
    expect(mobileDeliveryStatusFilterSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects unknown status", () => {
    expect(mobileDeliveryStatusFilterSchema.safeParse("cancelled").success).toBe(false);
  });
});

describe("mobileDeliveriesQuerySchema", () => {
  it("defaults offset and accepts completed paging", () => {
    const result = mobileDeliveriesQuerySchema.safeParse({
      status: "completed",
      limit: "40",
      on: "2026-11-04",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(0);
      expect(result.data.limit).toBe(40);
      expect(result.data.on).toBe("2026-11-04");
    }
  });

  it("rejects bad on date", () => {
    expect(mobileDeliveriesQuerySchema.safeParse({ on: "04-11-2026" }).success).toBe(false);
  });
});

describe("riderPaymentSchema", () => {
  it("accepts COD payment without reference fields", () => {
    const result = riderPaymentSchema.safeParse({
      paymentMethod: "cod",
      collectedAmount: 1500,
      customerGaveAmount: 1500,
    });

    expect(result.success).toBe(true);
  });

  it("requires bank reference for bank transfer", () => {
    const result = riderPaymentSchema.safeParse({
      paymentMethod: "bank_transfer",
      collectedAmount: 1500,
    });

    expect(result.success).toBe(false);
  });

  it("requires last 4 digits and slip photo for card payment", () => {
    const missing = riderPaymentSchema.safeParse({
      paymentMethod: "card",
      collectedAmount: 1500,
    });
    expect(missing.success).toBe(false);

    const ok = riderPaymentSchema.safeParse({
      paymentMethod: "card",
      collectedAmount: 1500,
      cardLast4: "4242",
      cardSlipImageUrl: "https://res.cloudinary.com/demo/image/upload/slip.jpg",
    });
    expect(ok.success).toBe(true);
  });

  it("accepts split cash + card lines with last 4 and slip", () => {
    const result = riderPaymentSchema.safeParse({
      lines: [
        { paymentMethod: "cod", amount: 2000 },
        { paymentMethod: "card", amount: 3000, cardLast4: "4242" },
      ],
      customerGaveAmount: 2000,
      cardSlipImageUrl: "https://res.cloudinary.com/demo/image/upload/slip.jpg",
    });

    expect(result.success).toBe(true);
  });

  it("requires customer gave for cash collection", () => {
    const result = riderPaymentSchema.safeParse({
      paymentMethod: "cod",
      collectedAmount: 1500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate methods in split payment", () => {
    const result = riderPaymentSchema.safeParse({
      lines: [
        { paymentMethod: "cod", amount: 2000 },
        { paymentMethod: "cod", amount: 3000 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects already_paid combined with other methods", () => {
    const result = riderPaymentSchema.safeParse({
      lines: [
        { paymentMethod: "already_paid", amount: 2000 },
        { paymentMethod: "cod", amount: 3000 },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("riderDeliveryCompleteSchema", () => {
  it("accepts optional timestamps and old item collection", () => {
    const result = riderDeliveryCompleteSchema.safeParse({
      completedAt: "2026-06-10T12:00:00.000Z",
      oldItemCollectionStatus: "collected",
    });

    expect(result.success).toBe(true);
  });
});

describe("riderDeliveryFailSchema", () => {
  it("requires a non-empty reason", () => {
    expect(riderDeliveryFailSchema.safeParse({ reason: "Customer unavailable" }).success).toBe(true);
    expect(riderDeliveryFailSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});

describe("riderCashHandoverCreateSchema", () => {
  it("accepts valid handover payload", () => {
    const result = riderCashHandoverCreateSchema.safeParse({
      totalHandedOverCash: 5000,
      notes: "End of shift",
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative cash totals", () => {
    const result = riderCashHandoverCreateSchema.safeParse({
      totalHandedOverCash: -1,
    });

    expect(result.success).toBe(false);
  });
});
