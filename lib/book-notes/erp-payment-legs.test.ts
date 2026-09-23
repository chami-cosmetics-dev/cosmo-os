import { describe, expect, it } from "vitest";

import { groupErpPaymentLegs } from "@/lib/book-notes/erp-payment-legs";

describe("groupErpPaymentLegs", () => {
  it("maps two receive PEs against one invoice", () => {
    const grouped = groupErpPaymentLegs(
      [
        {
          parent: "REC100-1067",
          reference_name: "100-001170",
          allocated_amount: 28000,
        },
        {
          parent: "REC100-1068",
          reference_name: "100-001170",
          allocated_amount: 2890,
        },
      ],
      [
        {
          name: "REC100-1067",
          mode_of_payment: "Cash",
          payment_type: "Receive",
          docstatus: 1,
        },
        {
          name: "REC100-1068",
          mode_of_payment: "Credit Card",
          payment_type: "Receive",
          docstatus: 1,
        },
      ],
    );
    expect(grouped.get("100-001170")).toEqual([
      { paymentType: "Receive", modeOfPayment: "Cash", allocatedAmount: 28000 },
      {
        paymentType: "Receive",
        modeOfPayment: "Credit Card",
        allocatedAmount: 2890,
      },
    ]);
  });

  it("drops Pay refunds and draft PEs", () => {
    const grouped = groupErpPaymentLegs(
      [
        {
          parent: "REC-1",
          reference_name: "100-001170",
          allocated_amount: 1000,
        },
        {
          parent: "PAY-1",
          reference_name: "100-001170",
          allocated_amount: 200,
        },
        {
          parent: "DRAFT-1",
          reference_name: "100-001170",
          allocated_amount: 50,
        },
      ],
      [
        {
          name: "REC-1",
          mode_of_payment: "Cash",
          payment_type: "Receive",
          docstatus: 1,
        },
        {
          name: "PAY-1",
          mode_of_payment: "Cash",
          payment_type: "Pay",
          docstatus: 1,
        },
        {
          name: "DRAFT-1",
          mode_of_payment: "Cash",
          payment_type: "Receive",
          docstatus: 0,
        },
      ],
    );
    expect(grouped.get("100-001170")).toEqual([
      { paymentType: "Receive", modeOfPayment: "Cash", allocatedAmount: 1000 },
    ]);
  });
});
