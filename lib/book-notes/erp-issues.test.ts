import { describe, expect, it } from "vitest";

import {
  buildErpReceiptProxyUrl,
  mergeBookNoteIssueSites,
  normalizeBookNoteIssuesMessage,
  parseBookNoteIssueRow,
  sanitizeErpReceiptPath,
} from "@/lib/book-notes/erp-issues";
import { emptyByStatus } from "@/lib/book-notes/issue-types";

const sampleIssue = {
  name: "av826cf69v",
  book_note_id: "cmu747w19004mkw04og0iiypj",
  record_key: "600-004618",
  sales_invoice: "600-004618",
  sales_invoice_raw: "600-004618",
  company: "Cosmetics.lk",
  outlet: "API",
  submitted_by: "chamigunawardane@gmail.com",
  idx_no: "3",
  posting_date: "2026-09-18",
  cash: 0,
  card: 3800,
  card_last_4: "5934",
  koko: 0,
  bank_transfer: 0,
  row_total: 3800,
  is_multi_method: 0,
  split_line_count: 1,
  stored_status: "amount_mismatch",
  status: "amount_mismatch",
  status_label: "Amount Mismatch",
  verified_at: "2026-09-19 13:51:00.789205",
  creation: "2026-09-18 21:01:25.027071",
  age_minutes: 3789.9,
  special_note: null,
  auto_cleared: false,
  warehouse: "Kiribathgoda Shop Warehouse - Cosmo",
  sales_person: "MER88-Naduni",
  invoice_customer: "rukmal",
  invoice_grand_total: 7135,
  invoice_grand_total_display: "7,135.00",
  typed_total: 3800,
  typed_total_display: "3,800.00",
  pe_allocated_total: 7135,
  pe_allocated_total_display: "7,135.00",
  difference: 3335,
  difference_display: "3,335.00",
  pe_created_by: ["rukshikanaduni36@gmail.com"],
  invoice_items: ["Keune Style The Rock 200ml"],
  actual_categories: ["CA"],
  expected_categories: ["CA"],
  pe_summary: "1 PE: REC600-003104 (Rs 7,135.00, Credit Card)",
  issue_reason:
    "Typed Rs 3,800.00 but PE allocated Rs 7,135.00 (invoice total Rs 7,135.00)",
  possible_swap_with: null,
  payment_entries: [
    {
      name: "REC600-003104",
      payment_type: "Receive",
      amount: 7135,
      allocated_to_this_invoice: 7135,
      mode_of_payment: "Credit Card",
      posting_date: "2026-09-18",
      party: "0763246604",
      clearance_date: null,
      already_cleared: false,
      company: "Cosmetics.lk",
      account: "1401 - Seylan Bank 0540-001(CA) - Cosmo",
      account_category: "CA",
      owner: "rukshikanaduni36@gmail.com",
    },
  ],
  split_lines: [
    {
      payment_method: "Card",
      amount: 3800,
      amount_display: "3,800.00",
      card_last_4: "5934",
      koko_reference: null,
      bank_reference: null,
    },
  ],
  receipt_images: [
    {
      file_name: "slip.jpg",
      file_url: "/private/files/slip.jpg",
    },
  ],
};

describe("parseBookNoteIssueRow", () => {
  it("parses a live ERP1 issue row", () => {
    const row = parseBookNoteIssueRow(sampleIssue);
    expect(row).not.toBeNull();
    expect(row!.name).toBe("av826cf69v");
    expect(row!.status).toBe("amount_mismatch");
    expect(row!.difference).toBe(3335);
    expect(row!.payment_entries).toHaveLength(1);
    expect(row!.receipt_images[0]!.file_url).toBe("/private/files/slip.jpg");
    expect(row!.is_multi_method).toBe(false);
  });

  it("rejects rows without name/company/status", () => {
    expect(parseBookNoteIssueRow({ name: "x" })).toBeNull();
  });
});

