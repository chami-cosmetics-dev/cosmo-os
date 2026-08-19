import { formatAppIsoDate } from "@/lib/format-datetime";

const OPEN_STATUSES = new Set(["assigned", "accepted", "arrived"]);

export type RiderOpsFilterRow = {
  status: string;
  assignedAt: string;
  completedAt: string | null;
  failedAt: string | null;
};

export function isOpenRiderTaskStatus(status: string): boolean {
  return OPEN_STATUSES.has(status.trim().toLowerCase());
}

/** Colombo calendar day key for a task timestamp. */
export function riderTaskColomboDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const key = formatAppIsoDate(iso, "");
  return key || null;
}

/**
 * FR-003: open tasks always included; completed/failed only when their
 * completedAt/failedAt falls in the inclusive Colombo YYYY-MM-DD range.
 */
export function riderTaskMatchesFr003Filter(
  row: RiderOpsFilterRow,
  fromDate: string | null | undefined,
  toDate: string | null | undefined
): boolean {
  const status = row.status.trim().toLowerCase();
  if (OPEN_STATUSES.has(status)) return true;

  const dateIso =
    status === "failed"
      ? row.failedAt
      : status === "completed"
        ? row.completedAt
        : null;
  const dateKey = riderTaskColomboDateKey(dateIso);
  if (!dateKey) return false;
  if (fromDate && dateKey < fromDate) return false;
  if (toDate && dateKey > toDate) return false;
  return true;
}

export function summarizeRiderTaskStatuses(rows: Array<{ status: string }>) {
  return rows.reduce(
    (acc, row) => {
      const status = row.status.toLowerCase();
      acc.total += 1;
      if (status === "assigned") acc.assigned += 1;
      if (status === "completed") acc.completed += 1;
      if (status === "failed") acc.failed += 1;
      if (status === "accepted" || status === "arrived") acc.inProgress += 1;
      return acc;
    },
    { total: 0, assigned: 0, inProgress: 0, completed: 0, failed: 0 }
  );
}
