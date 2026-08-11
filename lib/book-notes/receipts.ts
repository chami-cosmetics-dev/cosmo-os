import { put, del } from "@vercel/blob";
import type { ErpnextInstance } from "@prisma/client";

import { getErpConfig } from "@/lib/erpnext-sync";
import { postingDateToUtcMidnight } from "@/lib/book-notes/serialize";
import { serializeBookNoteReceipt } from "@/lib/book-notes/serialize";
import type { BookNoteReceiptDto } from "@/lib/book-notes/types";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";

export const BOOK_NOTE_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export function isAllowedBookNoteReceiptMime(mime: string): boolean {
  return (BOOK_NOTE_RECEIPT_MIME_TYPES as readonly string[]).includes(mime);
}

/** Unique Book Note Entry docnames returned by ss9 verify. */
export function collectBookNoteNamesFromVerifyRows(rows: unknown[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const name = (row as { book_note_name?: unknown }).book_note_name;
    if (typeof name === "string" && name.trim()) {
      names.add(name.trim());
    }
  }
  return [...names];
}

async function fetchBlobBytes(blobUrl: string): Promise<Buffer> {
  const blobRes = await fetch(
    blobUrl,
    process.env.BLOB_READ_WRITE_TOKEN
      ? {
          headers: {
            Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          },
        }
      : undefined,
  );
  if (!blobRes.ok) {
    throw new Error(`Failed to read receipt blob (HTTP ${blobRes.status})`);
  }
  return Buffer.from(await blobRes.arrayBuffer());
}

/**
 * Attach a private file to an ERP Book Note Entry via native upload_file.
 * Matches ss5 filter: attached_to_doctype=Book Note Entry, is_private=1.
 */
export async function uploadReceiptToErpBookNote(input: {
  erpnextInstance: ErpnextInstance | null;
  bookNoteName: string;
  fileName: string;
  mimeType: string | null;
  bytes: Buffer;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = getErpConfig(input.erpnextInstance);
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.apiSecret) {
    return { ok: false, error: "ERP credentials missing" };
  }

  const url = `${cfg.baseUrl.replace(/\/$/, "")}/api/method/upload_file`;
  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.bytes)], {
    type: input.mimeType || "application/octet-stream",
  });
  form.append("file", blob, input.fileName);
  form.append("is_private", "1");
  form.append("doctype", "Book Note Entry");
  form.append("docname", input.bookNoteName);
  form.append("folder", "Home");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      },
      body: form,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not reach ERP upload_file: ${detail}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `ERP upload_file HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`,
    };
  }

  return { ok: true };
}

export type BookNoteReceiptPushSummary = {
  receiptCount: number;
  bookNoteCount: number;
  uploaded: number;
  failed: number;
  errors: string[];
};

/**
 * Push Cosmo day receipts to every Book Note Entry docname from verify.
 * Same photo set attaches to each entry so any PE INFO panel can show them.
 */
export async function pushDayReceiptsToErp(input: {
  erpnextInstance: ErpnextInstance | null;
  bookNoteNames: string[];
  receipts: Array<{
    id: string;
    fileName: string;
    mimeType: string | null;
    blobUrl: string;
  }>;
}): Promise<BookNoteReceiptPushSummary> {
  const summary: BookNoteReceiptPushSummary = {
    receiptCount: input.receipts.length,
    bookNoteCount: input.bookNoteNames.length,
    uploaded: 0,
    failed: 0,
    errors: [],
  };

  if (input.receipts.length === 0 || input.bookNoteNames.length === 0) {
    return summary;
  }

  const prepared: Array<{
    fileName: string;
    mimeType: string | null;
    bytes: Buffer;
  }> = [];

  for (const receipt of input.receipts) {
    try {
      const bytes = await fetchBlobBytes(receipt.blobUrl);
      // Stable Cosmo id in filename helps finance spot resends vs new slips.
      const safeBase = receipt.fileName.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 80);
      prepared.push({
        fileName: `cosmo-${receipt.id.slice(-8)}-${safeBase}`,
        mimeType: receipt.mimeType,
        bytes,
      });
    } catch (err) {
      summary.failed += 1;
      summary.errors.push(
        err instanceof Error ? err.message : `Failed to read ${receipt.fileName}`,
      );
    }
  }

  for (const bookNoteName of input.bookNoteNames) {
    for (const file of prepared) {
      const result = await uploadReceiptToErpBookNote({
        erpnextInstance: input.erpnextInstance,
        bookNoteName,
        fileName: file.fileName,
        mimeType: file.mimeType,
        bytes: file.bytes,
      });
      if (result.ok) {
        summary.uploaded += 1;
      } else {
        summary.failed += 1;
        summary.errors.push(`${bookNoteName}: ${result.error}`);
      }
    }
  }

  return summary;
}

