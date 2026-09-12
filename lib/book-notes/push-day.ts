import {
  companyLabelForLocation,
  shopLabelForLocation,
} from "@/lib/book-notes/serialize";
import { sendBookNoteRowsToErp } from "@/lib/book-notes/erp-verify";
import {
  markBookNoteErpSynced,
  markBookNoteErpSyncFailed,
} from "@/lib/book-notes/erp-sync-status";
import { loadBookNoteDayDto } from "@/lib/book-notes/load";
import { bookNoteRowUsesSplitPayload } from "@/lib/book-notes/split-lines";
import {
  collectBookNoteNamesFromVerifyRows,
  loadReceiptsForDay,
  pushDayReceiptsToErp,
} from "@/lib/book-notes/receipts";
import { prisma } from "@/lib/prisma";
import type { BookNoteErpVerifyResult } from "@/lib/book-notes/erp-verify";

export type PushBookNoteDayFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
  step: string;
  locationName?: string;
  postingDate?: string;
  method?: string;
  company?: string;
  erpUrl?: string;
  httpStatus?: number;
  raw?: unknown;
  rowCount?: number;
};

export type PushBookNoteDaySuccess = {
  ok: true;
  bookNoteDayId: string;
  postingDate: string;
  locationName: string;
  method: string;
  company: string;
  erpUrl?: string;
  summary: BookNoteErpVerifyResult["summary"];
  rows: unknown[];
  receiptUpload: {
    receiptCount: number;
    bookNoteCount: number;
    uploaded: number;
    failed: number;
    errors: string[];
  } | null;
};

export type PushBookNoteDayResult =
  | PushBookNoteDaySuccess
  | PushBookNoteDayFailure;

/**
 * Load a saved sheet and push it to ERP ss9 verify (+ receipts).
 * Records erpSyncedAt / erpSyncFailedAt on the day.
 */
export async function pushBookNoteDayToErp(input: {
  companyId: string;
  companyLocationId: string;
  postingDateYmd: string;
  bookNoteDayId: string;
}): Promise<PushBookNoteDayResult> {
  const location = await prisma.companyLocation.findFirst({
    where: { id: input.companyLocationId, companyId: input.companyId },
    select: {
      id: true,
      name: true,
      shortName: true,
      erpnextCompany: true,
      erpnextInstance: true,
    },
  });
  if (!location) {
    return {
      ok: false,
      status: 404,
      code: "LOCATION_NOT_FOUND",
      error: `Shop not found for id ${input.companyLocationId}`,
      step: "load_location",
      postingDate: input.postingDateYmd,
    };
  }

  const shopLabel = shopLabelForLocation(location);

  if (!location.erpnextInstance) {
    const err = `Shop "${shopLabel}" has no ErpnextInstance linked. Link ERP credentials on this shop before Send to ERP.`;
    await markBookNoteErpSyncFailed(input.bookNoteDayId, err).catch(() => {});
    return {
      ok: false,
      status: 400,
      code: "ERP_INSTANCE_MISSING",
      error: err,
      step: "load_location",
      locationName: shopLabel,
      postingDate: input.postingDateYmd,
    };
  }

  const day = await loadBookNoteDayDto({
    companyId: input.companyId,
    companyLocationId: input.companyLocationId,
    postingDateYmd: input.postingDateYmd,
    bookNoteDayId: input.bookNoteDayId,
  });

  if (!day || day.rows.length === 0) {
    const err = `No saved rows for shop "${shopLabel}" on ${input.postingDateYmd}. Save invoice lines first.`;
    await markBookNoteErpSyncFailed(input.bookNoteDayId, err).catch(() => {});
    return {
      ok: false,
      status: 400,
      code: "NO_SAVED_ROWS",
      error: err,
      step: "load_day",
      locationName: shopLabel,
      postingDate: input.postingDateYmd,
    };
  }

  for (const r of day.rows) {
    if (bookNoteRowUsesSplitPayload(r.split_lines)) continue;
    if (r.card > 0 && !r.card_receipt_ref_last4) {
      const err = `Row ${r.idx_no || "?"} (${r.sales_invoice || "no invoice"}): card amount entered but card receipt last 4 digits missing. Open the day, fill Last 4 ref, save, then send again.`;
      await markBookNoteErpSyncFailed(input.bookNoteDayId, err);
      return {
        ok: false,
        status: 400,
        code: "CARD_REF_MISSING",
        error: err,
        step: "validate",
        locationName: shopLabel,
        postingDate: input.postingDateYmd,
      };
    }
  }

  const company = companyLabelForLocation(location);
  const result = await sendBookNoteRowsToErp({
    erpnextInstance: location.erpnextInstance,
    bookNoteId: day.id,
    company,
    postingDate: input.postingDateYmd,
    rows: day.rows.map((r) => ({
      idx_no: r.idx_no,
      sales_invoice: r.sales_invoice,
      cash: r.cash,
      card: r.card,
      card_last_4: r.card_receipt_ref_last4,
      koko: r.koko,
      bank_transfer: r.bank_transfer,
      split_lines: r.split_lines,
    })),
  });

  if (!result.ok) {
    const err = result.error ?? "ERP verify failed";
    await markBookNoteErpSyncFailed(input.bookNoteDayId, err);
    return {
      ok: false,
      status: 502,
      code: result.code ?? "ERP_UNKNOWN",
      error: err,
      step: "erp_call",
      method: result.method,
      company: result.company,
      erpUrl: result.erpUrl,
      httpStatus: result.httpStatus,
      locationName: shopLabel,
      postingDate: input.postingDateYmd,
      rowCount: day.rows.length,
      raw: result.rawMessage,
    };
  }

  const bookNoteNames = collectBookNoteNamesFromVerifyRows(result.rows);
  const receipts = await loadReceiptsForDay({
    companyId: input.companyId,
    companyLocationId: input.companyLocationId,
    postingDateYmd: input.postingDateYmd,
    bookNoteDayId: input.bookNoteDayId,
  });
  let receiptUpload: PushBookNoteDaySuccess["receiptUpload"] = null;
  if (receipts.length > 0 && bookNoteNames.length > 0) {
    receiptUpload = await pushDayReceiptsToErp({
      erpnextInstance: location.erpnextInstance,
      bookNoteNames,
      receipts,
    });
  } else if (receipts.length > 0 && bookNoteNames.length === 0) {
    receiptUpload = {
      receiptCount: receipts.length,
      bookNoteCount: 0,
      uploaded: 0,
      failed: 0,
      errors: [
        "Receipts saved in Cosmo but ERP returned no book_note_name — deploy updated ss9_verify_book_note.py",
      ],
    };
  }

  await markBookNoteErpSynced(input.bookNoteDayId);

  return {
    ok: true,
    bookNoteDayId: day.id,
    postingDate: input.postingDateYmd,
    locationName: shopLabel,
    method: result.method,
    company: result.company,
    erpUrl: result.erpUrl,
    summary: result.summary,
    rows: result.rows,
    receiptUpload,
  };
}
