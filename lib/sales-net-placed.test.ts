import { describe, expect, it } from "vitest";

import { salesNetContribution } from "@/lib/sales-net-placed";

function order(input: {
  created: string;
  total: number;
  cancelled?: string;
  status?: string;
  stage?: string;
  stageAt?: string;
  returnDate?: string;
}) {
  return {
    createdAt: new Date(input.created),
    cancelledAt: input.cancelled ? new Date(input.cancelled) : null,
    financialStatus: input.status ?? "pending",
    fulfillmentStage: input.stage ?? "order_received",
    fulfillmentStageEnteredAt: input.stageAt ? new Date(input.stageAt) : null,
    totalPrice: input.total,
    returnDate: input.returnDate ? new Date(input.returnDate) : null,
  };
}

describe("salesNetContribution", () => {
  it("includes unpaid and paid orders placed in the range", () => {
    expect(
      salesNetContribution(order({ created: "2026-10-25T04:00:00.000Z", total: 1000, status: "unpaid" }), "2026-10-25", "2026-10-25"),
    ).toEqual({ signedAmount: 1000, includeInCount: 1 });
    expect(
      salesNetContribution(order({ created: "2026-10-25T04:00:00.000Z", total: 2000, status: "paid" }), "2026-10-25", "2026-10-25"),
    ).toEqual({ signedAmount: 2000, includeInCount: 1 });
  });

  it("skips same-day place and cancel", () => {
    expect(
      salesNetContribution(
        order({
          created: "2026-10-01T06:11:09.000Z",
          cancelled: "2026-10-01T06:17:25.000Z",
          total: 17050,
          status: "voided",
        }),
        "2026-10-01",
        "2026-10-01",
      ),
    ).toEqual({ signedAmount: 0, includeInCount: 0 });
  });

  it("keeps the place day and deducts on a later cancel day", () => {
    const placed = order({
      created: "2026-10-01T08:40:00.000Z",
      cancelled: "2026-10-12T08:08:18.000Z",
      total: 11900,
      status: "voided",
    });
    expect(salesNetContribution(placed, "2026-10-01", "2026-10-01")).toEqual({
      signedAmount: 11900,
      includeInCount: 1,
    });
    expect(salesNetContribution(placed, "2026-10-12", "2026-10-12")).toEqual({
      signedAmount: -11900,
      includeInCount: 0,
    });
    expect(salesNetContribution(placed, "2026-10-01", "2026-10-12")).toEqual({
      signedAmount: 0,
      includeInCount: 1,
    });
  });

  it("deducts a September order cancelled in October", () => {
    expect(
      salesNetContribution(
        order({
          created: "2026-09-28T06:18:56.000Z",
          cancelled: "2026-10-09T10:00:00.000Z",
          total: 32215,
          status: "voided",
        }),
        "2026-10-01",
        "2026-10-25",
      ),
    ).toEqual({ signedAmount: -32215, includeInCount: 0 });
  });

  it("does not deduct a live order that only has a solved return ticket", () => {
    expect(
      salesNetContribution(
        order({
          created: "2026-10-26T04:40:27.000Z",
          total: 40350,
          status: "pending",
          stage: "dispatched",
          stageAt: "2026-10-27T06:59:01.000Z",
          returnDate: "2026-10-27T06:57:16.000Z",
        }),
        "2026-10-27",
        "2026-10-27",
      ),
    ).toEqual({ signedAmount: 0, includeInCount: 0 });
  });

  it("never adds a credit note", () => {
    expect(
      salesNetContribution(
        order({ created: "2026-10-20T04:00:00.000Z", total: -25457.5, status: "voided" }),
        "2026-10-20",
        "2026-10-20",
      ),
    ).toEqual({ signedAmount: 0, includeInCount: 0 });
  });
});
