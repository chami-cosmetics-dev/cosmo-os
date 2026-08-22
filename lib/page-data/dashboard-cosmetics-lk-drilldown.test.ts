import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    companyLocation: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { fetchCosmeticsLkDrilldown } from "@/lib/page-data/dashboard-cosmetics-lk-drilldown";

const COMPANY_ID = "company-1";

type TestOrder = {
  assignedMerchantId?: string | null;
  totalPrice: number;
  totalDiscounts?: number | null;
  sourceName?: string | null;
  paymentGatewayPrimary?: string | null;
  discountCodes?: unknown;
  lineItems?: Array<{
    quantity: number;
    price: number;
    productItem?: { itemStatusCategory: string } | null;
  }>;
};

function buildOrder(order: TestOrder) {
  return {
    assignedMerchantId: order.assignedMerchantId ?? null,
    totalPrice: order.totalPrice,
    totalDiscounts: order.totalDiscounts ?? null,
    sourceName: order.sourceName ?? "web",
    financialStatus: "paid",
    fulfillmentStatus: null,
    fulfillmentStage: null,
    deliveryOutcome: null,
    deliveryCompleteAt: null,
    invoiceCompleteAt: null,
    discountCodes: order.discountCodes ?? null,
    rawPayload: null,
    paymentGatewayPrimary: order.paymentGatewayPrimary ?? "cod",
    assignedMerchant: null,
    lineItems: order.lineItems ?? [],
  };
}

function setup(orders: TestOrder[], locationName = "Cosmetics.lk") {
  prismaMock.companyLocation.findMany.mockResolvedValue([
    { id: "loc-other", name: "DTD Trading (Pvt) Ltd", shortName: "DTD" },
    { id: "loc-cos", name: locationName, shortName: null },
  ]);
  prismaMock.user.findMany.mockResolvedValue([
    {
      id: "user-a",
      knownName: "Nirukshi",
      name: "Nirukshi",
      email: "n@example.com",
      couponCodes: ["MER101"],
    },
  ]);
  prismaMock.order.findMany.mockResolvedValue(orders.map(buildOrder));
}

async function loadDrilldown() {
  const result = await fetchCosmeticsLkDrilldown(COMPANY_ID, {
    fromYmd: "2026-08-22",
    toYmd: "2026-08-22",
    dateType: "all_orders",
  });
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.data;
}

function bucketTotal(rows: Array<{ key: string; total: number }>, key: string) {
  return rows.find((row) => row.key === key)?.total ?? 0;
}

describe("fetchCosmeticsLkDrilldown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a missing Cosmetics.lk location instead of throwing", async () => {
    prismaMock.companyLocation.findMany.mockResolvedValue([
      { id: "loc-other", name: "DTD Trading (Pvt) Ltd", shortName: "DTD" },
    ]);

    const result = await fetchCosmeticsLkDrilldown(COMPANY_ID, {
      fromYmd: "2026-08-22",
      toYmd: "2026-08-22",
      dateType: "all_orders",
    });

    expect(result).toEqual({ ok: false, reason: "location_not_found" });
  });

  it("rejects an inverted date range", async () => {
    const result = await fetchCosmeticsLkDrilldown(COMPANY_ID, {
      fromYmd: "2026-08-23",
      toYmd: "2026-08-22",
      dateType: "all_orders",
    });

    expect(result).toEqual({ ok: false, reason: "invalid_range" });
  });

  it("returns an empty shape when no orders are eligible", async () => {
    setup([]);

    const data = await loadDrilldown();

    expect(data.total).toBe(0);
    expect(data.orderCount).toBe(0);
    expect(data.merchants).toEqual([]);
    expect(data.byPaymentType).toEqual([]);
  });

  it("sums merchant totals to the location total and buckets unattributed orders as DM-General", async () => {
    setup([
      { totalPrice: 1000, discountCodes: [{ code: "MER101" }] },
      { totalPrice: 500 },
      { totalPrice: 250, sourceName: "erpnext" },
    ]);

    const data = await loadDrilldown();

    expect(data.total).toBe(1750);
    expect(data.orderCount).toBe(3);

    const merchantSum = data.merchants.reduce((sum, m) => sum + m.total, 0);
    expect(merchantSum).toBe(data.total);

    const named = data.merchants.find((m) => m.merchantName === "Nirukshi");
    expect(named?.total).toBe(1000);
    const general = data.merchants.find((m) => m.merchantName === "DM-General");
    expect(general?.total).toBe(750);
    expect(general?.orderCount).toBe(2);
  });

  it("splits website and ERP1 channels and hides Manual when unused", async () => {
    setup([
      { totalPrice: 1000, sourceName: "web" },
      { totalPrice: 400, sourceName: "erpnext" },
      { totalPrice: 100, sourceName: "erpnext-pos" },
    ]);

    const data = await loadDrilldown();

    expect(bucketTotal(data.byChannel, "website")).toBe(1000);
    expect(bucketTotal(data.byChannel, "erp1")).toBe(500);
    expect(data.byChannel.some((row) => row.key === "manual")).toBe(false);

    const channelSum = data.byChannel.reduce((sum, row) => sum + row.total, 0);
    expect(channelSum).toBe(data.total);
  });

  it("shows Manual as its own channel when Cosmo-created orders exist", async () => {
    setup([
      { totalPrice: 300, sourceName: "web" },
      { totalPrice: 200, sourceName: "manual" },
    ]);

    const data = await loadDrilldown();

    expect(bucketTotal(data.byChannel, "manual")).toBe(200);
    expect(bucketTotal(data.byChannel, "website")).toBe(300);
  });

  it("sums payment types to the location total", async () => {
    setup([
      { totalPrice: 600, paymentGatewayPrimary: "cod" },
      { totalPrice: 400, paymentGatewayPrimary: "bank transfer" },
      { totalPrice: 100, paymentGatewayPrimary: null },
    ]);

    const data = await loadDrilldown();

    const paymentSum = data.byPaymentType.reduce((sum, row) => sum + row.total, 0);
    expect(paymentSum).toBe(data.total);
    expect(data.byPaymentType.map((row) => row.label)).toContain("Bank Transfer");
  });

  it("splits VAT line spend from other line spend", async () => {
    setup([
      {
        totalPrice: 1000,
        lineItems: [
          {
            quantity: 2,
            price: 300,
            productItem: { itemStatusCategory: "VAT_TOP_PRIORITY_BRAND" },
          },
          { quantity: 1, price: 400, productItem: { itemStatusCategory: "CONTINUE" } },
        ],
      },
    ]);

    const data = await loadDrilldown();

    expect(bucketTotal(data.byVatItem, "vat")).toBe(600);
    expect(bucketTotal(data.byVatItem, "other")).toBe(400);
    // One mixed-cart order contributes to both buckets' counts.
    expect(data.byVatItem.every((row) => row.orderCount === 1)).toBe(true);
  });

  it("totals discounts and lists promotional codes without merchant tracking codes", async () => {
    setup([
      {
        totalPrice: 1000,
        totalDiscounts: 150,
        discountCodes: [{ code: "SV20" }, { code: "MER101" }],
      },
      { totalPrice: 500, totalDiscounts: null },
    ]);

    const data = await loadDrilldown();

    expect(data.discountTotal).toBe(150);
    expect(data.byDiscountCode.map((row) => row.label)).toEqual(["SV20"]);

    const merchant = data.merchants.find((m) => m.merchantName === "Nirukshi");
    expect(merchant?.discountTotal).toBe(150);
    expect(merchant?.discountCodes).toEqual([{ code: "SV20", orderCount: 1 }]);
  });
});
