import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  approvalPaymentLineUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    approvalPaymentLine: { update: prismaMocks.approvalPaymentLineUpdate },
  },
}));

import { syncApprovalSplitPaymentEntriesToErp } from "@/lib/erpnext-sync";

const location = {
  erpnextCompany: "Cosmo",
  erpnextInstance: {
    baseUrl: "https://erp.example.com",
    apiKey: "key",
    apiSecret: "secret",
    kokoMop: "KOKO",
    bankTransferMop: "Bank Transfer",
    cashMop: "Cash",
    codMop: "Cash On Delivery",
    cardDeliveryMop: "Credit Card",
    webxpayMop: "WebXPay",
    mintpayMop: "Mintpay",
    citypakMop: "City Pak",
    taxesAndCharges: "",
    shippingRule: "",
    shippingItem: "",
    shippingChargeAccount: "",
  },
} as never;

const order = {
  name: "900-000760",
  shopifyOrderId: "erp-900-000760",
  sourceName: "erpnext",
  paymentGatewayPrimary: "KOKO",
  paymentGatewayNames: ["KOKO"],
  erpnextInvoiceId: "900-000760",
  totalPrice: 7750,
};

describe("finance-approved split ERP Payment Entries", () => {
  let outstanding: number;
  let paymentEntryBodies: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    outstanding = 7750;
    paymentEntryBodies = [];
    prismaMocks.approvalPaymentLineUpdate.mockResolvedValue({});

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/resource/Sales%20Invoice/") || url.includes("/api/resource/Sales Invoice/")) {
          return Response.json({
            data: {
              name: "900-000760",
              outstanding_amount: outstanding,
              debit_to: "Debtors - C",
              customer: "CUST-1",
            },
          });
        }
        if (url.includes("/api/resource/Mode%20of%20Payment/")) {
          const name = decodeURIComponent(url.split("/").at(-1) ?? "");
          return Response.json({
            data: {
              name,
              accounts: [{ company: "Cosmo", default_account: `${name} Account - C` }],
            },
          });
        }
        if (url.endsWith("/api/resource/Payment Entry") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          paymentEntryBodies.push(body);
          outstanding -= Number(body.paid_amount);
          return Response.json({ data: { name: `PE-${paymentEntryBodies.length}` } });
        }
        return Response.json({}, { status: 404 });
      }),
    );
  });

  it("creates KOKO and Bank Transfer PEs with their allocated amounts", async () => {
    await syncApprovalSplitPaymentEntriesToErp(
      {
        id: "approval-1",
        kokoReference: "KOKO-REF-1",
        paymentLines: [
          {
            id: "line-koko",
            paymentMethod: "koko",
            amount: 3000,
            erpPaymentEntryName: null,
          },
          {
            id: "line-bank",
            paymentMethod: "bank_transfer",
            amount: 4750,
            erpPaymentEntryName: null,
          },
        ],
      },
      order,
      location,
      new Date("2026-08-24T00:00:00.000Z"),
    );

    expect(paymentEntryBodies).toHaveLength(2);
    expect(paymentEntryBodies[0]).toEqual(
      expect.objectContaining({
        mode_of_payment: "KOKO",
        paid_amount: 3000,
        received_amount: 3000,
        reference_no: "KOKO-REF-1",
        references: [
          expect.objectContaining({
            reference_name: "900-000760",
            allocated_amount: 3000,
          }),
        ],
      }),
    );
    expect(paymentEntryBodies[1]).toEqual(
      expect.objectContaining({
        mode_of_payment: "Bank Transfer",
        paid_amount: 4750,
        received_amount: 4750,
        reference_no: "OS-OPA-line-bank",
        references: [
          expect.objectContaining({
            reference_name: "900-000760",
            allocated_amount: 4750,
          }),
        ],
      }),
    );
    expect(prismaMocks.approvalPaymentLineUpdate).toHaveBeenCalledTimes(2);
    expect(outstanding).toBe(0);
  });

  it("skips a completed KOKO leg when retrying a failed Bank Transfer leg", async () => {
    outstanding = 4750;

    await syncApprovalSplitPaymentEntriesToErp(
      {
        id: "approval-1",
        kokoReference: "KOKO-REF-1",
        paymentLines: [
          {
            id: "line-koko",
            paymentMethod: "koko",
            amount: 3000,
            erpPaymentEntryName: "PE-EXISTING",
          },
          {
            id: "line-bank",
            paymentMethod: "bank_transfer",
            amount: 4750,
            erpPaymentEntryName: null,
          },
        ],
      },
      order,
      location,
      new Date("2026-08-24T00:00:00.000Z"),
    );

    expect(paymentEntryBodies).toHaveLength(1);
    expect(paymentEntryBodies[0]).toEqual(
      expect.objectContaining({
        mode_of_payment: "Bank Transfer",
        paid_amount: 4750,
      }),
    );
    expect(prismaMocks.approvalPaymentLineUpdate).toHaveBeenCalledWith({
      where: { id: "line-bank" },
      data: { erpPaymentEntryName: "PE-1" },
    });
  });
});
