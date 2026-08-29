import { addDaysYmd } from "@/lib/merchant-dashboard/target-prorate";
import {
  formatAppIsoDate,
  parseAppCalendarDayEnd,
  parseAppCalendarDayStart,
} from "@/lib/format-datetime";

export type PurchaseRecencyBucketKey =
  | "today"
  | "d1_30"
  | "d31_90"
  | "d91_180"
  | "d181_365"
  | "d365_plus"
  | "never";

export const PURCHASE_RECENCY_BUCKET_ORDER: PurchaseRecencyBucketKey[] = [
  "today",
  "d1_30",
  "d31_90",
  "d91_180",
  "d181_365",
  "d365_plus",
  "never",
];

export const PURCHASE_RECENCY_BUCKET_LABELS: Record<PurchaseRecencyBucketKey, string> =
  {
    today: "Today",
    d1_30: "1–30 days",
    d31_90: "31–90 days",
    d91_180: "91–180 days",
    d181_365: "181–365 days",
    d365_plus: "More than 365 days",
    never: "Never purchased",
  };

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = parseAppCalendarDayStart(fromYmd);
  const to = parseAppCalendarDayStart(toYmd);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Calendar days from last purchase to as-of date (inclusive same day = 0). */
export function daysSinceLastPurchaseYmd(
  lastPurchaseAt: Date | string | null | undefined,
  asOfYmd: string
): number | null {
  if (lastPurchaseAt == null || lastPurchaseAt === "") return null;
  const lastYmd = formatAppIsoDate(lastPurchaseAt);
  if (!lastYmd) return null;
  return daysBetweenYmd(lastYmd, asOfYmd);
}

export function classifyPurchaseRecencyBucket(
  lastPurchaseAt: Date | string | null | undefined,
  asOfYmd: string
): PurchaseRecencyBucketKey {
  const days = daysSinceLastPurchaseYmd(lastPurchaseAt, asOfYmd);
  if (days == null) return "never";
  if (days <= 0) return "today";
  if (days <= 30) return "d1_30";
  if (days <= 90) return "d31_90";
  if (days <= 180) return "d91_180";
  if (days <= 365) return "d181_365";
  return "d365_plus";
}

export type LastPurchaseFilterRange = {
  lastPurchaseFrom?: string;
  lastPurchaseTo?: string;
  hasLastPurchase?: boolean;
};

/** Map monitoring bucket + as-of to insight filter query params. */
export function recencyBucketToLastPurchaseRange(
  bucket: PurchaseRecencyBucketKey,
  asOfYmd: string
): LastPurchaseFilterRange {
  if (bucket === "never") {
    return { hasLastPurchase: false };
  }
  if (bucket === "today") {
    return { lastPurchaseFrom: asOfYmd, lastPurchaseTo: asOfYmd };
  }
  if (bucket === "d1_30") {
    return {
      lastPurchaseFrom: addDaysYmd(asOfYmd, -30),
      lastPurchaseTo: addDaysYmd(asOfYmd, -1),
    };
  }
  if (bucket === "d31_90") {
    return {
      lastPurchaseFrom: addDaysYmd(asOfYmd, -90),
      lastPurchaseTo: addDaysYmd(asOfYmd, -31),
    };
  }
  if (bucket === "d91_180") {
    return {
      lastPurchaseFrom: addDaysYmd(asOfYmd, -180),
      lastPurchaseTo: addDaysYmd(asOfYmd, -91),
    };
  }
  if (bucket === "d181_365") {
    return {
      lastPurchaseFrom: addDaysYmd(asOfYmd, -365),
      lastPurchaseTo: addDaysYmd(asOfYmd, -181),
    };
  }
  return { lastPurchaseTo: addDaysYmd(asOfYmd, -366) };
}

export function matchesInsightLastPurchaseRange(
  lastPurchaseAt: Date | null | undefined,
  input: {
    lastPurchaseFrom?: string;
    lastPurchaseTo?: string;
    hasLastPurchase?: boolean;
  }
): boolean {
  if (input.hasLastPurchase === false) {
    return lastPurchaseAt == null;
  }
  if (input.hasLastPurchase === true && lastPurchaseAt == null) {
    return false;
  }
  const from = input.lastPurchaseFrom?.trim();
  const to = input.lastPurchaseTo?.trim();
  if (!from && !to) return true;
  if (lastPurchaseAt == null) return false;
  const t = lastPurchaseAt.getTime();
  if (from) {
    const start = parseAppCalendarDayStart(from);
    if (start && t < start.getTime()) return false;
  }
  if (to) {
    const end = parseAppCalendarDayEnd(to);
    if (end && t > end.getTime()) return false;
  }
  return true;
}
