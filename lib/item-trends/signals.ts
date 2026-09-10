import type { MovementSignalKind } from "@/lib/item-trends/types";

export const MIN_FAST_MOVER_UNITS = 3;
export const MIN_SLOWDOWN_BASELINE_UNITS = 5;
export const SLOWDOWN_DROP_PCT = 25;

const PRIORITY_RANK: Record<string, number> = {
  "Top Priority": 0,
  "Newly Added": 1,
  "Non Priority": 2,
  Discontinue: 3,
};

export function rankPriority(priority: string): number {
  return PRIORITY_RANK[priority] ?? 99;
}

export function classifyMovementSignal(
  unitsCurrent: number,
  unitsPrior: number,
  priority: string,
): MovementSignalKind {
  if (isSlowdown(unitsCurrent, unitsPrior) && priority === "Top Priority") {
    return "slowdown";
  }
  if (unitsCurrent >= MIN_FAST_MOVER_UNITS) {
    if (unitsPrior > 0 && unitsCurrent > unitsPrior * 1.15) return "accelerating";
    return "fast_mover";
  }
  if (unitsPrior >= MIN_FAST_MOVER_UNITS && unitsCurrent < unitsPrior * 0.85) {
    return "stalling";
  }
  return "none";
}

export function classifyNewItemSignal(
  unitsCurrent: number,
  unitsPrior: number,
): MovementSignalKind {
  if (unitsCurrent > unitsPrior && unitsCurrent >= MIN_FAST_MOVER_UNITS) return "accelerating";
  if (unitsPrior >= MIN_FAST_MOVER_UNITS && unitsCurrent <= unitsPrior) return "stalling";
  if (unitsCurrent > 0 && unitsPrior === 0) return "accelerating";
  return "none";
}

export function isSlowdown(unitsCurrent: number, unitsPrior: number): boolean {
  if (unitsPrior < MIN_SLOWDOWN_BASELINE_UNITS) return false;
  const dropPct = ((unitsPrior - unitsCurrent) / unitsPrior) * 100;
  return dropPct >= SLOWDOWN_DROP_PCT;
}

export function classifyRopOverlay(
  unitsCurrent: number,
  unitsPrior: number,
  currentRop: number | null,
  suggestedRop: number,
): "increase" | "hold" | "decrease" {
  if (isSlowdown(unitsCurrent, unitsPrior)) return "decrease";
  if (unitsCurrent > unitsPrior * 1.15 && unitsCurrent >= MIN_FAST_MOVER_UNITS) {
    return "increase";
  }
  if (currentRop != null && suggestedRop > currentRop * 1.1) return "increase";
  return "hold";
}

export { fetchSlowdownAlerts } from "@/lib/item-trends/slowdown";
