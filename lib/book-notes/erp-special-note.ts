import { getErpConfig } from "@/lib/erpnext-sync";
import { extractErpErrorMessage } from "@/lib/book-notes/erp-verify";
import { LIMITS } from "@/lib/validation";
import type { ErpnextInstance } from "@prisma/client";

/** ERP Server Script API for bank_recon_set_book_note_special_note (override via env). */
export function getBookNoteSpecialNoteMethod(): string {
  return (
    process.env.ERPNEXT_BOOK_NOTE_SPECIAL_NOTE_METHOD?.trim() ||
    "bank_recon_set_book_note_special_note"
  );
}

export type BookNoteSpecialNoteResult = {
  ok: boolean;
  method: string;
  bookNoteId: string;
  idxNo: string;
  specialNote: string;
  rowsUpdated?: number;
  erpUrl?: string;
  error?: string;
  httpStatus?: number;
  rawMessage?: unknown;
};

/**
 * Attach or clear a special note on one ERP book-note row.
 * Must run AFTER verify_book_note so the idx_no row already exists.
 * Pass specialNote "" to clear. Invoice typo resubmits recreate blank ERP
 * rows — Cosmo must call this again for each idx_no that still has a note.
 */
export async function setBookNoteSpecialNoteOnErp(input: {
  erpnextInstance: ErpnextInstance | null;
  /** Cosmo BookNoteDay.id — same id sent as book_note_id on verify. */
  bookNoteId: string;
  idxNo: string;
  specialNote: string;
  /** Audit/log only on ERP. */
  company?: string;
}): Promise<BookNoteSpecialNoteResult> {
  const method = getBookNoteSpecialNoteMethod();
  const bookNoteId = input.bookNoteId.trim();
  const idxNo = input.idxNo.trim();
  const specialNote = input.specialNote.slice(
    0,
    LIMITS.bookNoteSpecialNote.max,
  );
  const cfg = getErpConfig(input.erpnextInstance);
  const base = cfg.baseUrl.replace(/\/$/, "");
  const erpUrl = base ? `${base}/api/method/${method}` : undefined;

  if (!bookNoteId) {
    return {
      ok: false,
      method,
      bookNoteId,
      idxNo,
      specialNote,
      erpUrl,
      error: "book_note_id is required",
    };
  }
  if (!idxNo) {
    return {
      ok: false,
      method,
      bookNoteId,
      idxNo,
      specialNote,
      erpUrl,
      error: "idx_no is required",
    };
  }
  if (input.specialNote.length > LIMITS.bookNoteSpecialNote.max) {
    return {
      ok: false,
      method,
      bookNoteId,
      idxNo,
      specialNote,
      erpUrl,
      error: "special_note exceeds 1500 character limit",
    };
  }
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    return {
      ok: false,
      method,
      bookNoteId,
      idxNo,
      specialNote,
      erpUrl,
      error:
        "ERP credentials missing for this shop. Link an ErpnextInstance before sending special notes.",
    };
  }

  const body = new URLSearchParams({
    book_note_id: bookNoteId,
    idx_no: idxNo,
    special_note: specialNote,
  });
  const company = input.company?.trim();
  if (company) body.set("company", company);

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
      bookNoteId,
      idxNo,
      specialNote,
      erpUrl,
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
    return {
      ok: false,
      method,
      bookNoteId,
      idxNo,
      specialNote,
      erpUrl,
      httpStatus: res.status,
      rawMessage: parsed,
      error: msg,
    };
  }

  const message =
    typeof parsed === "object" && parsed && "message" in parsed
      ? (parsed as { message: unknown }).message
      : parsed;
  const rec =
    message && typeof message === "object" && !Array.isArray(message)
      ? (message as Record<string, unknown>)
      : null;
  const rowsUpdated =
    typeof rec?.rows_updated === "number" ? rec.rows_updated : undefined;

  return {
    ok: true,
    method,
    bookNoteId,
    idxNo,
    specialNote,
    rowsUpdated,
    erpUrl,
    rawMessage: message,
  };
}

export type PushBookNoteSpecialNotesResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

/**
 * After verify succeeds, attach Cosmo special notes onto ERP rows.
 * Posts every non-empty note. Re-posts on every Send to ERP so invoice-typo
 * resubmits (ERP recreates blank rows) get notes back. Blank Cosmo notes are
 * skipped; deleting the invoice row drops the ERP row (and its note) on verify.
 */
export async function pushBookNoteSpecialNotesToErp(input: {
  erpnextInstance: ErpnextInstance | null;
  bookNoteId: string;
  company: string;
  rows: Array<{ idx_no: string; special_note: string | null }>;
}): Promise<PushBookNoteSpecialNotesResult> {
  const targets = input.rows.filter(
    (r) => r.idx_no.trim().length > 0 && (r.special_note ?? "").trim().length > 0,
  );
  if (targets.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  }

  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const row of targets) {
    const result = await setBookNoteSpecialNoteOnErp({
      erpnextInstance: input.erpnextInstance,
      bookNoteId: input.bookNoteId,
      idxNo: row.idx_no,
      specialNote: (row.special_note ?? "").trim(),
      company: input.company,
    });
    if (result.ok) {
      succeeded += 1;
    } else {
      failed += 1;
      errors.push(
        `Row ${row.idx_no}: ${result.error ?? "special note push failed"}`,
      );
    }
  }

  return {
    attempted: targets.length,
    succeeded,
    failed,
    errors,
  };
}
