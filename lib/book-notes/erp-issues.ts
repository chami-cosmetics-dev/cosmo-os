import "server-only";

import { extractErpErrorMessage } from "@/lib/book-notes/erp-verify";
import {
  BOOK_NOTE_ISSUE_STATUSES,
  emptyByStatus,
  isBookNoteIssueStatus,
  type BookNoteIssueByStatus,
  type BookNoteIssueCompanyGroup,
  type BookNoteIssuePaymentEntry,
  type BookNoteIssueReceiptImage,
  type BookNoteIssueRow,
  type BookNoteIssueSiteResult,
  type BookNoteIssueSplitLine,
  type BookNoteIssueStatus,
  type BookNoteIssuesAggregate,
} from "@/lib/book-notes/issue-types";
import {
  getAllOsfErpInstances,
  type OsfErpCredentials,
  type OsfErpInstance,
} from "@/lib/osf/erp-stock";

export {
  BOOK_NOTE_ISSUE_STATUSES,
  emptyByStatus,
  isBookNoteIssueStatus,
};
export type {
  BookNoteIssueByStatus,
  BookNoteIssueCompanyGroup,
  BookNoteIssuePaymentEntry,
  BookNoteIssueReceiptImage,
  BookNoteIssueRow,
  BookNoteIssueSiteResult,
  BookNoteIssueSplitLine,
  BookNoteIssueStatus,
  BookNoteIssuesAggregate,
};

export type BookNoteIssuesQuery = {
  dateFrom?: string;
  dateTo?: string;
  status?: BookNoteIssueStatus;
  includeResolved?: boolean;
};

const CACHE_TTL_MS = 30_000;

type CacheEntry = {
  expiresAt: number;
  value: BookNoteIssuesAggregate;
};

const cache = new Map<string, CacheEntry>();

