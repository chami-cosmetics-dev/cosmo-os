import { formatAppIsoDate } from "@/lib/format-datetime";
import { addUtcDays } from "@/lib/osf/assist-window";

/** Yesterday YYYY-MM-DD in Asia/Colombo. */
export function yesterdaySnapshotDate(now = new Date()): string {
  return addUtcDays(formatAppIsoDate(now), -1);
}