describe("normalizeBookNoteIssuesMessage", () => {
  it("normalizes a site payload and derives by_status when missing", () => {
    const site = normalizeBookNoteIssuesMessage(
      {
        site_label: "ERP1 Cosmetics",
        fetched_at: "2026-09-21 12:00:00",
        total_issues: 1,
        auto_cleared_count: 0,
        companies: [
          {
            company: "Cosmetics.lk",
            issues_count: 1,
            issues: [sampleIssue],
          },
        ],
      },
      {
        erpInstanceId: "inst_1",
        fallbackLabel: "ERP_1",
        baseUrl: "https://erp1.example.com",
      },
    );

    expect(site.ok).toBe(true);
    expect(site.siteLabel).toBe("ERP1 Cosmetics");
    expect(site.totalIssues).toBe(1);
    expect(site.byStatus.amount_mismatch).toBe(1);
    expect(site.companies[0]!.issues).toHaveLength(1);
  });

  it("marks empty message as soft-fail", () => {
    const site = normalizeBookNoteIssuesMessage(null, {
      erpInstanceId: "inst_1",
      fallbackLabel: "ERP_1",
      baseUrl: "https://erp1.example.com",
    });
    expect(site.ok).toBe(false);
    expect(site.error).toMatch(/invalid/i);
  });
});

describe("mergeBookNoteIssueSites", () => {
  it("sums successful sites and keeps soft-failed ones", () => {
    const ok = normalizeBookNoteIssuesMessage(
      {
        site_label: "ERP1 Cosmetics",
        total_issues: 1,
        by_status: { amount_mismatch: 1 },
        companies: [
          { company: "Cosmetics.lk", issues_count: 1, issues: [sampleIssue] },
        ],
      },
      {
        erpInstanceId: "inst_1",
        fallbackLabel: "ERP_1",
        baseUrl: "https://erp1.example.com",
      },
    );
    const fail = {
      erpInstanceId: "inst_2",
      siteLabel: "ERP2 Outlets",
      baseUrl: "https://erp2.example.com",
      ok: false,
      error: "method missing",
      fetchedAt: null,
      totalIssues: 0,
      autoClearedCount: 0,
      byStatus: emptyByStatus(),
      companies: [],
    };

    const merged = mergeBookNoteIssueSites([ok, fail]);
    expect(merged.totalIssues).toBe(1);
    expect(merged.byStatus.amount_mismatch).toBe(1);
    expect(merged.sites).toHaveLength(2);
    expect(merged.sites[1]!.ok).toBe(false);
  });
});

describe("sanitizeErpReceiptPath", () => {
  it("accepts private and public file paths", () => {
    expect(sanitizeErpReceiptPath("/private/files/a.jpg")).toBe(
      "/private/files/a.jpg",
    );
    expect(sanitizeErpReceiptPath("/files/a.jpg")).toBe("/files/a.jpg");
  });

  it("strips absolute URLs down to pathname", () => {
    expect(
      sanitizeErpReceiptPath("https://erp.example.com/private/files/a.jpg"),
    ).toBe("/private/files/a.jpg");
  });

  it("rejects traversal, query injection, and arbitrary paths", () => {
    expect(sanitizeErpReceiptPath("/private/files/../secret")).toBeNull();
    expect(sanitizeErpReceiptPath("/private/files/a.jpg?x=1")).toBeNull();
    expect(sanitizeErpReceiptPath("/api/method/evil")).toBeNull();
    expect(sanitizeErpReceiptPath("http://evil.com/private/files/a.jpg")).toBe(
      "/private/files/a.jpg",
    );
    expect(sanitizeErpReceiptPath("//evil.com/private/files/a.jpg")).toBeNull();
    expect(sanitizeErpReceiptPath("")).toBeNull();
  });
});

describe("buildErpReceiptProxyUrl", () => {
  it("builds a Cosmo proxy URL", () => {
    const url = buildErpReceiptProxyUrl("clxyz", "/private/files/slip.jpg");
    expect(url).toBe(
      "/api/admin/book-notes/erp-receipt?instanceId=clxyz&path=%2Fprivate%2Ffiles%2Fslip.jpg",
    );
  });

  it("returns null for unsafe paths", () => {
    expect(buildErpReceiptProxyUrl("clxyz", "/etc/passwd")).toBeNull();
  });
});
