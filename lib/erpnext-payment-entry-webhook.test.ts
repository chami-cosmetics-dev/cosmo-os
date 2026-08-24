import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  companyLocationFindFirst: vi.fn(),
  orderFindFirst: vi.fn(),
  orderUpdate: vi.fn(),
  paymentUpsert: vi.fn(),
  paymentFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companyLocation: { findFirst: mocks.companyLocationFindFirst },
    order: {
      findFirst: mocks.orderFindFirst,
      update: mocks.orderUpdate,
    },
    orderPaymentEntry: {
      upsert: mocks.paymentUpsert,
      findMany: mocks.paymentFindMany,
    },
  },
}));

import { POST } from "@/app/api/webhooks/erpnext/payment-entry/route";

type StoredPayment = {
  orderId: string;
  paymentEntryId: string;
  paymentType: string;
  modeOfPayment: string;
  amount: number;
  allocatedAmount: number;
  postingDate: Date;
};

const credentials = {
  incomingWebhookSecret: "webhook-secret",
  baseUrl: "https://erp.example.com",
  apiKey: "key",
  apiSecret: "secret",
};

function requestFor(payload: object): NextRequest {
  return new NextRequest("https://os.example.com/api/webhooks/erpnext/payment-entry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erpnext-secret": "webhook-secret",
    },
    body: JSON.stringify(payload),
  });
}

function paymentDocument(input: {
  name: string;
  paymentType?: "Receive" | "Pay";
  paidAmount: number;
  references: Array<{
    reference_doctype: string;
    reference_name: string;
    allocated_amount: number;
  }>;
}) {
  return {
    name: input.name,
    company: "Cosmo",
    docstatus: 1,
    payment_type: input.paymentType ?? "Receive",
    mode_of_payment: "Bank Transfer",
    party_type: "Customer",
    party: "CUST-1",
    paid_amount: input.paidAmount,
    posting_date: "2026-08-24",
    references: input.references,
  };
}