/** Ensure BookNoteDay exists (empty rows ok) so receipts can attach before first ledger save. */
export async function ensureBookNoteDay(input: {
  companyId: string;
  companyLocationId: string;
  postingDateYmd: string;
  userId: string;
}): Promise<{ id: string }> {
  const postingDate = postingDateToUtcMidnight(input.postingDateYmd);
  const day = await prisma.bookNoteDay.upsert({
    where: {
      companyLocationId_postingDate: {
        companyLocationId: input.companyLocationId,
        postingDate,
      },
    },
    create: {
      companyId: input.companyId,
      companyLocationId: input.companyLocationId,
      postingDate,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
    },
    update: {
      updatedByUserId: input.userId,
    },
    select: { id: true },
  });
  return day;
}

export async function addBookNoteReceipt(input: {
  bookNoteDayId: string;
  file: File;
}): Promise<BookNoteReceiptDto> {
  const existingCount = await prisma.bookNoteReceipt.count({
    where: { bookNoteDayId: input.bookNoteDayId },
  });
  if (existingCount >= LIMITS.bookNoteReceiptsMax) {
    throw new Error(
      `Maximum ${LIMITS.bookNoteReceiptsMax} receipt images per day`,
    );
  }

  const mime = input.file.type || "application/octet-stream";
  if (!isAllowedBookNoteReceiptMime(mime)) {
    throw new Error("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
  }
  if (input.file.size > LIMITS.bookNoteReceiptMaxBytes) {
    throw new Error(
      `File too large. Maximum size is ${Math.round(LIMITS.bookNoteReceiptMaxBytes / (1024 * 1024))}MB`,
    );
  }

  const blob = await put(
    `book-notes/${input.bookNoteDayId}/${Date.now()}-${input.file.name}`,
    input.file,
    {
      access: "private",
      addRandomSuffix: true,
    },
  );

  const receipt = await prisma.bookNoteReceipt.create({
    data: {
      bookNoteDayId: input.bookNoteDayId,
      fileName: input.file.name.slice(0, 200),
      blobUrl: blob.url,
      fileSize: input.file.size,
      mimeType: mime,
      sortOrder: existingCount,
    },
  });

  return serializeBookNoteReceipt(receipt);
}

export async function deleteBookNoteReceipt(input: {
  companyId: string;
  receiptId: string;
}): Promise<boolean> {
  const receipt = await prisma.bookNoteReceipt.findFirst({
    where: {
      id: input.receiptId,
      bookNoteDay: { companyId: input.companyId },
    },
    select: {
      id: true,
      blobUrl: true,
      bookNoteDayId: true,
    },
  });
  if (!receipt) return false;

  await prisma.bookNoteReceipt.delete({ where: { id: receipt.id } });
  try {
    await del(receipt.blobUrl);
  } catch {
    // DB row is source of truth; blob may already be gone.
  }
  return true;
}

export async function loadReceiptsForDay(input: {
  companyId: string;
  companyLocationId: string;
  postingDateYmd: string;
}): Promise<
  Array<{
    id: string;
    fileName: string;
    mimeType: string | null;
    blobUrl: string;
  }>
> {
  const postingDate = postingDateToUtcMidnight(input.postingDateYmd);
  const day = await prisma.bookNoteDay.findFirst({
    where: {
      companyId: input.companyId,
      companyLocationId: input.companyLocationId,
      postingDate,
    },
    select: {
      receipts: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          blobUrl: true,
        },
      },
    },
  });
  return day?.receipts ?? [];
}
