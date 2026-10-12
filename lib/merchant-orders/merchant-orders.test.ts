import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    company: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { merchantOrdersApiKeyMatches } from "@/lib/merchant-orders/auth";
import { handleMerchantOrdersGet } from "@/lib/merchant-orders/handle";
import { buildMerchantOrderWhere } from "@/lib/merchant-orders/lookup";
import { presentMerchantOrder, toGuideFulfillmentStatus } from "@/lib/merchant-orders/present";

const API_KEY = "test-merchant-key";

function sampleOrder() {
  return {
    shopifyOrderId: "1001",
    name: "#1001",
    orderNumber: "1001",
    customerEmail: "jane@example.com",
    customerPhone: "0771234567",
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    currency: "LKR",
    subtotalPrice: { toString: () => "39.98" },
    totalShipping: { toString: () => "0.00" },
    totalTax: { toString: () => "0.00" },
    totalPrice: { toString: () => "39.98" },
    shippingAddress: {
      address1: "123 Main St",
      city: "Colombo",
      country: "Sri Lanka",
      first_name: "Jane",
      last_name: "Doe",
      zip: "00100",
    },
    billingAddress: {
      address1: "123 Main St",
      city: "Colombo",
      country: "Sri Lanka",
      first_name: "Jane",
      last_name: "Doe",
      zip: "00100",
    },
    rawPayload: {
      order_status_url: "https://cosmetics.lk/orders/1001",
      processed_at: "2026-09-01T10:00:00Z",
      line_items: [{ id: 55, current_quantity: 1, total_discount: "10.00" }],
    },
    lineItems: [
      {
        shopifyLineItemId: "55",
        quantity: 2,
        price: { toString: () => "19.99" },
        discountPercent: null,
        productItem: {
          productTitle: "Blue T-Shirt",
          variantTitle: "Cotton, size M",
          sku: "TSHIRT-BLU-M",
          imageUrl: "https://cdn.example/shirt.jpg",
          shopifyVariantId: "1001a",
        },
      },
    ],
  };
}

function request(url: string, apiKey?: string) {
  return new Request(url, {
    headers: apiKey ? { "x-api-key": apiKey } : {},
  });
}

describe("merchant orders API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCHANT_ORDERS_API_KEY = API_KEY;
    process.env.MERCHANT_ORDERS_COMPANY_ID = "company-1";
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-1" });
    prismaMock.order.count.mockResolvedValue(1);
    prismaMock.order.findMany.mockResolvedValue([sampleOrder()]);
  });

  it("accepts only the configured API key", () => {
    expect(merchantOrdersApiKeyMatches(API_KEY)).toBe(true);
    expect(merchantOrdersApiKeyMatches("other-key")).toBe(false);
    expect(merchantOrdersApiKeyMatches(null)).toBe(false);
  });

  it("requires the API key to be configured", async () => {
    delete process.env.MERCHANT_ORDERS_API_KEY;
    const response = await handleMerchantOrdersGet(
      request("http://localhost/api/merchant/orders?email=jane@example.com"),
    );
    expect(response.status).toBe(503);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong key", async () => {
    const response = await handleMerchantOrdersGet(
      request("http://localhost/api/merchant/orders?email=jane@example.com", "nope"),
    );
    expect(response.status).toBe(401);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
  });

  it("requires email or phone", async () => {
    const response = await handleMerchantOrdersGet(
      request("http://localhost/api/merchant/orders?page=1", API_KEY),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "email or phone is required" });
  });

  it("returns the guide shape for a matching customer", async () => {
    const response = await handleMerchantOrdersGet(
      request(
        "http://localhost/api/merchant/orders?email=Jane@Example.com&phone=%2B94771234567&page=1&limit=2",
        API_KEY,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
    expect(body.total).toBe(1);
    expect(body.orders).toEqual([
      {
        id: "gid://shopify/Order/1001",
        name: "#1001",
        orderNumber: 1001,
        email: "jane@example.com",
        phone: "+94771234567",
        processedAt: "2026-09-01T10:00:00.000Z",
        financialStatus: "PAID",
        fulfillmentStatus: "FULFILLED",
        currencyCode: "LKR",
        customerUrl: "",
        statusUrl: "https://cosmetics.lk/orders/1001",
        subtotalPriceV2: { amount: "39.98", currencyCode: "LKR" },
        totalShippingPriceV2: { amount: "0.00", currencyCode: "LKR" },
        totalTaxV2: { amount: "0.00", currencyCode: "LKR" },
        totalPriceV2: { amount: "39.98", currencyCode: "LKR" },
        shippingAddress: {
          address1: "123 Main St",
          city: "Colombo",
          country: "Sri Lanka",
          firstName: "Jane",
          lastName: "Doe",
          zip: "00100",
        },
        billingAddress: {
          address1: "123 Main St",
          city: "Colombo",
          country: "Sri Lanka",
          firstName: "Jane",
          lastName: "Doe",
          zip: "00100",
        },
        lineItems: [
          {
            title: "Blue T-Shirt",
            quantity: 2,
            currentQuantity: 1,
            originalTotalPrice: { amount: "39.98", currencyCode: "LKR" },
            discountedTotalPrice: { amount: "29.98", currencyCode: "LKR" },
            variant: {
              id: "gid://shopify/ProductVariant/1001a",
              title: "Cotton, size M",
              sku: "TSHIRT-BLU-M",
              image: { originalSrc: "https://cdn.example/shirt.jpg" },
            },
          },
        ],
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("rawPayload");
    expect(JSON.stringify(body)).not.toContain("erpnext");

    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: "company-1",
          customerEmail: { equals: "jane@example.com", mode: "insensitive" },
          customerPhone: { in: expect.arrayContaining(["0771234567", "+94771234567"]) },
        }),
        skip: 0,
        take: 2,
      }),
    );
  });

  it("matches email and phone together", () => {
    const where = buildMerchantOrderWhere({
      companyId: "company-1",
      email: "jane@example.com",
      phone: "0771234567",
    });
    expect(where.companyId).toBe("company-1");
    expect(where.customerEmail).toEqual({ equals: "jane@example.com", mode: "insensitive" });
    expect(where.customerPhone).toEqual({ in: expect.arrayContaining(["0771234567"]) });
  });

  it("maps an unfulfilled order and an empty status link", () => {
    expect(toGuideFulfillmentStatus(null)).toBe("UNFULFILLED");
    const presented = presentMerchantOrder({
      ...sampleOrder(),
      fulfillmentStatus: null,
      rawPayload: {},
      customerPhone: "+15551234567",
      lineItems: [],
    });
    expect(presented.fulfillmentStatus).toBe("UNFULFILLED");
    expect(presented.statusUrl).toBe("");
    expect(presented.phone).toBe("+15551234567");
    expect(presented.lineItems).toEqual([]);
  });
});
