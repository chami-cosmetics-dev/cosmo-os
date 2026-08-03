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
  koko: number;
  bank_transfer: number;
};

export type BookNoteErpVerifySummary = {
  verified_count: number;
  mismatch_count: number;
  not_found_count: number;
  total_rows: number;
};

export type BookNoteErpVerifyResult = {
  ok: boolean;
  method: string;
  company: string;
  summary: BookNoteErpVerifySummary | null;
  rows: unknown[];
  rawMessage: unknown;
  error?: string;
};

/**
 * Push merchant book-note rows to ERP ss9 verify Server Script.
 * Script expects form_dict: rows_json (JSON string) + optional company.
 */
export async function sendBookNoteRowsToErp(input: {
  erpnextInstance: ErpnextInstance | null;
  company: string;
  rows: BookNoteErpVerifyRowInput[];
}): Promise<BookNoteErpVerifyResult> {
  const cfg = getErpConfig(input.erpnextInstance);
  const method = getBookNoteVerifyMethod();

  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    return {
      ok: false,
      method,
      company: input.company,
      summary: null,
      rows: [],
      rawMessage: null,
      error:
        "ERP credentials missing for this outlet (ErpnextInstance baseUrl/apiKey/apiSecret).",
    };
  }

  if (input.rows.length === 0) {
    return {
      ok: false,
      method,
      company: input.company,
      summary: null,
      rows: [],
      rawMessage: null,
      error: "No rows to send to ERP",
    };
  }

  const rows_json = JSON.stringify(
    input.rows.map((r) => ({
      idx_no: r.idx_no,
      sales_invoice: r.sales_invoice,
      cash: r.cash,
      card: r.card,
      koko: r.koko,
      bank_transfer: r.bank_transfer,
    })),
  );

  // form-urlencoded matches Frappe Server Script form_dict usage in ss9
  const body = new URLSearchParams({
    rows_json,
    company: input.company,
  });

  const url = `${cfg.baseUrl.replace(/\/$/, "")}/api/method/${method}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (err) {
    return {
      ok: false,
      method,
      company: input.company,
      summary: null,
      rows: [],
      rawMessage: null,
      error: err instanceof Error ? err.message : "ERP request failed",
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
    const msg =
      typeof parsed === "object" &&
      parsed &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : `ERP HTTP ${res.status}: ${text.slice(0, 300)}`;
    return {
      ok: false,
      method,
      company: input.company,
      summary: null,
      rows: [],
      rawMessage: parsed,
      error: msg,
    };
  }

  // Server Script sets frappe.response["message"] = { rows, summary }
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
      ? ((message as { rows: unknown[] }).rows)
      : [];

  return {
    ok: true,
    method,
    company: input.company,
    summary,
    rows,
    rawMessage: message,
  };
}
