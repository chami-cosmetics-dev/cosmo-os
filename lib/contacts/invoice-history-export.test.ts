import { describe, expect, it } from "vitest";

import { buildInvoiceHistoryRows } from "@/lib/contacts/invoice-history-export";

describe("buildInvoiceHistoryRows", () => {
  const contact = { name: "Amesha De Silva", email: "amesha@example.com", phoneNumber: "0763733750" };

  it("labels a finance-file batch as File import and a Cosmo transfer as Cosmetics", () => {
    const rows = buildInvoiceHistoryRows({
      contact,
      adaptInvoices: [
        {
          salesInvoiceNo: "SV1007913",
          invoiceDate: new Date("2026-05-01T00:00:00.000Z"),
          financialStatus: "paid",
          paymentMethod: "Cash",
          origin: "vault_supplement_import",
          importBatchId: "vsupp-171000",
          lineItems: [
            {
              id: "line-1",
              itemCode: "WHEY",
              itemName: "Whey",
              unitPrice: "4500",
              quantity: 2,
            },
          ],
        },
        {
          salesInvoiceNo: "100200",
          invoiceDate: new Date("2025-06-01T00:00:00.000Z"),
          financialStatus: null,
          paymentMethod: "Card",
          origin: "vault_supplement_import",
          importBatchId: "vsupp-direct-99",
          lineItems: [
            {
              id: "line-2",
              itemCode: "CREA",
              itemName: "Creatine",
              unitPrice: "3000",
              quantity: 1,
            },
          ],
        },
        {
          salesInvoiceNo: "OLD-1",
          invoiceDate: new Date("2024-01-01T00:00:00.000Z"),
          financialStatus: null,
          paymentMethod: null,
          origin: "adapt",
          importBatchId: null,
          lineItems: [
            {
              id: "line-3",
              itemCode: "OLD",
              itemName: "Old item",
              unitPrice: "1000",
              quantity: 1,
            },
          ],
        },
      ],
      orders: [
        {
          id: "order-1",
          orderNumber: "10421",
          name: "#10421",
          erpnextInvoiceId: null,
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          financialStatus: "paid",
          lineItems: [{ quantity: 1, price: "9000", sku: "SHOP", productTitle: "Shop item" }],
        },
      ],
    });

    expect(rows.map((row) => row.business)).toEqual(["File import", "Cosmetics", "Supplement"]);
    expect(rows[0]).toMatchObject({
      name: "Amesha De Silva",
      invoice_no: "SV1007913",
      status: "paid",
      item_code: "WHEY",
      quantity: 2,
      unit_price: "4500",
    });
    expect(rows[1]?.status).toBe("Card");
    expect(rows[2]).toMatchObject({ invoice_no: "10421", item_code: "SHOP", status: "paid" });
  });
});
