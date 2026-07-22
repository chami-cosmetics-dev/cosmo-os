import { describe, expect, it } from "vitest";

import { aggregateErpSalesInvoiceRows } from "@/lib/daily-sales-sms-erp";

describe("aggregateErpSalesInvoiceRows", () => {
  const companyToLocationId = new Map([
    ["origins (pvt) ltd", "loc-origins"],
    ["ae (pvt) ltd", "loc-ae"],
    ["supplementvault.lk", "loc-sv"],
  ]);

  it("nets same-day returns into company totals (ERP day report)", () => {
    const agg = aggregateErpSalesInvoiceRows(
      [
        { company: "Origins (PVT) LTD", net_total: 109900, is_return: 0, docstatus: 1 },
        { company: "AE (PVT) LTD", net_total: 51902.5, is_return: 0, docstatus: 1 },
        { company: "AE (PVT) LTD", net_total: -7600, is_return: 1, docstatus: 1 },
        { company: "SupplementVault.lk", net_total: 45450, is_return: 0, docstatus: 1 },
        { company: "SupplementVault.lk", net_total: -10950, is_return: 1, docstatus: 1 },
        { company: "SupplementVault.lk", net_total: -31560, is_return: 1, docstatus: 1 },
        { company: "SupplementVault.lk", net_total: -29950, is_return: 1, docstatus: 1 },
      ],
      companyToLocationId,
    );

    expect(agg.total).toBe(127192.5);
    expect(agg.count).toBe(3); // non-return sales invoices only
    expect(agg.byLocation.get("loc-origins")).toBe(109900);
    expect(agg.byLocation.get("loc-ae")).toBe(44302.5);
    expect(agg.byLocation.get("loc-sv")).toBe(-27010);
  });

  it("skips non-submitted docs", () => {
    const agg = aggregateErpSalesInvoiceRows(
      [
        { company: "Origins (PVT) LTD", net_total: 1000, is_return: 0, docstatus: 1 },
        { company: "Origins (PVT) LTD", net_total: 400, is_return: 0, docstatus: 0 },
        { company: "Origins (PVT) LTD", net_total: 500, is_return: 0, docstatus: 2 },
      ],
      companyToLocationId,
    );
    expect(agg.total).toBe(1000);
    expect(agg.count).toBe(1);
  });
});
