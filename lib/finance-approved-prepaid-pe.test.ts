import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    orderPaymentEntry: { findFirst: vi.fn() },
  },
}));

import { syncFinanceApprovedPrepaidPaymentToERPNext } from "@/lib/erpnext-sync";

const location = {
  erpnextCompany: "Udara Trading Lanka (Pvt) Ltd",
  erpnextInstance: {
    baseUrl: "https://erp.example.com",
    apiKey: "key",
    apiSecret: "secret",
    cashMop: "Cash",
    codMop: "Cash",
    cardDeliveryMop: "Card",
    bankTransferMop: "Bank Transfer",
    kokoMop: "Koko",
    webxpayMop: "",
    mintpayMop: "",
    citypakMop: "",
    taxesAndCharges: "",
    shippingRule: "",
    shippingItem: "",
    shippingChargeAccount: "",
  },
} as never;

const invoice = {
  name: "120-000076",
  outstanding_amount: 2212.5,
  debit_to: "Debtors - Udara",
  customer: "0756808240",
};

describe("syncFinanceApprovedPrepaidPaymentToERPNext", () => {
  let posts: Array<{ url: string; body: Record<string, unknown> }>;
  let getUrls: string[];

  function stubFetch(opts?: { invoiceByName?: Record<string, typeof invoice>; poNoHits?: typeof invoice[] }) {
    posts = [];
    getUrls = [];
    const byName = opts?.invoiceByName ?? {};
    const poNoHits = opts?.poNoHits ?? [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          posts.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
          return Response.json({ data: { name: "REC120-TEST" } });
        }
        getUrls.push(url);
        if (url.includes("/api/resource/Mode%20of%20Payment/") || url.includes("/api/resource/Mode of Payment/")) {
          const mopMatch = url.match(/Mode(?:%20|\s)of(?:%20|\s)Payment\/([^?]+)/);
          const mopName = decodeURIComponent(mopMatch?.[1] ?? "Bank Transfer");
          return Response.json({
            data: {
              name: mopName,
              accounts: [
                {
                  company: "Udara Trading Lanka (Pvt) Ltd",
                  default_account: "1402 - Seylan Bank 0540-123(MM) - Udara",
                },
              ],
            },
          });
        }
        const siMatch = url.match(/\/api\/resource\/Sales(?:%20|\s)Invoice\/([^?]+)/);
        if (siMatch && !url.includes("filters=")) {
          const name = decodeURIComponent(siMatch[1]);
          const found = byName[name];
          if (!found) return Response.json({}, { status: 404 });
          return Response.json({ data: found });
        }
        if (url.includes("filters=") && url.includes("Sales")) {
          return Response.json({ data: poNoHits });
        }
        return Response.json({}, { status: 404 });
      }),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a bank-transfer PE for an ERP-native invoice with blank po_no", async () => {
    stubFetch({ invoiceByName: { "120-000076": invoice } });

    await syncFinanceApprovedPrepaidPaymentToERPNext(
      {
        name: "120-000076",
        shopifyOrderId: "120-000076",
        sourceName: "erpnext",
        erpnextInvoiceId: "120-000076",
        paymentGatewayPrimary: "bank_transfer",
        paymentGatewayNames: ["bank_transfer"],
        financialStatus: "paid",
      },
      location,
      new Date("2026-10-30T12:34:00.000Z"),
      { requirePe: true },
    );

    expect(getUrls.some((url) => url.includes("po_no"))).toBe(false);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toContain("/api/resource/Payment Entry");
    expect(posts[0]?.body).toMatchObject({
      doctype: "Payment Entry",
      payment_type: "Receive",
      mode_of_payment: "Bank Transfer",
      party: "0756808240",
      paid_amount: 2212.5,
      reference_no: "120-000076",
      references: [
        {
          reference_doctype: "Sales Invoice",
          reference_name: "120-000076",
          allocated_amount: 2212.5,
        },
      ],
      docstatus: 1,
    });
  });

  it("finds Cosmo SI by order name when erpnextInvoiceId is missing and po_no is blank", async () => {
    stubFetch({ invoiceByName: { "120-000076": invoice } });

    await syncFinanceApprovedPrepaidPaymentToERPNext(
      {
        name: "120-000076",
        shopifyOrderId: "120-000076",
        sourceName: "erpnext",
        erpnextInvoiceId: null,
        paymentGatewayPrimary: "bank_transfer",
        paymentGatewayNames: ["bank_transfer"],
        financialStatus: "paid",
      },
      location,
      new Date("2026-10-30T12:34:00.000Z"),
      { requirePe: true },
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toMatchObject({
      mode_of_payment: "Bank Transfer",
      reference_no: "120-000076",
    });
  });

  it("still finds Shopify invoices by po_no when the SI name differs", async () => {
    stubFetch({
      invoiceByName: { "SI-99": { ...invoice, name: "SI-99" } },
      poNoHits: [{ ...invoice, name: "SI-99" }],
    });

    await syncFinanceApprovedPrepaidPaymentToERPNext(
      {
        name: "#6001",
        shopifyOrderId: "gid://shopify/Order/1",
        sourceName: "web",
        erpnextInvoiceId: null,
        paymentGatewayPrimary: "koko",
        paymentGatewayNames: ["koko"],
        financialStatus: "paid",
      },
      location,
      new Date("2026-10-30T12:34:00.000Z"),
      { requirePe: true },
    );

    expect(getUrls.some((url) => url.includes("po_no"))).toBe(true);
    expect(posts[0]?.body).toMatchObject({
      mode_of_payment: "Koko",
      reference_no: "SI-99",
    });
  });

  it("throws when requirePe is set and no SI exists", async () => {
    stubFetch({ invoiceByName: {}, poNoHits: [] });

    await expect(
      syncFinanceApprovedPrepaidPaymentToERPNext(
        {
          name: "120-000076",
          shopifyOrderId: "120-000076",
          sourceName: "erpnext",
          erpnextInvoiceId: null,
          paymentGatewayPrimary: "bank_transfer",
          paymentGatewayNames: ["bank_transfer"],
          financialStatus: "paid",
        },
        location,
        new Date("2026-10-30T12:34:00.000Z"),
        { requirePe: true },
      ),
    ).rejects.toThrow(/No Sales Invoice found/);
    expect(posts).toHaveLength(0);
  });
});
