import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";

import type { IncentiveStatementLine } from "@/lib/rider-incentive-statement";
import {
  buildAllRidersIncentiveWorkbook,
  type RiderIncentiveWorkbookRider,
} from "@/lib/rider-incentive-workbook";

function order(overrides: Partial<IncentiveStatementLine> = {}): IncentiveStatementLine {
  return {
    date: "2026-08-01",
    shopifyOrderId: "555",
    shopifyOrderNumber: "#1",
    invoiceNumber: "600-1",
    customerName: "Nimal",
    phone: "0770000000",
    address: "12 Galle Rd, Colombo",
    deliveryCity: "Colombo",
    deliveryCompletedAt: "2026-08-01 10:00:00",
    invoiceCompletedAt: "2026-07-28 09:00:00",
    deliveryStatus: "Complete",
    invoiceStatus: "Complete",
    shippingCost: "400.00",
    riderPayment: "300.00",
    unmatched: false,
    pickup: false,
    orderShipping: "Nugegoda",
    payMethod: "Nugegoda",
    ...overrides,
  };
}

function rider(
  riderName: string,
  company: string,
  orders: IncentiveStatementLine[],
  shippingTotal: string,
  riderPaymentTotal: string,
): RiderIncentiveWorkbookRider {
  return {
    riderName,
    companies: [{ company, orders, shippingTotal, riderPaymentTotal }],
    shippingTotal,
    riderPaymentTotal,
    unmatchedCount: orders.filter((line) => line.unmatched).length,
  };
}

describe("buildAllRidersIncentiveWorkbook", () => {
  it("writes one pay row per order with the method and allocated amount", () => {
    const buffer = buildAllRidersIncentiveWorkbook([
      rider("Sampath", "SPK", [order()], "400.00", "300.00"),
      rider(
        "Selvam",
        "DTD",
        [
          order({
            shopifyOrderNumber: "#9",
            invoiceNumber: "800-9",
            shippingCost: "0.00",
            riderPayment: "0.00",
            pickup: true,
            orderShipping: "Pick Up",
            payMethod: "Pick up",
          }),
        ],
        "0.00",
        "0.00",
      ),
    ]);

    const workbook = XLSX.read(buffer, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Rider pay"]);

    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["Rider pay"], {
      defval: "",
    });
    expect(rows.map((row) => [row.Rider, row["How we pay"], row["Amount allocated"], row["Pick up"]])).toEqual([
      ["Sampath", "Nugegoda", 300, "No"],
      ["Selvam", "Pick up", 0, "Yes"],
      ["Total", "", 300, ""],
    ]);
  });
});
