import { describe, expect, it } from "vitest";

import { orderStageUpdate, resolveOrderStageEnteredAt, waitingHoursSince } from "@/lib/order-stage-timing";

describe("orderStageUpdate", () => {
  it("sets fulfillmentStage and fulfillmentStageEnteredAt", () => {
    const at = new Date("2026-06-20T10:00:00Z");
    expect(orderStageUpdate("print", at)).toEqual({
      fulfillmentStage: "print",
      fulfillmentStageEnteredAt: at,
    });
  });
});

describe("resolveOrderStageEnteredAt", () => {
  const base = {
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-10T00:00:00Z"),
  };

  it("prefers fulfillmentStageEnteredAt when set", () => {
    const entered = new Date("2026-06-15T00:00:00Z");
    expect(
      resolveOrderStageEnteredAt({
        ...base,
        fulfillmentStage: "print",
        fulfillmentStageEnteredAt: entered,
      })
    ).toEqual(entered);
  });

  it("falls back per stage", () => {
    expect(
      resolveOrderStageEnteredAt({
        ...base,
        fulfillmentStage: "order_received",
      })
    ).toEqual(base.createdAt);

    expect(
      resolveOrderStageEnteredAt({
        ...base,
        fulfillmentStage: "ready_to_dispatch",
        packageReadyAt: new Date("2026-06-08T00:00:00Z"),
      })
    ).toEqual(new Date("2026-06-08T00:00:00Z"));
  });
});

describe("waitingHoursSince", () => {
  it("returns whole hours elapsed", () => {
    const now = new Date("2026-06-22T12:00:00Z");
    const since = new Date("2026-06-21T11:30:00Z");
    expect(waitingHoursSince(since, now)).toBe(24);
  });
});
