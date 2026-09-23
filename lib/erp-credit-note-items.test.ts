import { describe, expect, it } from "vitest";

import {
  buildCreditNoteReturnItems,
  buildCreditNoteReturnTaxes,
  resolveCreditNoteWarehouse,
} from "@/lib/erp-credit-note-items";

describe("resolveCreditNoteWarehouse", () => {
  it("prefers item warehouse, then header, then location", () => {
    expect(resolveCreditNoteWarehouse(" Item WH ", "Header WH", "Loc WH")).toBe("Item WH");
    expect(resolveCreditNoteWarehouse("  ", "Header WH", "Loc WH")).toBe("Header WH");
    expect(resolveCreditNoteWarehouse(null, null, "Loc WH")).toBe("Loc WH");
    expect(resolveCreditNoteWarehouse(null, null, null)).toBe("");
  });
});

describe("buildCreditNoteReturnItems", () => {
  it("negates qty and copies warehouse for stock items", () => {
    expect(
      buildCreditNoteReturnItems(
        [
          {
            name: "row-1",
            item_code: "LAR21_1",
            item_name: "Serum",
            qty: 1,
            rate: 11875,
            income_account: "Sales - DTD",
            cost_center: "Main - DTD",
            uom: "Nos",
            warehouse: "Main Warehouse - DTD",
          },
        ],
        "Stores - DTD",
      ),
    ).toEqual([
      {
        item_code: "LAR21_1",
        item_name: "Serum",
        description: undefined,
        qty: -1,
        rate: 11875,
        income_account: "Sales - DTD",
        cost_center: "Main - DTD",
        uom: "Nos",
        warehouse: "Main Warehouse - DTD",
        sales_invoice_item: "row-1",
      },
    ]);
  });

  it("falls back to header/location warehouse when item warehouse blank", () => {
    const [row] = buildCreditNoteReturnItems(
      [{ item_code: "SKU", qty: 2, rate: 10, warehouse: "  " }],
      "Main Warehouse - DTD",
    );
    expect(row.warehouse).toBe("Main Warehouse - DTD");
    expect(row.qty).toBe(-2);
  });
});

describe("buildCreditNoteReturnTaxes", () => {
  it("negates Actual shipping charges", () => {
    expect(
      buildCreditNoteReturnTaxes([
        {
          charge_type: "Actual",
          account_head: "5309 - Shipping & Delivery chargers - DTD",
          description: "Negambo - DTD",
          cost_center: "Main - DTD",
          rate: 0,
          tax_amount: 400,
        },
      ]),
    ).toEqual([
      {
        charge_type: "Actual",
        account_head: "5309 - Shipping & Delivery chargers - DTD",
        description: "Negambo - DTD",
        included_in_print_rate: undefined,
        cost_center: "Main - DTD",
        rate: 0,
        tax_amount: -400,
      },
    ]);
  });
});
