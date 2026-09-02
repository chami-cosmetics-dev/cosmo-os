import type { ItemMovementRow } from "@/lib/item-trends/types";

export type IntelligentSignal = {
  sku: string;
  title: string | null;
  reason: string;
  signal: "emerging" | "soft_slowdown";
  signalSource: "intelligent_analysis";
};

function weeklyTotals(dailyUnits: number[], weekSize = 7): number[] {
  const weeks: number[] = [];
  for (let i = 0; i < dailyUnits.length; i += weekSize) {
    weeks.push(dailyUnits.slice(i, i + weekSize).reduce((s, v) => s + v, 0));
  }
  return weeks;
}

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export function computeIntelligentSignals(
  movement: ItemMovementRow[],
  dailyBySku: Map<string, number[]>,
): IntelligentSignal[] {
  const signals: IntelligentSignal[] = [];

  for (const row of movement) {
    const daily = dailyBySku.get(row.sku);
    if (!daily || daily.length < 14) continue;

    const weeks = weeklyTotals(daily);
    if (weeks.length < 3) continue;

    const slope = linearSlope(weeks);
    const avg = weeks.reduce((s, v) => s + v, 0) / weeks.length;
    const std = Math.sqrt(
      weeks.reduce((s, v) => s + (v - avg) ** 2, 0) / Math.max(1, weeks.length - 1),
    );

    if (slope > 0 && avg >= 2 && slope > std * 0.5 && row.signal === "none") {
      signals.push({
        sku: row.sku,
        title: row.title,
        reason: `14-day slope +${slope.toFixed(2)} units/week vs baseline`,
        signal: "emerging",
        signalSource: "intelligent_analysis",
      });
      continue;
    }

    const recent7 = daily.slice(-7).reduce((s, v) => s + v, 0) / 7;
    const prior28 = daily.slice(-35, -7).reduce((s, v) => s + v, 0) / 28;
    if (prior28 >= 0.2 && recent7 < prior28 * 0.8 && row.signal !== "slowdown") {
      signals.push({
        sku: row.sku,
        title: row.title,
        reason: `7-day EMA ${recent7.toFixed(1)}/day vs 28-day ${prior28.toFixed(1)}/day`,
        signal: "soft_slowdown",
        signalSource: "intelligent_analysis",
      });
    }
  }

  return signals.slice(0, 15);
}

export function mergeIntelligentMovement(
  movement: ItemMovementRow[],
  intelligent: IntelligentSignal[],
): ItemMovementRow[] {
  const bySku = new Map(intelligent.map((s) => [s.sku, s]));
  return movement.map((row) => {
    const intel = bySku.get(row.sku);
    if (!intel || row.signal !== "none") return row;
    return {
      ...row,
      signal: intel.signal === "emerging" ? "accelerating" : row.signal,
      signalSource: "intelligent_analysis" as const,
    };
  });
}
