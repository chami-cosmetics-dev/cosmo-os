import type { PatternAnnotation } from "@/lib/item-trends/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type SkuWeekdayBuckets = Map<string, number[]>;

export function emptyWeekdayBuckets(): number[] {
  return [0, 0, 0, 0, 0, 0, 0];
}

export function dominantWeekdays(buckets: number[], minShare = 0.35): number[] {
  const total = buckets.reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  return buckets
    .map((units, day) => ({ day, units }))
    .filter(({ units }) => units / total >= minShare)
    .sort((a, b) => b.units - a.units)
    .map(({ day }) => day);
}

export function isRecurringWeekdayPattern(
  buckets: number[],
  weeksInRange: number,
): boolean {
  if (weeksInRange < 2) return false;
  const total = buckets.reduce((s, v) => s + v, 0);
  if (total < 6) return false;
  const dominant = dominantWeekdays(buckets, 0.3);
  if (dominant.length === 0) return false;
  const dominantUnits = dominant.reduce((s, d) => s + buckets[d], 0);
  return dominantUnits / total >= 0.45;
}

export function buildPatternAnnotations(
  skuBuckets: SkuWeekdayBuckets,
  weeksInRange: number,
  limit = 20,
): PatternAnnotation[] {
  const rows: PatternAnnotation[] = [];
  for (const [sku, buckets] of skuBuckets) {
    const dominantDays = dominantWeekdays(buckets);
    if (dominantDays.length === 0) continue;
    const recurring = isRecurringWeekdayPattern(buckets, weeksInRange);
    const totalUnits = buckets.reduce((s, v) => s + v, 0);
    rows.push({
      sku,
      dominantDays,
      dominantDayLabels: dominantDays.map((d) => DAY_NAMES[d]),
      recurring,
      signalSource: "rule_based",
      weekdayUnits: [...buckets],
      totalUnits,
    });
  }
  rows.sort((a, b) => b.totalUnits - a.totalUnits || a.sku.localeCompare(b.sku));
  return rows.slice(0, limit);
}
