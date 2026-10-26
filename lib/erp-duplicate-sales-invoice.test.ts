import { describe, expect, it } from "vitest";

import {
  keepCanonicalSalesInvoicesByPo,
  selectCanonicalSalesInvoice,
  shouldVoidOrderForCancelledSalesInvoice,
  unpaidDuplicateSalesInvoices,
} from "@/lib/erp-duplicate-sales-invoice";

const pair = [
  {
    name: "600-004087",
    outstanding_amount: 10970,
    grand_total: 10970,
    creation: "2026-09-07 11:07:10",
  },
  {
    name: "600-004088",
    outstanding_amount: 0,
    grand_total: 10970,
    creation: "2026-09-07 11:07:14",
  },
];

describe("selectCanonicalSalesInvoice", () => {
  it("keeps the paid invoice when an earlier copy is still unpaid", () => {
    expect(selectCanonicalSalesInvoice(pair)?.name).toBe("600-004088");
  });

  it("keeps the earliest invoice when none are paid", () => {
    expect(
      selectCanonicalSalesInvoice([
        { name: "600-000002", outstanding_amount: 100, grand_total: 100, creation: "2026-07-01 11:00:05" },
        { name: "600-000001", outstanding_amount: 100, grand_total: 100, creation: "2026-07-01 11:00:01" },
      ])?.name,
    ).toBe("600-000001");
  });

  it("keeps the Vault-linked paid invoice when two copies are paid", () => {
    expect(
      selectCanonicalSalesInvoice(
        [
          { name: "SV100-1773", outstanding_amount: 0, grand_total: 12550, creation: "2026-10-06 17:59:47" },
          { name: "SV100-1774", outstanding_amount: 0, grand_total: 12550, creation: "2026-10-06 17:59:52" },
        ],
        new Set(["SV100-1774"]),
      )?.name,
    ).toBe("SV100-1774");
  });
});

describe("shouldVoidOrderForCancelledSalesInvoice", () => {
  it("does not void when the cancelled invoice is the unpaid duplicate", () => {
    expect(
      shouldVoidOrderForCancelledSalesInvoice({
        cancelledInvoiceName: "600-001483",
        linkedInvoiceId: "600-001484",
      }),
    ).toBe(false);
  });

  it("voids when the cancelled invoice is the one linked on the order", () => {
    expect(
      shouldVoidOrderForCancelledSalesInvoice({
        cancelledInvoiceName: "600-001484",
        linkedInvoiceId: "600-001484",
      }),
    ).toBe(true);
    expect(
      shouldVoidOrderForCancelledSalesInvoice({
        cancelledInvoiceName: "600-001484",
        linkedInvoiceId: null,
      }),
    ).toBe(true);
  });
});

describe("unpaidDuplicateSalesInvoices", () => {
  it("returns the fully unpaid copy of a paid invoice", () => {
    expect(unpaidDuplicateSalesInvoices(pair).map((row) => row.name)).toEqual(["600-004087"]);
  });

  it("does not cancel anything when every invoice is still unpaid", () => {
    expect(
      unpaidDuplicateSalesInvoices([
        { name: "600-000001", outstanding_amount: 100, grand_total: 100, creation: "2026-07-01 11:00:01" },
        { name: "600-000002", outstanding_amount: 100, grand_total: 100, creation: "2026-07-01 11:00:05" },
      ]),
    ).toEqual([]);
  });

  it("does not cancel a second paid invoice or a partial payment", () => {
    const rows = [
      { name: "600-000010", outstanding_amount: 0, grand_total: 500, creation: "2026-07-01 11:00:01" },
      { name: "600-000011", outstanding_amount: 0, grand_total: 500, creation: "2026-07-01 11:00:05" },
      { name: "600-000012", outstanding_amount: 100, grand_total: 500, creation: "2026-07-01 11:00:06" },
      { name: "600-000013", outstanding_amount: 800, grand_total: 800, creation: "2026-07-01 11:00:07" },
    ];
    expect(unpaidDuplicateSalesInvoices(rows)).toEqual([]);
  });
});

describe("keepCanonicalSalesInvoicesByPo", () => {
  it("counts one sale when two paid invoices share po_no", () => {
    const kept = keepCanonicalSalesInvoicesByPo(
      [
        {
          name: "SV100-1773",
          po_no: "SV1009298",
          company: "SupplementVault.lk",
          outstanding_amount: 0,
          grand_total: 12550,
          net_total: 12150,
          is_return: 0,
          creation: "2026-10-06 17:59:47",
        },
        {
          name: "SV100-1774",
          po_no: "SV1009298",
          company: "SupplementVault.lk",
          outstanding_amount: 0,
          grand_total: 12550,
          net_total: 12150,
          is_return: 0,
          creation: "2026-10-06 17:59:52",
        },
      ],
      new Set(["SV100-1774"]),
    );
    expect(kept.map((row) => row.name)).toEqual(["SV100-1774"]);
  });

  it("does not merge invoices without po_no or return notes", () => {
    const rows = [
      {
        name: "POS-1",
        po_no: "",
        company: "SupplementVault.lk",
        outstanding_amount: 0,
        grand_total: 1000,
        net_total: 1000,
        is_return: 0,
      },
      {
        name: "POS-2",
        po_no: null,
        company: "SupplementVault.lk",
        outstanding_amount: 0,
        grand_total: 2000,
        net_total: 2000,
        is_return: 0,
      },
      {
        name: "CN-1",
        po_no: "SV1009298",
        company: "SupplementVault.lk",
        outstanding_amount: 0,
        grand_total: -12150,
        net_total: -12150,
        is_return: 1,
      },
    ];
    expect(keepCanonicalSalesInvoicesByPo(rows).map((row) => row.name)).toEqual([
      "POS-1",
      "POS-2",
      "CN-1",
    ]);
  });
});