describe("ERPNext Payment Entry webhook", () => {
  let stored: Map<string, StoredPayment>;
  let fullDocuments: Map<string, ReturnType<typeof paymentDocument>>;
  let outstandingAmounts: number[];
  let currentStatus: string;

  beforeEach(() => {
    vi.clearAllMocks();
    stored = new Map();
    fullDocuments = new Map();
    outstandingAmounts = [];
    currentStatus = "pending";

    mocks.companyLocationFindFirst.mockResolvedValue({
      erpnextInstance: credentials,
    });
    mocks.orderFindFirst.mockResolvedValue({
      id: "order-1",
      name: "Order 1",
      financialStatus: currentStatus,
      totalPrice: 8000,
    });
    mocks.paymentUpsert.mockImplementation(async ({ where, create, update }) => {
      const key = `${where.orderId_paymentEntryId.orderId}:${where.orderId_paymentEntryId.paymentEntryId}`;
      const value = stored.has(key) ? { ...stored.get(key)!, ...update } : create;
      stored.set(key, value);
      return value;
    });
    mocks.paymentFindMany.mockImplementation(async ({ where }) =>
      Array.from(stored.values())
        .filter((payment) => payment.orderId === where.orderId)
        .map((payment) => ({
          paymentType: payment.paymentType,
          allocatedAmount: payment.allocatedAmount,
        })),
    );
    mocks.orderUpdate.mockImplementation(async ({ data }) => {
      currentStatus = data.financialStatus;
      return { id: "order-1", financialStatus: currentStatus };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/resource/Payment Entry/")) {
          const id = decodeURIComponent(url.split("/").at(-1) ?? "");
          const document = fullDocuments.get(id);
          return Response.json(document ? { data: document } : {}, {
            status: document ? 200 : 404,
          });
        }
        if (url.includes("/api/resource/Sales Invoice/")) {
          return Response.json({
            data: { outstanding_amount: outstandingAmounts.shift() ?? 0 },
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );
  });

  it("accumulates out-of-order entries and upserts duplicate deliveries", async () => {
    fullDocuments.set(
      "PE-2",
      paymentDocument({
        name: "PE-2",
        paidAmount: 5000,
        references: [
          {
            reference_doctype: "Sales Invoice",
            reference_name: "SV-1",
            allocated_amount: 5000,
          },
        ],
      }),
    );
    fullDocuments.set(
      "PE-1",
      paymentDocument({
        name: "PE-1",
        paidAmount: 3000,
        references: [
          {
            reference_doctype: "Sales Invoice",
            reference_name: "SV-1",
            allocated_amount: 3000,
          },
        ],
      }),
    );
    outstandingAmounts.push(3000, 0, 0);

    for (const name of ["PE-2", "PE-1", "PE-2"]) {
      const response = await POST(
        requestFor({
          name,
          company: "Cosmo",
          docstatus: 1,
          payment_type: "Receive",
        }),
      );
      expect(response.status).toBe(200);
    }

    expect(stored).toHaveLength(2);
    expect(stored.get("order-1:PE-1")?.allocatedAmount).toBe(3000);
    expect(stored.get("order-1:PE-2")?.allocatedAmount).toBe(5000);
    expect(mocks.paymentUpsert).toHaveBeenCalledTimes(3);
    expect(mocks.orderUpdate.mock.calls.map(([call]) => call.data.financialStatus)).toEqual([
      "partially_paid",
      "paid",
      "paid",
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://erp.example.com/api/resource/Payment Entry/PE-2",
      expect.any(Object),
    );
  });

  it("attributes one Payment Entry by allocated amount across known invoices", async () => {
    fullDocuments.set(
      "PE-MULTI",
      paymentDocument({
        name: "PE-MULTI",
        paidAmount: 6000,
        references: [
          {
            reference_doctype: "Sales Invoice",
            reference_name: "SV-A",
            allocated_amount: 3000,
          },
          {
            reference_doctype: "Sales Invoice",
            reference_name: "SV-B",
            allocated_amount: 2000,
          },
          {
            reference_doctype: "Sales Invoice",
            reference_name: "SV-UNKNOWN",
            allocated_amount: 1000,
          },
        ],
      }),
    );
    mocks.orderFindFirst.mockImplementation(async ({ where }) => {
      const invoiceName = where.OR[0].shopifyOrderId.replace(/^erp-/, "");
      if (invoiceName === "SV-UNKNOWN") return null;
      return {
        id: `order-${invoiceName}`,
        name: invoiceName,
        financialStatus: "pending",
        totalPrice: invoiceName === "SV-A" ? 3000 : 2000,
      };
    });

    const response = await POST(
      requestFor({
        name: "PE-MULTI",
        company: "Cosmo",
        docstatus: 1,
        payment_type: "Receive",
        references: [],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.paymentUpsert).toHaveBeenCalledTimes(2);
    const creates = mocks.paymentUpsert.mock.calls.map(([call]) => call.create);
    expect(creates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: "order-SV-A",
          amount: 6000,
          allocatedAmount: 3000,
        }),
        expect.objectContaining({
          orderId: "order-SV-B",
          amount: 6000,
          allocatedAmount: 2000,
        }),
      ]),
    );
  });

  it("stores Pay entries as negative refunds instead of incoming payments", async () => {
    fullDocuments.set(
      "PE-REFUND",
      paymentDocument({
        name: "PE-REFUND",
        paymentType: "Pay",
        paidAmount: 1000,
        references: [
          {
            reference_doctype: "Sales Invoice",
            reference_name: "SV-1",
            allocated_amount: 1000,
          },
        ],
      }),
    );
    outstandingAmounts.push(1000);

    const response = await POST(
      requestFor({
        name: "PE-REFUND",
        company: "Cosmo",
        docstatus: 1,
        payment_type: "Pay",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.paymentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          paymentType: "Pay",
          amount: -1000,
          allocatedAmount: -1000,
        }),
      }),
    );
    expect(mocks.orderUpdate).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { financialStatus: "pending" },
    });
  });

  it("returns a retriable error when the required full document cannot be fetched", async () => {
    const response = await POST(
      requestFor({
        name: "PE-MISSING",
        company: "Cosmo",
        docstatus: 1,
        payment_type: "Receive",
      }),
    );

    expect(response.status).toBe(502);
    expect(mocks.paymentUpsert).not.toHaveBeenCalled();
  });
});
