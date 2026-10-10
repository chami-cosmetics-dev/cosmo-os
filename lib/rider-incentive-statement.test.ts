import { describe, expect, it } from "vitest";

import {
  groupIncentiveStatement,
  incentiveExportBlockReason,
  incentiveStatementCsv,
  type IncentiveStatementInput,
} from "@/lib/rider-incentive-statement";

function line(overrides: Partial<IncentiveStatementInput> & Pick<IncentiveStatementInput, "company" | "invoiceNumber">): IncentiveStatementInput {
  return {
    date: "2026-08-01",
    shopifyOrderId: "gid",
    shopifyOrderNumber: "#1",
    customerName: "Nimal",
    phone: "0770000000",
    address: "12 Galle Rd, Colombo",
    deliveryCity: "Colombo",
    deliveryCompletedAt: "2026-08-01 10:00:00",
    invoiceCompletedAt: "2026-07-28 09:00:00",
    deliveryStatus: "Complete",
    invoiceStatus: "Complete",
    shippingCost: 0,
    riderPayment: 0,
    unmatched: false,
    ...overrides,
  };
}

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
      line({
        date: "2026-08-02",
        shopifyOrderNumber: "#2",
        invoiceNumber: "600-2",
        company: "SPK Trading (Pvt) Ltd",
        invoiceStatus: "Open",
        invoiceCompletedAt: "",
        shippingCost: 400,
      }),
      line({
        date: "2026-08-01",
        shopifyOrderNumber: "#1",
        invoiceNumber: "600-1",
        company: "SPK Trading (Pvt) Ltd",
        shippingCost: 400,
        riderPayment: 300,
      }),
      line({
        date: "2026-08-03",
        shopifyOrderNumber: "#3",
        invoiceNumber: "800-3",
        company: "DTD Trading (Pvt) Ltd",
        shippingCost: 500,
        unmatched: true,
      }),
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
      line({
        invoiceNumber: "600-1",
        company: "SPK",
        shopifyOrderId: "555",
        deliveryCity: "Nugegoda",
        shippingCost: 400,
        riderPayment: 300,
      }),
    ]);
    const csv = incentiveStatementCsv({
      riderName: "Sampath",
      companies: statement.companies,
      shippingTotal: statement.shippingTotal,
      riderPaymentTotal: statement.riderPaymentTotal,
    });
    expect(csv).toContain("Shopify order id");
    expect(csv).toContain("555");
    expect(csv).toContain("Nugegoda");
    expect(csv).toContain("2026-07-28 09:00:00");
    expect(csv).toContain("2026-08-01 10:00:00");
    expect(csv).toContain("Company total");
    expect(csv).toContain("Full total");
    expect(csv).toContain("300.00");
  });
});