export function getBookNoteIssuesMethod(): string {
  return (
    process.env.ERPNEXT_BOOK_NOTE_ISSUES_METHOD?.trim() ||
    "cosmo_os_list_book_note_issues"
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  return false;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

function mergeByStatus(
  into: BookNoteIssueByStatus,
  from: Partial<Record<string, number>> | null | undefined,
): void {
  if (!from) return;
  for (const key of BOOK_NOTE_ISSUE_STATUSES) {
    const n = asNumber(from[key]);
    if (n != null) into[key] += n;
  }
}

function parseByStatus(raw: unknown): BookNoteIssueByStatus {
  const out = emptyByStatus();
  const rec = asRecord(raw);
  if (!rec) return out;
  for (const key of BOOK_NOTE_ISSUE_STATUSES) {
    const n = asNumber(rec[key]);
    if (n != null) out[key] = n;
  }
  return out;
}

function parsePaymentEntry(raw: unknown): BookNoteIssuePaymentEntry | null {
  const r = asRecord(raw);
  if (!r) return null;
  const name = asString(r.name);
  if (!name) return null;
  return {
    name,
    payment_type: asString(r.payment_type),
    amount: asNumber(r.amount),
    allocated_to_this_invoice: asNumber(r.allocated_to_this_invoice),
    mode_of_payment: asString(r.mode_of_payment),
    posting_date: asString(r.posting_date),
    party: asString(r.party),
    clearance_date: asString(r.clearance_date),
    already_cleared: asBool(r.already_cleared),
    company: asString(r.company),
    account: asString(r.account),
    account_category: asString(r.account_category),
    owner: asString(r.owner),
  };
}

function parseSplitLine(raw: unknown): BookNoteIssueSplitLine | null {
  const r = asRecord(raw);
  if (!r) return null;
  const payment_method = asString(r.payment_method);
  const amount = asNumber(r.amount);
  if (!payment_method || amount == null) return null;
  return {
    payment_method,
    amount,
    amount_display: asString(r.amount_display),
    card_last_4: asString(r.card_last_4),
    koko_reference: asString(r.koko_reference),
    bank_reference: asString(r.bank_reference),
  };
}

function parseReceiptImage(raw: unknown): BookNoteIssueReceiptImage | null {
  const r = asRecord(raw);
  if (!r) return null;
  const file_url = asString(r.file_url);
  if (!file_url) return null;
  return {
    file_name: asString(r.file_name) ?? file_url.split("/").pop() ?? "receipt",
    file_url,
  };
}

export function parseBookNoteIssueRow(raw: unknown): BookNoteIssueRow | null {
  const r = asRecord(raw);
  if (!r) return null;
  const name = asString(r.name);
  const company = asString(r.company);
  const status = asString(r.status);
  if (!name || !company || !status) return null;

  const peCreated = Array.isArray(r.pe_created_by)
    ? asStringArray(r.pe_created_by)
    : asString(r.pe_created_by)
      ? [asString(r.pe_created_by)!]
      : [];

  return {
    name,
    book_note_id: asString(r.book_note_id),
    record_key: asString(r.record_key),
    sales_invoice: asString(r.sales_invoice),
    sales_invoice_raw: asString(r.sales_invoice_raw),
    company,
    outlet: asString(r.outlet),
    submitted_by: asString(r.submitted_by),
    idx_no: asString(r.idx_no),
    posting_date: asString(r.posting_date),
    cash: asNumber(r.cash) ?? 0,
    card: asNumber(r.card) ?? 0,
    card_last_4: asString(r.card_last_4),
    koko: asNumber(r.koko) ?? 0,
    bank_transfer: asNumber(r.bank_transfer) ?? 0,
    row_total: asNumber(r.row_total) ?? 0,
    is_multi_method: asBool(r.is_multi_method),
    split_line_count: asNumber(r.split_line_count) ?? 0,
    stored_status: asString(r.stored_status),
    status,
    status_label: asString(r.status_label),
    verified_at: asString(r.verified_at),
    creation: asString(r.creation),
    age_minutes: asNumber(r.age_minutes),
    special_note: asString(r.special_note),
    auto_cleared: asBool(r.auto_cleared),
    warehouse: asString(r.warehouse),
    sales_person: asString(r.sales_person),
    invoice_customer: asString(r.invoice_customer),
    invoice_grand_total: asNumber(r.invoice_grand_total),
    invoice_grand_total_display: asString(r.invoice_grand_total_display),
    typed_total: asNumber(r.typed_total),
    typed_total_display: asString(r.typed_total_display),
    pe_allocated_total: asNumber(r.pe_allocated_total),
    pe_allocated_total_display: asString(r.pe_allocated_total_display),
    difference: asNumber(r.difference),
    difference_display: asString(r.difference_display),
    pe_created_by: peCreated,
    invoice_items: asStringArray(r.invoice_items),
    actual_categories: asStringArray(r.actual_categories),
    expected_categories: asStringArray(r.expected_categories),
    pe_summary: asString(r.pe_summary),
    issue_reason: asString(r.issue_reason),
    possible_swap_with: asString(
      typeof r.possible_swap_with === "object" && r.possible_swap_with
        ? (asRecord(r.possible_swap_with)?.sales_invoice ??
            asRecord(r.possible_swap_with)?.record_key ??
            null)
        : r.possible_swap_with,
    ),
    payment_entries: Array.isArray(r.payment_entries)
      ? r.payment_entries
          .map(parsePaymentEntry)
          .filter((x): x is BookNoteIssuePaymentEntry => Boolean(x))
      : [],
    split_lines: Array.isArray(r.split_lines)
      ? r.split_lines
          .map(parseSplitLine)
          .filter((x): x is BookNoteIssueSplitLine => Boolean(x))
      : [],
    receipt_images: Array.isArray(r.receipt_images)
      ? r.receipt_images
          .map(parseReceiptImage)
          .filter((x): x is BookNoteIssueReceiptImage => Boolean(x))
      : [],
  };
}

/**
 * Normalize one ERP site's `message` payload into a Cosmo site result.
 * Exported for unit tests.
 */
export function normalizeBookNoteIssuesMessage(
  message: unknown,
  meta: {
    erpInstanceId: string;
    fallbackLabel: string;
    baseUrl: string;
  },
): BookNoteIssueSiteResult {
  const root = asRecord(message);
  if (!root) {
    return {
      erpInstanceId: meta.erpInstanceId,
      siteLabel: meta.fallbackLabel,
      baseUrl: meta.baseUrl,
      ok: false,
      error: "ERP returned an empty or invalid message",
      fetchedAt: null,
      totalIssues: 0,
      autoClearedCount: 0,
      byStatus: emptyByStatus(),
      companies: [],
    };
  }

  const companiesRaw = Array.isArray(root.companies) ? root.companies : [];
  const companies: BookNoteIssueCompanyGroup[] = [];
  for (const c of companiesRaw) {
    const rec = asRecord(c);
    if (!rec) continue;
    const company = asString(rec.company);
    if (!company) continue;
    const issues = Array.isArray(rec.issues)
      ? rec.issues
          .map(parseBookNoteIssueRow)
          .filter((x): x is BookNoteIssueRow => Boolean(x))
      : [];
    companies.push({
      company,
      issues_count: asNumber(rec.issues_count) ?? issues.length,
      issues,
    });
  }

  const byStatus = parseByStatus(root.by_status);
  // If ERP omitted by_status, derive from rows.
  const statusSum = BOOK_NOTE_ISSUE_STATUSES.reduce(
    (s, k) => s + byStatus[k],
    0,
  );
  if (statusSum === 0) {
    for (const c of companies) {
      for (const issue of c.issues) {
        if (isBookNoteIssueStatus(issue.status) && !issue.auto_cleared) {
          byStatus[issue.status] += 1;
        }
      }
    }
  }

  const totalFromRows = companies.reduce((s, c) => s + c.issues.length, 0);

  return {
    erpInstanceId: meta.erpInstanceId,
    siteLabel: asString(root.site_label) ?? meta.fallbackLabel,
    baseUrl: meta.baseUrl,
    ok: true,
    error: null,
    fetchedAt: asString(root.fetched_at),
    totalIssues: asNumber(root.total_issues) ?? totalFromRows,
    autoClearedCount: asNumber(root.auto_cleared_count) ?? 0,
    byStatus,
    companies,
  };
}

/**
 * Safe relative ERP file path for the receipt proxy.
 * Accepts `/private/files/...` and `/files/...` only.
 */
export function sanitizeErpReceiptPath(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let path = raw.trim();
  if (!path) return null;

  // Strip absolute ERP URL down to pathname if a full URL sneaks in.
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.includes("..") || path.includes("\\") || path.includes("//")) {
    return null;
  }
  if (!(path.startsWith("/private/files/") || path.startsWith("/files/"))) {
    return null;
  }
  // Disallow query/hash injection
  if (path.includes("?") || path.includes("#")) return null;
  return path;
}

export function buildErpReceiptProxyUrl(
  erpInstanceId: string,
  fileUrl: string,
): string | null {
  const path = sanitizeErpReceiptPath(fileUrl);
  if (!path) return null;
  const params = new URLSearchParams({
    instanceId: erpInstanceId,
    path,
  });
  return `/api/admin/book-notes/erp-receipt?${params.toString()}`;
}

export function rewriteSiteReceiptUrls(
  site: BookNoteIssueSiteResult,
): BookNoteIssueSiteResult {
  if (!site.ok) return site;
  return {
    ...site,
    companies: site.companies.map((c) => ({
      ...c,
      issues: c.issues.map((issue) => ({
        ...issue,
        receipt_images: issue.receipt_images
          .map((img) => {
            const proxied = buildErpReceiptProxyUrl(
              site.erpInstanceId,
              img.file_url,
            );
            if (!proxied) return null;
            return { ...img, file_url: proxied };
          })
          .filter((x): x is BookNoteIssueReceiptImage => Boolean(x)),
      })),
    })),
  };
}

function cacheKey(companyId: string, query: BookNoteIssuesQuery): string {
  return [
    companyId,
    query.dateFrom ?? "",
    query.dateTo ?? "",
    query.status ?? "",
    query.includeResolved ? "1" : "0",
  ].join("|");
}

/** Test helper — clears the in-process TTL cache. */
export function clearBookNoteIssuesCache(): void {
  cache.clear();
}

async function fetchOneSite(
  instance: OsfErpInstance,
  query: BookNoteIssuesQuery,
): Promise<BookNoteIssueSiteResult> {
  const method = getBookNoteIssuesMethod();
  const baseUrl = instance.cfg.baseUrl.replace(/\/$/, "");
  const fallbackLabel = instance.label?.trim() || instance.id;
  const url = new URL(`${baseUrl}/api/method/${method}`);
  if (query.dateFrom) url.searchParams.set("date_from", query.dateFrom);
  if (query.dateTo) url.searchParams.set("date_to", query.dateTo);
  if (query.status) url.searchParams.set("status", query.status);
  if (query.includeResolved) url.searchParams.set("include_resolved", "1");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: authHeaders(instance.cfg),
      cache: "no-store",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      erpInstanceId: instance.id,
      siteLabel: fallbackLabel,
      baseUrl,
      ok: false,
      error: `Could not reach ERP: ${detail}`,
      fetchedAt: null,
      totalIssues: 0,
      autoClearedCount: 0,
      byStatus: emptyByStatus(),
      companies: [],
    };
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }

  if (!res.ok) {
    const msg = extractErpErrorMessage(parsed, res.status, text);
    return {
      erpInstanceId: instance.id,
      siteLabel: fallbackLabel,
      baseUrl,
      ok: false,
      error: msg,
      fetchedAt: null,
      totalIssues: 0,
      autoClearedCount: 0,
      byStatus: emptyByStatus(),
      companies: [],
    };
  }

  const root = asRecord(parsed);
  const message = root?.message ?? parsed;
  return normalizeBookNoteIssuesMessage(message, {
    erpInstanceId: instance.id,
    fallbackLabel,
    baseUrl,
  });
}

