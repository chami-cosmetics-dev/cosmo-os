import { describe, expect, it } from "vitest";

import { resolveRiderOpsPaymentDisplay } from "@/lib/rider-ops-payment-display";

describe("resolveRiderOpsPaymentDisplay", () => {
  it("uses DeliveryPayment when present", () => {
    const result = resolveRiderOpsPaymentDisplay({
      deliveryPayment: {
        expectedAmount: { toString: () => "1000.00" },
        collectedAmount: { toString: () => "1000.00" },
        paymentMethod: "cod",
        collectionStatus: "collected",
        lines: [{ paymentMethod: "cod", amount: { toString: () => "1000.00" } }],
      },
      order: {
        totalPrice: { toString: () => "9999.00" },
        financialStatus: "pending",
        paymentGatewayPrimary: "Cash on Delivery (COD)",
      },
    });

    expect(result.amountSource).toBe("payment");
    expect(result.expectedAmount).toBe("1000.00");
    expect(result.collectedAmount).toBe("1000.00");
    expect(result.paymentMethod).toBe("cod");
    expect(result.paymentLines).toHaveLength(1);
  });

  it("falls back to order total and infers COD", () => {
    const result = resolveRiderOpsPaymentDisplay({
      deliveryPayment: null,
      order: {
        totalPrice: { toString: () => "5500.50" },
        financialStatus: "pending",
        paymentGatewayPrimary: "Cash on Delivery (COD)",
        paymentGatewayNames: ["Cash on Delivery (COD)"],
      },
    });

    expect(result.amountSource).toBe("order_total");
    expect(result.expectedAmount).toBe("5500.50");
    expect(result.collectedAmount).toBeNull();
    expect(result.paymentMethod).toBe("cod");
    expect(result.paymentLines).toEqual([]);
  });

  it("falls back to already_paid when gateway shows paid", () => {
    const result = resolveRiderOpsPaymentDisplay({
      deliveryPayment: null,
      order: {
        totalPrice: { toString: () => "2000.00" },
        financialStatus: "paid",
        paymentGatewayPrimary: "manual",
        paymentGatewayNames: ["manual"],
      },
    });

    expect(result.amountSource).toBe("order_total");
    expect(result.paymentMethod).toBe("already_paid");
    expect(result.expectedAmount).toBe("2000.00");
  });

  it("joins multi-line payment methods", () => {
    const result = resolveRiderOpsPaymentDisplay({
      deliveryPayment: {
        expectedAmount: { toString: () => "1500.00" },
        collectedAmount: { toString: () => "1500.00" },
        paymentMethod: "cod",
        collectionStatus: "collected",
        lines: [
          { paymentMethod: "cod", amount: { toString: () => "1000.00" } },
          { paymentMethod: "card", amount: { toString: () => "500.00" } },
        ],
      },
      order: { totalPrice: { toString: () => "1500.00" } },
    });

    expect(result.paymentMethod).toBe("cod+card");
    expect(result.paymentLines).toHaveLength(2);
  });

  it("uses cash-split collect amount as rider expected cash", () => {
    const result = resolveRiderOpsPaymentDisplay({
      deliveryPayment: null,
      order: {
        totalPrice: { toString: () => "7750.00" },
        financialStatus: "pending",
        paymentGatewayPrimary: "KOKO",
        collectCashAmount: 2000,
      },
    });

    expect(result.expectedAmount).toBe("2000.00");
    expect(result.paymentMethod).toBe("cod");
  });
});
