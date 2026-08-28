import { getErpConfig } from "@/lib/erpnext-sync";
import type { ErpnextInstance } from "@prisma/client";

/** ERP Server Script API method for ss9_verify_book_note.py (override via env). */
export function getBookNoteVerifyMethod(): string {
  return (
    process.env.ERPNEXT_BOOK_NOTE_VERIFY_METHOD?.trim() || "verify_book_note"
  );
}

export type BookNoteErpVerifyRowInput = {
  idx_no: string;
  sales_invoice: string;
  cash: number;
  card: number;
  /** Last 4 digits of POS card receipt ref (ss9 `card_last_4`). */
  card_last_4?: string | null;
  koko: number;
  bank_transfer: number;
};

export type BookNoteErpVerifySummary = {
  verified_count: number;
  mismatch_count: number;
  not_found_count: number;
  total_rows: number;
};

export type BookNoteErpFailCode =
  | "ERP_CREDENTIALS_MISSING"
  | "NO_ROWS"
  | "NETWORK"
  | "ERP_HTTP"
  | "ERP_METHOD_MISSING"
  | "ERP_SCRIPT_ERROR"
  | "ERP_UNKNOWN";

export type BookNoteErpVerifyResult = {
  ok: boolean;
  method: string;
  company: string;
  postingDate?: string;
  erpUrl?: string;
  summary: BookNoteErpVerifySummary | null;
  rows: unknown[];
  rawMessage: unknown;
  error?: string;
  code?: BookNoteErpFailCode;
  httpStatus?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Pull the most useful human message out of a Frappe/ERPNext error body. */
export function extractErpErrorMessage(
  parsed: unknown,
  httpStatus: number,
  rawText: string,
): string {
  const root = asRecord(parsed);
  if (!root) {
    const snippet = rawText.trim().slice(0, 400);
    return snippet
      ? `ERP HTTP ${httpStatus}: ${snippet}`
      : `ERP HTTP ${httpStatus} (empty response)`;
  }

  // _server_messages is a JSON-encoded array of { message: "..." }
  if (typeof root._server_messages === "string") {
    try {
      const list = JSON.parse(root._server_messages) as unknown;
      if (Array.isArray(list) && list.length > 0) {
        const parts = list
          .map((item) => {
            if (typeof item === "string") {
              try {
                const inner = JSON.parse(item) as { message?: unknown };
                return typeof inner.message === "string" ? inner.message : item;
              } catch {
                return item;
              }
            }
            const rec = asRecord(item);
            return typeof rec?.message === "string" ? rec.message : null;
          })
          .filter((m): m is string => Boolean(m && m.trim()));
        if (parts.length) return parts.join(" | ");
      }
    } catch {
      // fall through
    }
  }

  if (typeof root.exception === "string" && root.exception.trim()) {
    // Often "frappe.exceptions.ValidationError: rows_json is required"
    const exc = root.exception.trim();
    const afterColon = exc.includes(": ")
      ? exc.slice(exc.indexOf(": ") + 2).trim()
      : exc;
    return afterColon || exc;
  }

  if (typeof root.exc_type === "string" && typeof root.message === "string") {
    return `${root.exc_type}: ${root.message}`;
  }

  if (typeof root.message === "string" && root.message.trim()) {
    return root.message.trim();
  }

  // Nested message object
  const nested = asRecord(root.message);
  if (nested && typeof nested.message === "string") {
    return nested.message;
  }

  const snippet = rawText.trim().slice(0, 400);
  return snippet
    ? `ERP HTTP ${httpStatus}: ${snippet}`
    : `ERP HTTP ${httpStatus}`;
}

function classifyErpFailure(
  httpStatus: number,
  message: string,
): BookNoteErpFailCode {
  const low = message.toLowerCase();
  if (
    httpStatus === 404 ||
    low.includes("not found") ||
    low.includes("does not exist") ||
    (low.includes("method") && low.includes("not"))
  ) {
    return "ERP_METHOD_MISSING";
  }
  if (httpStatus >= 400) return "ERP_SCRIPT_ERROR";
  return "ERP_HTTP";
}

/**
 * Push merchant book-note rows to ERP ss9 verify Server Script.
 * Script expects form_dict:
 *   - rows_json (required JSON string)
 *   - company (optional soft cross-check / fallback)
 *   - posting_date (YYYY-MM-DD — stored on Book Note Entry)
 * Outlet on ERP is derived from the API user's full_name by the script
 * (not sent from Cosmo).
 */
export async function sendBookNoteRowsToErp(input: {
  erpnextInstance: ErpnextInstance | null;
  company: string;
  /** Colombo sales date YYYY-MM-DD. */
  postingDate: string;
  rows: BookNoteErpVerifyRowInput[];
}): Promise<BookNoteErpVerifyResult> {
  const cfg = getErpConfig(input.erpnextInstance);
  const method = getBookNoteVerifyMethod();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const erpUrl = base ? `${base}/api/method/${method}` : undefined;
  const postingDate = input.postingDate.trim();

  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    return {
      ok: false,
      method,
      company: input.company,
      postingDate,
      erpUrl,
      summary: null,
      rows: [],
      rawMessage: null,
      code: "ERP_CREDENTIALS_MISSING",
      error:
        "ERP credentials missing for this shop. Link an ErpnextInstance (base URL, API key, API secret) to the shop location in Cosmo settings.",
    };
  }

  if (input.rows.length === 0) {
    return {
      ok: false,
      method,
      company: input.company,
      postingDate,
      erpUrl,
      summary: null,
      rows: [],
      rawMessage: null,
      code: "NO_ROWS",
      error: "No rows to send to ERP",
    };
  }

  const rows_json = JSON.stringify(
    input.rows.map((r) => ({
      idx_no: r.idx_no,
      sales_invoice: r.sales_invoice,
      cash: r.cash,
      card: r.card,
      card_last_4: r.card_last_4 ?? null,
      koko: r.koko,
      bank_transfer: r.bank_transfer,
    })),
  );

  const body = new URLSearchParams({
    rows_json,
    company: input.company,
    posting_date: postingDate,
  });

  let res: Response;
  try {
    res = await fetch(erpUrl!, {
      method: "POST",
      headers: {
        Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      method,
      company: input.company,
      postingDate,
      erpUrl,
      summary: null,
      rows: [],
      rawMessage: null,
      code: "NETWORK",
      error: `Could not reach ERP at ${erpUrl}: ${detail}`,
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
    const code = classifyErpFailure(res.status, msg);
    const hint =
      code === "ERP_METHOD_MISSING"
        ? ` Create Server Script (API) with api_method="${method}" and paste ss9_verify_book_note.py.`
        : "";
    return {
      ok: false,
      method,
      company: input.company,
      postingDate,
      erpUrl,
      summary: null,
      rows: [],
      rawMessage: parsed,
      code,
      httpStatus: res.status,
      error: `${msg}${hint}`,
    };
  }

  const message =
    typeof parsed === "object" && parsed && "message" in parsed
      ? (parsed as { message: unknown }).message
      : parsed;

  const summary =
    message &&
    typeof message === "object" &&
    "summary" in message &&
    (message as { summary: unknown }).summary &&
    typeof (message as { summary: unknown }).summary === "object"
      ? (message as { summary: BookNoteErpVerifySummary }).summary
      : null;

  const rows =
    message &&
    typeof message === "object" &&
    "rows" in message &&
    Array.isArray((message as { rows: unknown }).rows)
      ? (message as { rows: unknown[] }).rows
      : [];

  // HTTP 200 but unexpected shape — still report clearly
  if (!summary && rows.length === 0) {
    return {
      ok: false,
      method,
      company: input.company,
      postingDate,
      erpUrl,
      summary: null,
      rows: [],
      rawMessage: message,
      code: "ERP_UNKNOWN",
      httpStatus: res.status,
      error:
        "ERP returned 200 but no { rows, summary } from verify_book_note. Check the Server Script sets frappe.response['message'] = { rows, summary }.",
    };
  }

  return {
    ok: true,
    method,
    company: input.company,
    postingDate,
    erpUrl,
    summary,
    rows,
    rawMessage: message,
  };
}
