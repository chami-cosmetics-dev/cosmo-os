import { describe, expect, it } from "vitest";

import { buildSupplementDraftRows, type DraftOrder } from "@/lib/vault-supplement-import/draft";

const codes = new Set(["SV-WHEY-1KG"]);

function order(overrides: Partial<DraftOrder> = {}): DraftOrder {
  return {
    id: "order-1",
    orderNumber: "1001",
    name: "#1001",
    createdAt: new Date("2024-03-15T10:00:00+05:30"),
    cancelledAt: null,
    financialStatus: "paid",
    customerName: "Order Name",
    phone: "0771234567",
    email: "nimal@example.com",
    address: "Order address",
    city: "Galle",
    district: "Galle",
    currency: "LKR",
    paymentMethod: "Cash",
    location: "Website",
    merchant: "Kamal",
    lines: [
      { itemCode: "SV-WHEY-1KG", itemName: "Whey", quantity: 2, unitPrice: 15000 },
      { itemCode: "LIP-01", itemName: "Lipstick", quantity: 1, unitPrice: 2500 },
    ],
    ...overrides,
  };
}

describe("supplement draft rows", () => {
  it("keeps only item codes in the supplied set", () => {
    const rows = buildSupplementDraftRows({
      itemCodes: codes,
      orders: [order()],
      adaptInvoices: [],
      contacts: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      item_code: "SV-WHEY-1KG",
      source_ref: "order-1",
      invoice_no: "1001",
      line_amount: 30000,
    });
  });

  it("drops cancelled and voided orders", () => {
    const rows = buildSupplementDraftRows({
      itemCodes: codes,
      orders: [
        order({ id: "cancelled", cancelledAt: new Date("2024-04-01T00:00:00Z") }),
        order({ id: "voided", financialStatus: "voided" }),
      ],
      adaptInvoices: [],
      contacts: [],
    });
    expect(rows).toHaveLength(0);
  });

  it("drops unknown codes and lines with neither phone nor email", () => {
    const rows = buildSupplementDraftRows({
      itemCodes: codes,
      orders: [
        order({
          id: "no-id",
          phone: null,
          email: "  ",
          lines: [{ itemCode: "SV-WHEY-1KG", itemName: "Whey", quantity: 1, unitPrice: 10 }],
        }),
        order({
          id: "unknown",
          lines: [{ itemCode: "OTHER", itemName: "Other", quantity: 1, unitPrice: 10 }],
        }),
      ],
      adaptInvoices: [],
      contacts: [],
    });
    expect(rows).toHaveLength(0);
  });

  it("prefers the matched contact profile", () => {
    const rows = buildSupplementDraftRows({
      itemCodes: codes,
      orders: [order()],
      adaptInvoices: [],
      contacts: [
        {
          name: "Contact Name",
          phoneNumber: "+94771234567",
          email: "kept@example.com",
          address: "12 Galle Rd",
          city: "Colombo",
          district: "Colombo",
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      customer_name: "Contact Name",
      phone: "0771234567",
      email: "kept@example.com",
      city: "Colombo",
    });
  });
});
