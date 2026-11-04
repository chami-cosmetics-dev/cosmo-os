import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    orderPaymentEntry: { findFirst: vi.fn() },
  },
}));

import { createDeliveryPaymentEntry } from "@/lib/erpnext-sync";

const location = {
  erpnextCompany: "Chami Trading Lanka (Pvt) Ltd",
  erpnextInstance: {
    baseUrl: "https://erp.example.com",
    apiKey: "key",
    apiSecret: "secret",
    cashMop: "Cash",
    codMop: "Cash",
    cardDeliveryMop: "Card",
    bankTransferMop: "Bank",
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

const order = {
  name: "SO-1",
  shopifyOrderId: "SO-1",
  sourceName: "web",
  paymentGatewayPrimary: "Cash",
  paymentGatewayNames: ["Cash"],
  erpnextInvoiceId: "SI-1",
};

describe("delivery payment entry owner", () => {
  let posts: Array<{ url: string; body: Record<string, unknown> }>;

  function stubFetch(methodResponse: () => Response) {
    posts = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/resource/Sales%20Invoice/") || url.includes("/api/resource/Sales Invoice/")) {
          return Response.json({
            data: {
              name: "SI-1",
              outstanding_amount: 1500,
              debit_to: "Debtors - CTL",
              customer: "CUST-1",
            },
          });
        }
        if (url.includes("/api/resource/Payment%20Entry?") || url.includes("/api/resource/Payment Entry?")) {
          return Response.json({ data: [] });
        }
        if (url.includes("/api/resource/Mode%20of%20Payment/")) {
          return Response.json({
            data: {
              name: "Cash",
              accounts: [{ company: "Chami Trading Lanka (Pvt) Ltd", default_account: "Cash - CTL" }],
            },
          });
        }
        if (init?.method === "POST") {
          posts.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
          if (url.endsWith("/api/method/cosmo_save_doc")) return methodResponse();
          if (url.endsWith("/api/resource/Payment Entry")) {
            return Response.json({ data: { name: "ACC-PAY-API" } });
          }
        }
        return Response.json({}, { status: 404 });
      }),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the payment entry as the Cosmo user", async () => {
    stubFetch(() => Response.json({ message: { name: "ACC-PAY-IRES" } }));

    const result = await createDeliveryPaymentEntry(order, location, new Date("2026-10-21T04:00:00.000Z"), {
      mopNameOverride: "Cash",
      requireMop: true,
      owner: "iresha17.cosmetics@gmail.com",
    });

    expect(result).toEqual({ outcome: "created", paymentEntryName: "ACC-PAY-IRES" });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toContain("/api/method/cosmo_save_doc");
    expect(posts[0]?.body).toMatchObject({
      owner: "iresha17.cosmetics@gmail.com",
      action: "insert",
      doc: {
        doctype: "Payment Entry",
        payment_type: "Receive",
        mode_of_payment: "Cash",
        paid_amount: 1500,
        references: [
          {
            doctype: "Payment Entry Reference",
            reference_doctype: "Sales Invoice",
            reference_name: "SI-1",
            allocated_amount: 1500,
          },
        ],
      },
    });
    expect(posts[0]?.body.doc).not.toHaveProperty("docstatus");
  });

  it("uses the API user when that ERP user does not exist", async () => {
    stubFetch(() =>
      Response.json(
        { exception: "ERP user is disabled or missing: missing@example.com" },
        { status: 417 },
      ),
    );

    const result = await createDeliveryPaymentEntry(order, location, new Date("2026-10-21T04:00:00.000Z"), {
      mopNameOverride: "Cash",
      requireMop: true,
      owner: "missing@example.com",
    });

    expect(result).toEqual({ outcome: "created", paymentEntryName: "ACC-PAY-API" });
    expect(posts.map((post) => post.url)).toEqual([
      "https://erp.example.com/api/method/cosmo_save_doc",
      "https://erp.example.com/api/resource/Payment Entry",
    ]);
    expect(posts[1]?.body).toMatchObject({ doctype: "Payment Entry", docstatus: 1 });
  });

  it("does not create a second payment entry after the script already saved one", async () => {
    stubFetch(() =>
      Response.json(
        { exception: "validation error: Outstanding amount 0 is less than allocated amount" },
        { status: 417 },
      ),
    );

    await expect(
      createDeliveryPaymentEntry(order, location, new Date("2026-10-21T04:00:00.000Z"), {
        mopNameOverride: "Cash",
        requireMop: true,
        owner: "iresha17.cosmetics@gmail.com",
      }),
    ).rejects.toThrow(/Outstanding amount/);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toContain("/api/method/cosmo_save_doc");
    expect(posts.some((post) => post.url.includes("/api/resource/Payment Entry"))).toBe(false);
  });
});
