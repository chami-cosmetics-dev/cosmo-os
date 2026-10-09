import { describe, expect, it } from "vitest";

import {
  groupIncentiveStatement,
  incentiveExportBlockReason,
  incentiveStatementCsv,
} from "@/lib/rider-incentive-statement";

describe("incentiveExportBlockReason", () => {
  it("blocks export while unmatched orders remain", () => {
    expect(incentiveExportBlockReason(2)).toBe("Finish 2 unmatched orders before export");
    expect(incentiveExportBlockReason(1)).toBe("Finish 1 unmatched order before export");
    expect(incentiveExportBlockReason(0)).toBeNull();
  });
});

describe("groupIncentiveStatement", () => {
  it("splits orders by company and keeps open invoices at zero pay", () => {
    const statement = groupIncentiveStatement([
      {
        date: "2026-08-02",
        orderNumber: "2",
        invoiceNumber: "600-2",
        company: "SPK Trading (Pvt) Ltd",
        deliveryStatus: "Complete",
        invoiceStatus: "Open",
        shippingCost: 400,
        riderPayment: 0,
        unmatched: false,
      },
      {
        date: "2026-08-01",
        orderNumber: "1",
        invoiceNumber: "600-1",
        company: "SPK Trading (Pvt) Ltd",
        deliveryStatus: "Complete",
        invoiceStatus: "Complete",
        shippingCost: 400,
        riderPayment: 300,
        unmatched: false,
      },
      {
        date: "2026-08-03",
        orderNumber: "3",
        invoiceNumber: "800-3",
        company: "DTD Trading (Pvt) Ltd",
        deliveryStatus: "Complete",
        invoiceStatus: "Complete",
        shippingCost: 500,
        riderPayment: 0,
        unmatched: true,
      },
    ]);

    expect(statement.companies.map((company) => company.company)).toEqual([
      "DTD Trading (Pvt) Ltd",
      "SPK Trading (Pvt) Ltd",
    ]);
    expect(statement.companies[1]?.orders.map((order) => order.invoiceNumber)).toEqual([
      "600-1",
      "600-2",
    ]);
    expect(statement.companies[1]?.riderPaymentTotal).toBe("300.00");
    expect(statement.companies[0]?.riderPaymentTotal).toBe("0.00");
    expect(statement.riderPaymentTotal).toBe("300.00");
    expect(statement.shippingTotal).toBe("1300.00");
    expect(statement.unmatchedCount).toBe(1);
  });
});

describe("incentiveStatementCsv", () => {
  it("writes company totals and a full total", () => {
    const statement = groupIncentiveStatement([
      {
        date: "2026-08-01",
        orderNumber: "1",
        invoiceNumber: "600-1",
        company: "SPK",
        deliveryStatus: "Complete",
        invoiceStatus: "Complete",
        shippingCost: 400,
        riderPayment: 300,
        unmatched: false,
      },
    ]);
    const csv = incentiveStatementCsv({
      riderName: "Sampath",
      companies: statement.companies,
      shippingTotal: statement.shippingTotal,
      riderPaymentTotal: statement.riderPaymentTotal,
    });
    expect(csv).toContain("Sampath");
    expect(csv).toContain("Company total");
    expect(csv).toContain("Full total");
    expect(csv).toContain("300.00");
  });
});
