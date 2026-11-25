/** Item Drafting → Shopify Draft tab. Client-safe types. */

export const REDIRECTION_LINK_MAX = 500;

export type ShopifyDraftRow = {
  sku: string;
  productTitle: string | null;
  priorityStatus: string | null;
  /** Shopify product handle from the synced products; null = not found (metrics stay 0). */
  handle: string | null;
  impressions: number;
  clicks: number;
  /** Fraction (0.0149 = 1.49%). */
  ctr: number;
  avgPosition: number;
  redirectionLink: string | null;
  /** ISO; set once Draft is clicked (irreversible). */
  draftClickedDate: string | null;
  draftClickedBy: string | null;
  /** Approved by test-mode (dry-run) clicks — nothing was disabled in the ERPs. */
  testApproval: boolean;
  /** The last Draft click failed the Shopify check (still Active / Archived): Draft is clickable again. */
  mismatch: boolean;
  /** Every Draft click and its Shopify check, newest first. */
  attempts: DraftAttemptInfo[];
};

export type DraftCheckResult = "AWAITING" | "PASS" | "FAIL" | "CHECK_FAILED";

export type DraftAttemptInfo = {
  clickedAt: string;
  clickedBy: string;
  result: DraftCheckResult;
  /** DRAFT / ACTIVE / ARCHIVED, when Shopify was read. */
  shopifyStatus: string | null;
  checkedAt: string | null;
  /** Why the check could not be done (CHECK_FAILED). */
  lastError: string | null;
};

export type SearchConsoleReportInfo = {
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  /** The file's own created date (workbook properties); null only for reports saved before this was kept. */
  fileCreatedAt: string | null;
  pagesRead: number;
  productRows: number;
  skippedRows: number;
  handleCount: number;
  warnings: string[];
};

export type ShopifyDraftData = {
  rows: ShopifyDraftRow[];
  /** Latest processed Search Console report; null = none yet (Draft stays disabled). */
  report: SearchConsoleReportInfo | null;
};
