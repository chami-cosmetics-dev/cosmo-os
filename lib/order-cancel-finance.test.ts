import { describe, expect, it } from "vitest";

import {
  merchantCanRequestOrderCancel,
  orderCancelFinanceCc,
  resolveCancelFinanceLocationId,
  canRequestPosOrderCancel,
  viewerCreatedPosOrder,
  type CancelFinanceLocation,
} from "@/lib/order-cancel-finance";

const dtd: CancelFinanceLocation = {
  id: "loc-dtd",
  name: "DTD Trading Lanka (Pvt) Ltd",
  shortName: "DTD",
  manualInvoicePrefix: null,
  locationReference: null,
};

const cosmetics: CancelFinanceLocation = {
  id: "loc-cos",
  name: "Cosmetics.lk",
  shortName: null,
  manualInvoicePrefix: "600",
  locationReference: null,
};

describe("resolveCancelFinanceLocationId", () => {
  it("sends a 110 order to the location whose prefix is 110", () => {
    const id = resolveCancelFinanceLocationId({
      orderCompanyLocationId: "loc-other",
      orderRefs: ["11084521"],
      locations: [
        cosmetics,
        { ...dtd, manualInvoicePrefix: "110" },
      ],
      prefixAccounts: [],
    });
    expect(id).toBe("loc-dtd");
  });

  it("matches CityPak label DTD when the location name starts with that label", () => {
    const id = resolveCancelFinanceLocationId({
      orderCompanyLocationId: null,
      orderRefs: ["#1101001"],
      locations: [dtd, cosmetics],
      prefixAccounts: [{ invoicePrefix: "110", label: "DTD" }],
    });
    expect(id).toBe("loc-dtd");
  });

  it("falls back to the order company location when the prefix is unknown", () => {
    const id = resolveCancelFinanceLocationId({
      orderCompanyLocationId: "loc-dtd",
      orderRefs: ["1101001"],
      locations: [cosmetics],
      prefixAccounts: [],
    });
    expect(id).toBe("loc-dtd");
  });
});

describe("orderCancelFinanceCc", () => {
  it("CCs ndilrukshi on web cancel requests", () => {
    expect(orderCancelFinanceCc(false)).toEqual(["ndilrukshi.cosmetics@outlook.com"]);
  });

  it("CCs ndilrukshi and careers on POS cancel requests", () => {
    expect(orderCancelFinanceCc(true)).toEqual([
      "ndilrukshi.cosmetics@outlook.com",
      "careers@cosmetics.lk",
    ]);
  });
});

describe("viewerCreatedPosOrder", () => {
  it("allows only the user stored as the POS order creator", () => {
    expect(viewerCreatedPosOrder("user-a", "user-a")).toBe(true);
    expect(viewerCreatedPosOrder("user-b", "user-a")).toBe(false);
    expect(viewerCreatedPosOrder("user-a", null)).toBe(false);
  });
});

describe("canRequestPosOrderCancel", () => {
  it("lets an admin request cancel on a POS order they did not create", () => {
    expect(
      canRequestPosOrderCancel({
        viewerUserId: "admin",
        assignedMerchantId: "cashier",
        roleNames: ["admin"],
      }),
    ).toBe(true);
  });

  it("still lets the creator request cancel without an admin role", () => {
    expect(
      canRequestPosOrderCancel({
        viewerUserId: "cashier",
        assignedMerchantId: "cashier",
        roleNames: ["merchant"],
      }),
    ).toBe(true);
    expect(
      canRequestPosOrderCancel({
        viewerUserId: "other",
        assignedMerchantId: "cashier",
        roleNames: ["merchant"],
      }),
    ).toBe(false);
  });
});

describe("merchantCanRequestOrderCancel", () => {
  it("allows POS cancel after the counter sale is complete", () => {
    expect(
      merchantCanRequestOrderCancel({
        isPos: true,
        fulfillmentStage: "invoice_complete",
        financialStatus: "paid",
        hasPendingCancelApproval: false,
      }),
    ).toBe(true);
  });

  it("keeps web cancel limited to pre-dispatch stages", () => {
    expect(
      merchantCanRequestOrderCancel({
        isPos: false,
        fulfillmentStage: "invoice_complete",
        financialStatus: "paid",
        hasPendingCancelApproval: false,
      }),
    ).toBe(false);
    expect(
      merchantCanRequestOrderCancel({
        isPos: false,
        fulfillmentStage: "print",
        financialStatus: "paid",
        hasPendingCancelApproval: false,
      }),
    ).toBe(true);
  });

  it("hides cancel when the order is voided or already waiting on finance", () => {
    expect(
      merchantCanRequestOrderCancel({
        isPos: true,
        fulfillmentStage: "invoice_complete",
        financialStatus: "voided",
        hasPendingCancelApproval: false,
      }),
    ).toBe(false);
    expect(
      merchantCanRequestOrderCancel({
        isPos: true,
        fulfillmentStage: "invoice_complete",
        financialStatus: "paid",
        hasPendingCancelApproval: true,
      }),
    ).toBe(false);
  });
});
