import { describe, expect, it } from "vitest";

import { decideShopReturnConfirm } from "@/lib/material-transfer/confirm";

describe("decideShopReturnConfirm", () => {
  it("refuses a request that is not open", () => {
    expect(
      decideShopReturnConfirm({
        status: "confirmed",
        lines: [{ itemCode: "A", qty: 2, availableQty: 5 }],
      }),
    ).toEqual({ ok: false, reason: "not_open" });
  });

  it("refuses when every qty is zero and does not post", () => {
    expect(
      decideShopReturnConfirm({
        status: "requested",
        lines: [{ itemCode: "A", qty: 0, availableQty: 5 }],
      }),
    ).toEqual({ ok: false, reason: "all_zero" });
  });

  it("refuses a qty above the live shop bin and names the item", () => {
    expect(
      decideShopReturnConfirm({
        status: "requested",
        lines: [
          { itemCode: "A", qty: 2, availableQty: 5 },
          { itemCode: "B", qty: 4, availableQty: 1 },
        ],
      }),
    ).toEqual({ ok: false, reason: "short_stock", itemCode: "B" });
  });

  it("posts the counted qty, not the shop sent qty", () => {
    const decision = decideShopReturnConfirm({
      status: "requested",
      lines: [
        { itemCode: "A", qty: 2, availableQty: 5 },
        { itemCode: "B", qty: 0, availableQty: 5 },
      ],
    });
    expect(decision).toEqual({
      ok: true,
      postLines: [{ itemCode: "A", qty: 2 }],
    });
  });
});
