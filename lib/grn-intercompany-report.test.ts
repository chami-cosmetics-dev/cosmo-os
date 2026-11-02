import { describe, expect, it } from "vitest";

import {
  buildIntercompanyReport,
  buildIntercompanyTallyDifferences,
  intercompanyMatrixValue,
  isCancelledIntercompanyDocument,
  type IntercompanyInvoice,
  type IntercompanyPurchaseReceipt,
  type IntercompanyStockReturn,
} from "@/lib/grn-intercompany-report";

function invoice(
  name: string,
  amount: number,
  references: { purchaseReceipt?: string; stockReturn?: string },
): IntercompanyInvoice {
  const isReturn = Boolean(references.stockReturn);
  return {
    name,
    postingDate: new Date("2026-10-20T00:00:00.000Z"),
    isReturn: isReturn ? 1 : 0,
    purchaseReceiptName: references.purchaseReceipt ?? null,
    supplierStockReturnName: references.stockReturn ?? null,
    billNo: references.stockReturn ? `SSR-${references.stockReturn}` : null,
    items: [
      {
        id: `${name}-item`,
        itemCode: "ITEM-A",
        itemName: "Item A",
        qty: isReturn ? -1 : 1,
        rate: Math.abs(amount),
        amount,
        purchaseReceipt: references.purchaseReceipt ?? null,
        supplierStockReturn: references.stockReturn ?? null,
      },
    ],
  };
}

