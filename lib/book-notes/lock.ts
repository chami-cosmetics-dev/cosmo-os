import { formatAppIsoDate } from "@/lib/format-datetime";

export const DAY_LOCKED_CODE = "DAY_LOCKED" as const;

export type BookNoteWriteAccess = {
  /**
   * Edit/upload past dates (not future).
   * TEMP: also granted via `book_notes.manage` — tighten back to admin-only later.
   */
  canBackdate: boolean;
  /**
   * `book_notes.admin` — see/delete every merchant's sheets and run bulk ERP.
   * Independent of canBackdate so temporary merchant backdate does not open
   * company-wide history.
   */
  canAdminAll?: boolean;
  /**
   * This user created the saved day. Used for delete/ownership, not to unlock
   * past dates.
   */
  isOwner?: boolean;
};

function postingDateTodayYmd(now: Date): string | null {
  return formatAppIsoDate(now);
}

/**
 * With `canBackdate`: today and any past date.
 * Without: today only. Future dates locked for everyone (Asia/Colombo).
 */
export function isBookNoteWritable(
  postingDateYmd: string,
  now: Date = new Date(),
  access: BookNoteWriteAccess = { canBackdate: false },
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDateYmd)) return false;
  const today = postingDateTodayYmd(now);
  if (!today) return false;
  if (postingDateYmd > today) return false;
  if (postingDateYmd === today) return true;
  return access.canBackdate === true;
}

/** True when the current user cannot save this posting date. */
export function isBookNoteDayLocked(
  postingDateYmd: string,
  now: Date = new Date(),
  access: BookNoteWriteAccess = { canBackdate: false },
): boolean {
  return !isBookNoteWritable(postingDateYmd, now, access);
}

/** User-facing lock reason for API errors. */
export function bookNoteLockMessage(
  postingDateYmd: string,
  now: Date = new Date(),
  access: BookNoteWriteAccess = { canBackdate: false },
): string {
  const today = postingDateTodayYmd(now);
  if (today && postingDateYmd > today) {
    return "This sales date is in the future and cannot be saved.";
  }
  if (!access.canBackdate) {
    return "Past dates are locked. Only today can be edited.";
  }
  return "This sales date is locked.";
}
