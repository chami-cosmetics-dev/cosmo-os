import { describe, expect, it } from "vitest";

import {
  accumulateLatestPurchase,
  accumulateMonthlyPurchases,
  purchaseCellForSku,
} from "@/lib/vault-osf/erp-purchases-monthly";

const suppliers = [{ name: "US Beauty", code: "SV004" }];
const bounds = { start: "2026-07-01", end: "2026-07-31" };

describe("vault OSF monthly purchases", () => {
  it("sums qty and net_amount for allowlisted suppliers", () => {
    const map = accumulateMonthlyPurchases({
      allowedSuppliers: suppliers,
      bounds,
      rows: [
        {
          item_code: "WM001-1",
          qty: 2,
          net_amount: 7800,
          supplier: "SV004",
          supplier_name: "US Beauty",
          posting_date: "2026-07-05",
          company: "Origins (PVT) LTD",
        },
        {
          item_code: "WM001-1",
          qty: 10,
          net_amount: 39000,
          supplier: "SV004",
          supplier_name: "US Beauty",
          posting_date: "2026-07-20",
          company: "AE (PVT) LTD",
        },
      ],
    });
    expect(map.get("WM001-1")).toEqual({ qty: 12, netValue: 46800 });
  });

  it("skips non-allowlisted and Origins Online; missing SKU is blank not 0", () => {
    const map = accumulateMonthlyPurchases({
      allowedSuppliers: suppliers,
      bounds,
      rows: [
        {
          item_code: "WM001-1",
          qty: 5,
          net_amount: 1000,
          supplier: "INTERNAL",
          supplier_name: "AE (PVT) LTD",
          posting_date: "2026-07-05",
          company: "AE (PVT) LTD",
        },
        {
          item_code: "WM001-1",
          qty: 1,
          net_amount: 100,
          supplier: "SV004",
          supplier_name: "US Beauty",
          posting_date: "2026-07-05",
          company: "Origins Online",
        },
      ],
    });
    expect(purchaseCellForSku(map, "WM001-1")).toEqual({ qty: null, netValue: null });
    expect(purchaseCellForSku(map, "NONE")).toEqual({ qty: null, netValue: null });
  });

  it("picks newest posting_date across rows for latest price", () => {
    const latest = accumulateLatestPurchase({
      allowedSuppliers: [
        { name: "Maiso Franceise", code: "SV016" },
        { name: "Sachintha", code: "SV005" },
      ],
      rows: [
        {
          item_code: "NW004-2",
          rate: 5600,
          posting_date: "2026-08-20",
          supplier: "SV016",
          supplier_name: "Maiso Franceise",
        },
        {
          item_code: "NW004-2",
          rate: 5000,
          posting_date: "2026-09-03",
          supplier: "SV005",
          supplier_name: "Sachintha",
        },
      ],
    });
    expect(latest.get("NW004-2")).toEqual({
      rate: 5000,
      supplier: "Sachintha",
      date: "2026-09-03",
    });
  });
});