describe("buildIntercompanyReport", () => {
  it("excludes cancelled documents without excluding amended replacements", () => {
    expect(isCancelledIntercompanyDocument({ docstatus: 2, status: "Cancelled" })).toBe(true);
    expect(isCancelledIntercompanyDocument({ docstatus: 1, status: "Canceled" })).toBe(true);
    expect(isCancelledIntercompanyDocument({ docstatus: 1, status: "Completed" })).toBe(false);
    expect(
      isCancelledIntercompanyDocument({
        docstatus: 1,
        status: "Completed",
        amendedFrom: "PR200-0001",
      }),
    ).toBe(false);
  });

  it("keeps the PR and SSR PI return values independent so mismatches remain visible", () => {
    const purchaseReceipts: IntercompanyPurchaseReceipt[] = [
      {
        name: "PR200-0001",
        companyName: "AJS Trading Lanka (Pvt) Ltd",
        counterpartyCompanyName: "Cosmetics.lk",
        date: new Date("2026-10-20T00:00:00.000Z"),
        cancelled: false,
        linkedStockReturnNames: ["SSR600-0001"],
      },
    ];
    const stockReturns: IntercompanyStockReturn[] = [
      {
        name: "SSR600-0001",
        companyName: "Cosmetics.lk",
        counterpartyCompanyName: "AJS Trading Lanka (Pvt) Ltd",
        date: new Date("2026-10-20T00:00:00.000Z"),
        cancelled: false,
        linkedPurchaseReceiptNames: ["PR200-0001"],
      },
    ];
    const labels = new Map([
      ["ajs trading lanka (pvt) ltd", "AJS"],
      ["cosmetics.lk", "COS"],
    ]);

    const report = buildIntercompanyReport({
      purchaseReceipts,
      stockReturns,
      invoices: [
        invoice("PI200-0001", 100, { purchaseReceipt: "PR200-0001" }),
        invoice("PI600-0001", -95, { stockReturn: "SSR600-0001" }),
      ],
      companyLabels: labels,
    });

    expect(intercompanyMatrixValue(report.matrix, "AJS Trading Lanka (Pvt) Ltd", "Cosmetics.lk")).toBe(100);
    expect(intercompanyMatrixValue(report.matrix, "Cosmetics.lk", "AJS Trading Lanka (Pvt) Ltd")).toBe(-95);
    expect(report.matrix.grandTotal).toBe(5);
    expect(report.matrix.companies.map((company) => company.label)).toEqual(["AJS", "COS"]);
  });

  it("merges multiple PRs linked to one SSR without duplicating the return invoice", () => {
    const purchaseReceipts: IntercompanyPurchaseReceipt[] = [
      {
        name: "PR200-0001",
        companyName: "AJS",
        counterpartyCompanyName: "COS",
        date: new Date("2026-10-20T00:00:00.000Z"),
        cancelled: false,
        linkedStockReturnNames: ["SSR600-0001"],
      },
      {
        name: "PR200-0002",
        companyName: "AJS",
        counterpartyCompanyName: "COS",
        date: new Date("2026-10-20T00:00:00.000Z"),
        cancelled: false,
        linkedStockReturnNames: ["SSR600-0001"],
      },
    ];
    const stockReturns: IntercompanyStockReturn[] = [
      {
        name: "SSR600-0001",
        companyName: "COS",
        counterpartyCompanyName: "AJS",
        date: new Date("2026-10-20T00:00:00.000Z"),
        cancelled: false,
        linkedPurchaseReceiptNames: ["PR200-0001", "PR200-0002"],
      },
    ];

    const report = buildIntercompanyReport({
      purchaseReceipts,
      stockReturns,
      invoices: [
        invoice("PI200-0001", 60, { purchaseReceipt: "PR200-0001" }),
        invoice("PI200-0002", 40, { purchaseReceipt: "PR200-0002" }),
        invoice("PI600-0001", -100, { stockReturn: "SSR600-0001" }),
      ],
    });

    expect(intercompanyMatrixValue(report.matrix, "AJS", "COS")).toBe(100);
    expect(intercompanyMatrixValue(report.matrix, "COS", "AJS")).toBe(-100);
    expect(report.matrix.grandTotal).toBe(0);
    expect(report.lines).toHaveLength(3);
  });

  it("merges multiple SSRs linked to one PR without duplicating the PR invoice", () => {
    const report = buildIntercompanyReport({
      purchaseReceipts: [
        {
          name: "PR200-0001",
          companyName: "AJS",
          counterpartyCompanyName: "COS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedStockReturnNames: ["SSR600-0001", "SSR600-0002"],
        },
      ],
      stockReturns: [
        {
          name: "SSR600-0001",
          companyName: "COS",
          counterpartyCompanyName: "AJS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedPurchaseReceiptNames: ["PR200-0001"],
        },
        {
          name: "SSR600-0002",
          companyName: "COS",
          counterpartyCompanyName: "AJS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedPurchaseReceiptNames: ["PR200-0001"],
        },
      ],
      invoices: [
        invoice("PI200-0001", 100, { purchaseReceipt: "PR200-0001" }),
        invoice("PI600-0001", -60, { stockReturn: "SSR600-0001" }),
        invoice("PI600-0002", -40, { stockReturn: "SSR600-0002" }),
      ],
    });

    expect(intercompanyMatrixValue(report.matrix, "AJS", "COS")).toBe(100);
    expect(intercompanyMatrixValue(report.matrix, "COS", "AJS")).toBe(-100);
    expect(report.matrix.grandTotal).toBe(0);
    expect(report.lines).toHaveLength(3);
  });

  it("includes unmatched intercompany PRs and SSRs using their own linked invoices", () => {
    const report = buildIntercompanyReport({
      purchaseReceipts: [
        {
          name: "PR200-0001",
          companyName: "AJS",
          counterpartyCompanyName: "COS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedStockReturnNames: [],
        },
      ],
      stockReturns: [
        {
          name: "SSR600-0009",
          companyName: "COS",
          counterpartyCompanyName: "AJS",
          date: new Date("2026-10-21T00:00:00.000Z"),
          cancelled: false,
          linkedPurchaseReceiptNames: [],
        },
      ],
      invoices: [
        invoice("PI200-0001", 75, { purchaseReceipt: "PR200-0001" }),
        invoice("PI600-0009", -50, { stockReturn: "SSR600-0009" }),
      ],
    });

    expect(intercompanyMatrixValue(report.matrix, "AJS", "COS")).toBe(75);
    expect(intercompanyMatrixValue(report.matrix, "COS", "AJS")).toBe(-50);
    expect(report.matrix.grandTotal).toBe(25);
    expect(report.lines.map((line) => line.status)).toEqual(["Linked PI", "Linked PI"]);
  });

  it("uses a linked Material Issue as the SSR value when there is no PI return", () => {
    const report = buildIntercompanyReport({
      purchaseReceipts: [
        {
          name: "PR200-0001",
          companyName: "AJS",
          counterpartyCompanyName: "COS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedStockReturnNames: ["SSR600-0001"],
        },
      ],
      stockReturns: [
        {
          name: "SSR600-0001",
          companyName: "COS",
          counterpartyCompanyName: "AJS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedPurchaseReceiptNames: ["PR200-0001"],
          items: [{ itemCode: "ITEM-A", qty: -2 }],
        },
      ],
      invoices: [invoice("PI200-0001", 100, { purchaseReceipt: "PR200-0001" })],
      materialIssues: [
        {
          name: "MAT-STE-2026-00001",
          postingDate: new Date("2026-10-20T00:00:00.000Z"),
          supplierStockReturnName: "SSR600-0001",
          items: [{ id: "mi-item", itemCode: "ITEM-A", itemName: "Item A", qty: -2, effectiveRate: 50 }],
        },
      ],
    });

    expect(intercompanyMatrixValue(report.matrix, "AJS", "COS")).toBe(100);
    expect(intercompanyMatrixValue(report.matrix, "COS", "AJS")).toBe(-100);
    expect(report.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        side: "SSR Material Issue",
        status: "Linked Material Issue",
        purchaseInvoice: "MAT-STE-2026-00001",
        amount: -100,
      }),
    ]));
    expect(buildIntercompanyTallyDifferences(report.lines)[0]).toEqual(expect.objectContaining({
      prLinkedPiValue: 100,
      ssrLinkedPiReturnValue: 100,
      difference: 0,
      status: "Matched",
    }));
  });

  it("keeps intercompany documents without a linked PI in the detail sheet", () => {
    const report = buildIntercompanyReport({
      purchaseReceipts: [
        {
          name: "PR200-0002",
          companyName: "AJS",
          counterpartyCompanyName: "COS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedStockReturnNames: [],
        },
      ],
      stockReturns: [],
      invoices: [],
    });

    expect(report.lines).toEqual([
      expect.objectContaining({
        reference: "PR200-0002",
        side: "PR PI",
        status: "No linked PI",
        amount: 0,
      }),
    ]);
    expect(report.matrix.companies.map((company) => company.name)).toEqual(["AJS", "COS"]);
  });

  it("excludes independent documents outside the selected date range", () => {
    const report = buildIntercompanyReport({
      purchaseReceipts: [
        {
          name: "PR200-0001",
          companyName: "AJS",
          counterpartyCompanyName: "COS",
          date: new Date("2026-09-30T00:00:00.000Z"),
          cancelled: false,
          linkedStockReturnNames: ["SSR600-0001"],
        },
      ],
      stockReturns: [
        {
          name: "SSR600-0001",
          companyName: "COS",
          counterpartyCompanyName: "AJS",
          date: new Date("2026-09-30T00:00:00.000Z"),
          cancelled: false,
          linkedPurchaseReceiptNames: ["PR200-0001"],
        },
      ],
      invoices: [invoice("PI200-0001", 100, { purchaseReceipt: "PR200-0001" })],
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-31T23:59:59.999Z"),
    });

    expect(report.lines).toEqual([]);
    expect(report.matrix.grandTotal).toBe(0);
  });

  it("shows the directional difference between PR linked PIs and SSR linked PI returns", () => {
    const report = buildIntercompanyReport({
      purchaseReceipts: [
        {
          name: "PR200-0001",
          companyName: "AJS",
          counterpartyCompanyName: "COS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedStockReturnNames: [],
        },
        {
          name: "PR600-0001",
          companyName: "COS",
          counterpartyCompanyName: "AJS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedStockReturnNames: [],
        },
      ],
      stockReturns: [
        {
          name: "SSR600-0001",
          companyName: "COS",
          counterpartyCompanyName: "AJS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedPurchaseReceiptNames: [],
        },
        {
          name: "SSR200-0001",
          companyName: "AJS",
          counterpartyCompanyName: "COS",
          date: new Date("2026-10-20T00:00:00.000Z"),
          cancelled: false,
          linkedPurchaseReceiptNames: [],
        },
      ],
      invoices: [
        invoice("PI200-0001", 100, { purchaseReceipt: "PR200-0001" }),
        invoice("PI600-0001", -95, { stockReturn: "SSR600-0001" }),
        invoice("PI600-0002", 40, { purchaseReceipt: "PR600-0001" }),
        invoice("PI200-0002", -40, { stockReturn: "SSR200-0001" }),
      ],
    });

    expect(buildIntercompanyTallyDifferences(report.lines)).toEqual([
      expect.objectContaining({
        receivingCompany: "AJS",
        supplierCompany: "COS",
        prLinkedPiValue: 100,
        ssrLinkedPiReturnValue: 95,
        difference: 5,
        status: "Difference",
      }),
      expect.objectContaining({
        receivingCompany: "COS",
        supplierCompany: "AJS",
        prLinkedPiValue: 40,
        ssrLinkedPiReturnValue: 40,
        difference: 0,
        status: "Matched",
      }),
    ]);
  });
});
