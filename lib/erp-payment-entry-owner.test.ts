import { describe, expect, it } from "vitest";

import {
  ERP_OWNER_MISSING_MESSAGE,
  buildOwnedPaymentEntryCall,
  buildResourcePaymentEntryBody,
  erpDocumentOwner,
  paymentEntryNameFromSaveDoc,
  shouldFallbackPaymentEntryOwner,
} from "@/lib/erp-payment-entry-owner";

const fields = {
  payment_type: "Receive" as const,
  company: "Chami Trading Lanka (Pvt) Ltd",
  posting_date: "2026-10-21",
  mode_of_payment: "Cash",
  party_type: "Customer" as const,
  party: "0771234567",
  paid_from: "Debtors - CTL",
  paid_to: "Cash - CTL",
  reference_no: "SI-1",
  reference_date: "2026-10-21",
  paid_amount: 1500,
  received_amount: 1500,
  source_exchange_rate: 1,
  target_exchange_rate: 1,
  references: [
    {
      reference_doctype: "Sales Invoice" as const,
      reference_name: "SI-1",
      allocated_amount: 1500,
    },
  ],
};

describe("erpDocumentOwner", () => {
  it("prefers the linked ERP username", () => {
    expect(
      erpDocumentOwner({
        erpnextUsername: " iresha17.cosmetics@gmail.com ",
        email: "other@example.com",
      }),
    ).toBe("iresha17.cosmetics@gmail.com");
  });

  it("falls back to the Cosmo email", () => {
    expect(erpDocumentOwner({ erpnextUsername: " ", email: " iresha@example.com " })).toBe(
      "iresha@example.com",
    );
  });

  it("is empty when neither is set", () => {
    expect(erpDocumentOwner({})).toBe("");
    expect(ERP_OWNER_MISSING_MESSAGE).toMatch(/ERP username/);
  });
});

describe("buildOwnedPaymentEntryCall", () => {
  it("sends the Cosmo user's ERP email as owner and leaves submit to the script", () => {
    expect(buildOwnedPaymentEntryCall({ owner: " iresha17.cosmetics@gmail.com ", fields })).toEqual({
      owner: "iresha17.cosmetics@gmail.com",
      action: "insert",
      doc: {
        doctype: "Payment Entry",
        ...fields,
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
    expect(buildOwnedPaymentEntryCall({ owner: "iresha17.cosmetics@gmail.com", fields }).doc).not.toHaveProperty(
      "docstatus",
    );
  });
});

describe("buildResourcePaymentEntryBody", () => {
  it("submits immediately under the API user", () => {
    expect(buildResourcePaymentEntryBody(fields)).toMatchObject({
      doctype: "Payment Entry",
      docstatus: 1,
      mode_of_payment: "Cash",
    });
  });
});

describe("paymentEntryNameFromSaveDoc", () => {
  it("reads the name from the server script message", () => {
    expect(paymentEntryNameFromSaveDoc({ message: { name: "ACC-PAY-2026-00088" } })).toBe(
      "ACC-PAY-2026-00088",
    );
    expect(paymentEntryNameFromSaveDoc({ data: { name: "ACC-PAY-2026-00089" } })).toBe(
      "ACC-PAY-2026-00089",
    );
    expect(paymentEntryNameFromSaveDoc(null)).toBe("");
  });
});

describe("shouldFallbackPaymentEntryOwner", () => {
  it("falls back only when nothing was inserted", () => {
    expect(
      shouldFallbackPaymentEntryOwner(
        'ERPNext POST /api/method/cosmo_save_doc [417]: {"exception":"ERP user is disabled or missing: x"}',
      ),
    ).toBe(true);
    expect(
      shouldFallbackPaymentEntryOwner("ERPNext POST /api/method/cosmo_save_doc [404]: not found"),
    ).toBe(true);
    expect(shouldFallbackPaymentEntryOwner("Failed to get method for command cosmo_save_doc")).toBe(
      true,
    );
    expect(
      shouldFallbackPaymentEntryOwner(
        "ERPNext POST /api/method/cosmo_save_doc [417]: Outstanding amount",
      ),
    ).toBe(false);
  });
});
