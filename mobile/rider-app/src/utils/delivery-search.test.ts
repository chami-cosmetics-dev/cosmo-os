import { describe, expect, it } from "vitest";

import type { TenantMobileDelivery } from "@/src/types";
import { matchesDeliverySearch } from "@/src/utils/delivery-search";

const baseDelivery: TenantMobileDelivery = {
  id: "d1",
  tenant: "cosmetics",
  companyLabel: "Cosmetics.lk",
  orderLabel: "400-000130",
  orderNumber: "400-000130",
  amount: "500.00",
  currency: "LKR",
  deliveryStatus: "assigned",
  deliveryKind: "normal",
  customerName: "TestCustomer_01",
  customerPhone: "0776713205",
  payment: null,
};

describe("matchesDeliverySearch", () => {
  it("matches by full/partial order number", () => {
    expect(matchesDeliverySearch(baseDelivery, "000130")).toBe(true);
    expect(matchesDeliverySearch(baseDelivery, "400-000")).toBe(true);
  });

  it("matches by last 4 digits", () => {
    expect(matchesDeliverySearch(baseDelivery, "0130")).toBe(true);
  });

  it("matches by customer fields", () => {
    expect(matchesDeliverySearch(baseDelivery, "testcustomer")).toBe(true);
    expect(matchesDeliverySearch(baseDelivery, "3205")).toBe(true);
  });

  it("returns false for unrelated query", () => {
    expect(matchesDeliverySearch(baseDelivery, "9999")).toBe(false);
  });
});

