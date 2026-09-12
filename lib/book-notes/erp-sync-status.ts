import { prisma } from "@/lib/prisma";

const ERROR_MAX = 500;

function clampError(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= ERROR_MAX) return trimmed;
  return `${trimmed.slice(0, ERROR_MAX - 1)}…`;
}

/** Mark a sheet as successfully pushed to ERP. */
export async function markBookNoteErpSynced(bookNoteDayId: string): Promise<void> {
  await prisma.bookNoteDay.update({
    where: { id: bookNoteDayId },
    data: {
      erpSyncedAt: new Date(),
      erpSyncFailedAt: null,
      erpSyncError: null,
    },
  });
}

/** Mark a sheet as failed on ERP push (keeps last success cleared). */
export async function markBookNoteErpSyncFailed(
  bookNoteDayId: string,
  errorMessage: string,
): Promise<void> {
  await prisma.bookNoteDay.update({
    where: { id: bookNoteDayId },
    data: {
      erpSyncedAt: null,
      erpSyncFailedAt: new Date(),
      erpSyncError: clampError(errorMessage || "ERP sync failed"),
    },
  });
}

/**
 * After Cosmo rows change, clear ERP status so the sheet shows as needing
 * sync again (admin bulk "unsynced" / merchant resend).
 */
export async function clearBookNoteErpSyncStatus(
  bookNoteDayId: string,
): Promise<void> {
  await prisma.bookNoteDay.update({
    where: { id: bookNoteDayId },
    data: {
      erpSyncedAt: null,
      erpSyncFailedAt: null,
      erpSyncError: null,
    },
  });
}

export type BookNoteErpSyncStatus = "synced" | "failed" | "pending";

export function bookNoteErpSyncStatus(day: {
  erpSyncedAt: Date | string | null;
  erpSyncFailedAt: Date | string | null;
}): BookNoteErpSyncStatus {
  if (day.erpSyncedAt) return "synced";
  if (day.erpSyncFailedAt) return "failed";
  return "pending";
}
