import {
  BOOK_NOTE_ISSUE_STATUSES,
  type BookNoteIssueStatus,
} from "@/lib/validation/book-notes";

export { BOOK_NOTE_ISSUE_STATUSES };
export type { BookNoteIssueStatus };

export type BookNoteIssueByStatus = Record<BookNoteIssueStatus, number>;

export type BookNoteIssuePaymentEntry = {
  name: string;
  payment_type: string | null;
  amount: number | null;
  allocated_to_this_invoice: number | null;
  mode_of_payment: string | null;
  posting_date: string | null;
  party: string | null;
  clearance_date: string | null;
  already_cleared: boolean;
  company: string | null;
  account: string | null;
  account_category: string | null;
  owner: string | null;
};

export type BookNoteIssueSplitLine = {
  payment_method: string;
  amount: number;
  amount_display: string | null;
  card_last_4: string | null;
  koko_reference: string | null;
  bank_reference: string | null;
};

export type BookNoteIssueReceiptImage = {
  file_name: string;
  file_url: string;
};

export type BookNoteIssueRow = {
  name: string;
  book_note_id: string | null;
  record_key: string | null;
  sales_invoice: string | null;
  sales_invoice_raw: string | null;
  company: string;
  outlet: string | null;
  submitted_by: string | null;
  idx_no: string | null;
  posting_date: string | null;
  cash: number;
  card: number;
  card_last_4: string | null;
  koko: number;
  bank_transfer: number;
  row_total: number;
  is_multi_method: boolean;
  split_line_count: number;
  stored_status: string | null;
  status: string;
  status_label: string | null;
  verified_at: string | null;
  creation: string | null;
  age_minutes: number | null;
  special_note: string | null;
  auto_cleared: boolean;
  warehouse: string | null;
  sales_person: string | null;
  invoice_customer: string | null;
  invoice_grand_total: number | null;
  invoice_grand_total_display: string | null;
  typed_total: number | null;
  typed_total_display: string | null;
  pe_allocated_total: number | null;
  pe_allocated_total_display: string | null;
  difference: number | null;
  difference_display: string | null;
  pe_created_by: string[];
  invoice_items: string[];
  actual_categories: string[];
  expected_categories: string[];
  pe_summary: string | null;
  issue_reason: string | null;
  possible_swap_with: string | null;
  payment_entries: BookNoteIssuePaymentEntry[];
  split_lines: BookNoteIssueSplitLine[];
  receipt_images: BookNoteIssueReceiptImage[];
};

export type BookNoteIssueCompanyGroup = {
  company: string;
  issues_count: number;
  issues: BookNoteIssueRow[];
};

export type BookNoteIssueSiteResult = {
  erpInstanceId: string;
  siteLabel: string;
  baseUrl: string;
  ok: boolean;
  error: string | null;
  fetchedAt: string | null;
  totalIssues: number;
  autoClearedCount: number;
  byStatus: BookNoteIssueByStatus;
  companies: BookNoteIssueCompanyGroup[];
};

export type BookNoteIssuesAggregate = {
  fetchedAt: string;
  totalIssues: number;
  autoClearedCount: number;
  byStatus: BookNoteIssueByStatus;
  sites: BookNoteIssueSiteResult[];
};

export function emptyByStatus(): BookNoteIssueByStatus {
  return {
    amount_mismatch: 0,
    category_mismatch: 0,
    no_payment_entry_linked: 0,
    sales_invoice_not_found: 0,
    no_invoice_number: 0,
  };
}

export function isBookNoteIssueStatus(
  value: string,
): value is BookNoteIssueStatus {
  return (BOOK_NOTE_ISSUE_STATUSES as readonly string[]).includes(value);
}

export const BOOK_NOTE_ISSUE_STATUS_LABELS: Record<BookNoteIssueStatus, string> =
  {
    amount_mismatch: "Amount mismatch",
    category_mismatch: "Category mismatch",
    no_payment_entry_linked: "No payment entry",
    sales_invoice_not_found: "Invoice not found",
    no_invoice_number: "No invoice number",
  };
