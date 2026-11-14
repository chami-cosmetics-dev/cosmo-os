import { describe, expect, it } from "vitest";

import { COUPON_REPORT_HEADERS } from "@/lib/page-data/dashboard-coupon-report-export";
import {
  aggregateCouponReport,
  couponReportCustomerKey,
  dashboardCouponSaleChannel,
} from "@/lib/page-data/dashboard-coupon-report";

describe("dashboardCouponSaleChannel", () => {
  it("treats POS as shop and web as online", () => {
    expect(dashboardCouponSaleChannel("erpnext-pos")).toBe("shop");
    expect(dashboardCouponSaleChannel("pos")).toBe("shop");
    expect(dashboardCouponSaleChannel("web")).toBe("online");
    expect(dashboardCouponSaleChannel("manual")).toBe("online");
  });
});

describe("couponReportCustomerKey", () => {
  it("prefers customer id, then phone, then email", () => {
    expect(
      couponReportCustomerKey({
        id: "o1",
        customerId: "c1",
        customerPhone: "0771234567",
        customerEmail: "a@b.com",
      }),
    ).toBe("id:c1");
    expect(
      couponReportCustomerKey({
        id: "o2",
        customerId: null,
        customerPhone: "0771234567",
        customerEmail: "a@b.com",
      }),
    ).toBe("phone:0771234567");
  });
});

describe("aggregateCouponReport", () => {
  it("groups merchants under warehouse and unique-counts existing vs registered", () => {
    const rows = aggregateCouponReport(
      [
        {
          locationId: "kandy",
          locationName: "Kandy",
          merchantId: "m1",
          merchantName: "Nimthera",
          channel: "shop",
          amount: 1000,
          customerKey: "id:old",
        },
        {
          locationId: "kandy",
          locationName: "Kandy",
          merchantId: "m1",
          merchantName: "Nimthera",
          channel: "online",
          amount: 500,
          customerKey: "id:new",
        },
        {
          locationId: "kandy",
          locationName: "Kandy",
          merchantId: "m2",
          merchantName: "Semini",
          channel: "shop",
          amount: 200,
          customerKey: "id:old",
        },
        {
          locationId: "web",
          locationName: "Cosmetics.lk",
          merchantId: "m3",
          merchantName: "DM-General",
          channel: "online",
          amount: 300,
          customerKey: "id:web-new",
        },
      ],
      new Set(["id:old"]),
      new Set(["id:old", "id:web-new"]),
    );

    expect(rows).toEqual([
      {
        kind: "warehouse_header",
        warehouse: "Cosmetics.lk",
        merchant: "",
        onlineSale: 0,
        shopSale: 0,
        totalSale: 0,
        orderCount: 0,
        existingCustomers: 0,
        registeredCustomers: 0,
      },
      {
        kind: "merchant",
        warehouse: "Cosmetics.lk",
        merchant: "DM-General",
        onlineSale: 300,
        shopSale: 0,
        totalSale: 300,
        orderCount: 1,
        existingCustomers: 0,
        registeredCustomers: 1,
      },
      {
        kind: "warehouse_total",
        warehouse: "Cosmetics.lk",
        merchant: "Warehouse total",
        onlineSale: 300,
        shopSale: 0,
        totalSale: 300,
        orderCount: 1,
        existingCustomers: 0,
        registeredCustomers: 1,
      },
      {
        kind: "warehouse_header",
        warehouse: "Kandy",
        merchant: "",
        onlineSale: 0,
        shopSale: 0,
        totalSale: 0,
        orderCount: 0,
        existingCustomers: 0,
        registeredCustomers: 0,
      },
      {
        kind: "merchant",
        warehouse: "Kandy",
        merchant: "Nimthera",
        onlineSale: 500,
        shopSale: 1000,
        totalSale: 1500,
        orderCount: 2,
        existingCustomers: 1,
        registeredCustomers: 1,
      },
      {
        kind: "merchant",
        warehouse: "Kandy",
        merchant: "Semini",
        onlineSale: 0,
        shopSale: 200,
        totalSale: 200,
        orderCount: 1,
        existingCustomers: 1,
        registeredCustomers: 1,
      },
      {
        kind: "warehouse_total",
        warehouse: "Kandy",
        merchant: "Warehouse total",
        onlineSale: 500,
        shopSale: 1200,
        totalSale: 1700,
        orderCount: 3,
        existingCustomers: 1,
        registeredCustomers: 1,
      },
      {
        kind: "online_total",
        warehouse: "All warehouses",
        merchant: "Online total",
        onlineSale: 800,
        shopSale: 0,
        totalSale: 800,
        orderCount: 2,
        existingCustomers: 0,
        registeredCustomers: 1,
      },
      {
        kind: "shop_total",
        warehouse: "All warehouses",
        merchant: "Shop total",
        onlineSale: 0,
        shopSale: 1200,
        totalSale: 1200,
        orderCount: 2,
        existingCustomers: 1,
        registeredCustomers: 1,
      },
      {
        kind: "grand_total",
        warehouse: "All warehouses",
        merchant: "Grand total",
        onlineSale: 800,
        shopSale: 1200,
        totalSale: 2000,
        orderCount: 4,
        existingCustomers: 1,
        registeredCustomers: 2,
      },
    ]);
    const online = rows.find((row) => row.kind === "online_total")!;
    const shop = rows.find((row) => row.kind === "shop_total")!;
    const grand = rows.find((row) => row.kind === "grand_total")!;
    expect(grand.totalSale).toBe(online.totalSale + shop.totalSale);
    expect(grand.orderCount).toBe(online.orderCount + shop.orderCount);
  });
});

describe("COUPON_REPORT_HEADERS", () => {
  it("matches warehouse / merchant / channel / customer columns", () => {
    expect([...COUPON_REPORT_HEADERS]).toEqual([
      "Warehouse",
      "Merchant",
      "Online sale",
      "Shop sale (outlet)",
      "Total sale",
      "Order count",
      "Existing customers",
      "Registered customers",
    ]);
  });
});