function authHeaders(cfg: OsfErpCredentials): Record<string, string> {
  return {
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    Accept: "application/json",
  };
}

/**
 * Merge soft-failed + successful site results into one aggregate.
 * Exported for unit tests.
 */
export function mergeBookNoteIssueSites(
  sites: BookNoteIssueSiteResult[],
): BookNoteIssuesAggregate {
  const byStatus = emptyByStatus();
  let totalIssues = 0;
  let autoClearedCount = 0;
  for (const site of sites) {
    if (!site.ok) continue;
    totalIssues += site.totalIssues;
    autoClearedCount += site.autoClearedCount;
    mergeByStatus(byStatus, site.byStatus);
  }
  return {
    fetchedAt: new Date().toISOString(),
    totalIssues,
    autoClearedCount,
    byStatus,
    sites,
  };
}

/**
 * Fan out to every configured ERP instance for the company.
 * Soft-fails per site; uses a ~30s in-process TTL cache.
 */
export async function fetchBookNoteIssuesFromErps(
  companyId: string,
  query: BookNoteIssuesQuery = {},
): Promise<BookNoteIssuesAggregate> {
  const key = cacheKey(companyId, query);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const instances = await getAllOsfErpInstances(companyId);
  if (instances.length === 0) {
    const empty: BookNoteIssuesAggregate = {
      fetchedAt: new Date().toISOString(),
      totalIssues: 0,
      autoClearedCount: 0,
      byStatus: emptyByStatus(),
      sites: [],
    };
    return empty;
  }

  const rawSites = await Promise.all(
    instances.map((inst) => fetchOneSite(inst, query)),
  );
  const sites = rawSites.map(rewriteSiteReceiptUrls);
  const aggregate = mergeBookNoteIssueSites(sites);

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: aggregate });
  return aggregate;
}

/**
 * Fetch a private ERP file for streaming through Cosmo.
 * Returns null when the instance is missing / not owned by company.
 */
export async function fetchErpPrivateFile(input: {
  companyId: string;
  instanceId: string;
  path: string;
}): Promise<
  | { ok: true; body: ArrayBuffer; contentType: string }
  | { ok: false; status: number; error: string }
> {
  const path = sanitizeErpReceiptPath(input.path);
  if (!path) {
    return { ok: false, status: 400, error: "Invalid receipt path" };
  }

  const instances = await getAllOsfErpInstances(input.companyId);
  const instance = instances.find((i) => i.id === input.instanceId);
  if (!instance) {
    return { ok: false, status: 404, error: "ERP instance not found" };
  }

  const url = `${instance.cfg.baseUrl.replace(/\/$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: authHeaders(instance.cfg),
      cache: "no-store",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `Could not reach ERP: ${detail}` };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status === 404 ? 404 : 502,
      error: `ERP file HTTP ${res.status}`,
    };
  }

  const body = await res.arrayBuffer();
  const contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim() ||
    "application/octet-stream";
  return { ok: true, body, contentType };
}
