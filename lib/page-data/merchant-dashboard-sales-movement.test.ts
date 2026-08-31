import { describe, expect, it } from "vitest";

import {
  buildMerchantSalesMovement,
  previousAppIsoDate,
  type MovementSourceOrder,
} from "@/lib/page-data/merchant-dashboard-sales-movement";

function row(
  partial: Partial<MovementSourceOrder> & Pick<MovementSourceOrder, "invoiceLabel" | "amount">,
): MovementSourceOrder {
  return {
    createdYmd: "2026-08-31",
    updatedYmd: "2026-08-31",
    cancelledYmd: null,
    eligible: true,
    removalReason: "voided",
    ...partial,
  };
}

describe("buildMerchantSalesMovement", () => {
  it("walks yesterday opening plus today invoices minus voids to current MTD", () => {
    const movement = buildMerchantSalesMovement({
      todayYmd: "2026-08-31",
      orders: [
        row({
          invoiceLabel: "OLD-1",
          amount: 2_000_000,
          createdYmd: "2026-08-10",
          updatedYmd: "2026-08-10",
          eligible: true,
        }),
        row({
          invoiceLabel: "110-000427",
          amount: 5710,
          createdYmd: "2026-08-31",
          eligible: true,
        }),
        row({
          invoiceLabel: "60018654",
          amount: 10350,
          createdYmd: "2026-08-30",
          updatedYmd: "2026-08-31",
          cancelledYmd: "2026-08-31",
          eligible: false,
          removalReason: "voided",
        }),
        row({
          invoiceLabel: "60018660",
          amount: 5710,
          createdYmd: "2026-08-31",
          cancelledYmd: "2026-08-31",
          eligible: false,
          removalReason: "voided",
        }),
      ],
    });

    expect(previousAppIsoDate("2026-08-31")).toBe("2026-08-30");
    expect(movement.openingTotal).toBe(2_010_350);
    expect(movement.additions.map((l) => l.invoiceLabel)).toEqual([
      "110-000427",
      "60018660",
    ]);
    expect(movement.removals.map((l) => l.invoiceLabel)).toEqual([
      "60018654",
      "60018660",
    ]);
    expect(movement.closingTotal).toBe(2_005_710);
    expect(movement.countedMtd).toBe(2_005_710);
    expect(movement.countedToday).toBe(5710);
  });

  it("labels returns separately from voids", () => {
    const movement = buildMerchantSalesMovement({
      todayYmd: "2026-08-31",
      orders: [
        row({
          invoiceLabel: "RET-1",
          amount: 4000,
          createdYmd: "2026-08-05",
          updatedYmd: "2026-08-31",
          eligible: false,
          removalReason: "return",
        }),
      ],
    });
    expect(movement.openingTotal).toBe(4000);
    expect(movement.removals[0]?.reason).toBe("return");
    expect(movement.closingTotal).toBe(0);
    expect(movement.countedMtd).toBe(0);
  });
});
