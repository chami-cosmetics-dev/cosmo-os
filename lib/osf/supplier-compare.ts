import type { SupplierPurchaseSummary } from "@/lib/osf/erp-purchases";

/** Inclusive calendar-day window for the Recently tag (FR-013). */
export const RECENTLY_DAYS = 30;

export type RankedSupplierOption = SupplierPurchaseSummary & {
  optionRank: number;
  optionLabel: string;
  recently: boolean;
  lastPurchasedFrom: boolean;
};

function toUtcDateOnly(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

function formatUtcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when lastDate is within RECENTLY_DAYS calendar days of asOf (inclusive). */
export function isRecently(
  lastDate: string | null | undefined,
  asOf: Date = new Date(),
): boolean {
  if (!lastDate) return false;
  const purchased = toUtcDateOnly(lastDate);
  if (!purchased) return false;
  const asOfDay = toUtcDateOnly(formatUtcYmd(asOf));
  if (!asOfDay) return false;
  const diffMs = asOfDay.getTime() - purchased.getTime();
  if (diffMs < 0) return false;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return diffDays <= RECENTLY_DAYS;
}

function optionLabelForRank(rank: number): string {
  return rank === 1 ? "Best Option 1" : `Option ${rank}`;
}

/**
 * Sort by best-ever rate ascending (nulls last), then newer lastDate, then displayName.
 * Attach option labels, Recently, and Last purchased from.
 */
export function rankSupplierOptions(
  summaries: SupplierPurchaseSummary[],
  asOf: Date = new Date(),
): RankedSupplierOption[] {
  const sorted = [...summaries].sort((a, b) => {
    const aRate = a.bestEverRate;
    const bRate = b.bestEverRate;
    if (aRate == null && bRate != null) return 1;
    if (aRate != null && bRate == null) return -1;
    if (aRate != null && bRate != null && aRate !== bRate) return aRate - bRate;

    const aDate = a.lastDate ?? "";
    const bDate = b.lastDate ?? "";
    if (aDate !== bDate) return bDate.localeCompare(aDate);

    return a.displayName.localeCompare(b.displayName);
  });

  let newestLastDate: string | null = null;
  for (const s of sorted) {
    if (s.lastDate && (newestLastDate == null || s.lastDate > newestLastDate)) {
      newestLastDate = s.lastDate;
    }
  }

  let lastPurchasedAssigned = false;
  return sorted.map((s, idx) => {
    const optionRank = idx + 1;
    const isLast =
      !lastPurchasedAssigned &&
      newestLastDate != null &&
      s.lastDate === newestLastDate;
    if (isLast) lastPurchasedAssigned = true;
    return {
      ...s,
      optionRank,
      optionLabel: optionLabelForRank(optionRank),
      recently: isRecently(s.lastDate, asOf),
      lastPurchasedFrom: isLast,
    };
  });
}

/**
 * Merge per-ERP-instance supplier maps for one SKU.
 * bestEver = min rate; last purchase = newest lastDate wins.
 */
export function mergeSupplierPurchaseMaps(
  maps: Array<Map<string, SupplierPurchaseSummary>>,
): Map<string, SupplierPurchaseSummary> {
  const out = new Map<string, SupplierPurchaseSummary>();
  for (const map of maps) {
    for (const [key, incoming] of map) {
      const existing = out.get(key);
      if (!existing) {
        out.set(key, { ...incoming });
        continue;
      }
      const merged: SupplierPurchaseSummary = { ...existing };

      if (incoming.bestEverRate != null) {
        if (
          merged.bestEverRate == null ||
          incoming.bestEverRate < merged.bestEverRate ||
          (incoming.bestEverRate === merged.bestEverRate &&
            incoming.bestEverDate != null &&
            (merged.bestEverDate == null || incoming.bestEverDate > merged.bestEverDate))
        ) {
          merged.bestEverRate = incoming.bestEverRate;
          merged.bestEverDate = incoming.bestEverDate;
        }
      }

      if (
        incoming.lastDate != null &&
        (merged.lastDate == null || incoming.lastDate > merged.lastDate)
      ) {
        merged.lastRate = incoming.lastRate;
        merged.lastDate = incoming.lastDate;
        merged.lastQty = incoming.lastQty;
        merged.displayName = incoming.displayName || merged.displayName;
      }

      out.set(key, merged);
    }
  }
  return out;
}
