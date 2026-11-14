/**
 * Discontinue movement between two weeks (Stock Health mail 1): which Common SKUs left
 * Discontinue (and to which priority), which joined it, and which joined it with no earlier
 * priority — new or Blank last week — flagged as a system error. Pure (no DB).
 */
import type { StockHealthStatus } from "@/lib/stock-health/config";

export type MovementItem = { commonSku: string; itemName: string | null };

/** Priorities an item can move to / come from (everything except Discontinue). */
export const DISCONTINUE_MOVE_STATUSES = ["Top", "Low", "Newly Added", "Blank"] as const;
type MoveStatus = (typeof DISCONTINUE_MOVE_STATUSES)[number];

/** Priorities a normal move into Discontinue comes from (Blank / new = system error). */
export const DISCONTINUE_FROM_STATUSES = ["Top", "Low", "Newly Added"] as const;
type FromStatus = (typeof DISCONTINUE_FROM_STATUSES)[number];

export type DiscontinueMovement = {
  /** Discontinue last week. */
  previousCount: number;
  /** Discontinue last week, another priority now. */
  movedOut: Record<MoveStatus, MovementItem[]>;
  /** Discontinue last week, not counted now (excluded, draft with no stock, gone from ERP). */
  noLongerCounted: MovementItem[];
  /** Discontinue both weeks. */
  stayed: number;
  /** Discontinue now, Top / Low / Newly Added last week. */
  movedIn: Record<FromStatus, MovementItem[]>;
  /** Discontinue now with no earlier priority: not there last week, or Blank. */
  systemErrors: Array<MovementItem & { lastWeek: "New item" | "Blank" }>;
  /** Discontinue now (= the Weekly Summary's Discontinue count). */
  currentCount: number;
};

export type SkuStatus = { commonSku: string; status: StockHealthStatus; itemName: string | null };

const byCommonSku = (a: MovementItem, b: MovementItem) => a.commonSku.localeCompare(b.commonSku);

export function buildDiscontinueMovement(previous: SkuStatus[], current: SkuStatus[]): DiscontinueMovement {
  const prevBySku = new Map(previous.map((p) => [p.commonSku, p]));
  const currBySku = new Map(current.map((c) => [c.commonSku, c]));
  const movement: DiscontinueMovement = {
    previousCount: 0,
    movedOut: { Top: [], Low: [], "Newly Added": [], Blank: [] },
    noLongerCounted: [],
    stayed: 0,
    movedIn: { Top: [], Low: [], "Newly Added": [] },
    systemErrors: [],
    currentCount: 0,
  };

  for (const prev of previous) {
    if (prev.status !== "Discontinue") continue;
    movement.previousCount += 1;
    const now = currBySku.get(prev.commonSku);
    if (!now) {
      movement.noLongerCounted.push({ commonSku: prev.commonSku, itemName: prev.itemName });
    } else if (now.status === "Discontinue") {
      movement.stayed += 1;
    } else {
      movement.movedOut[now.status].push({ commonSku: now.commonSku, itemName: now.itemName ?? prev.itemName });
    }
  }

  for (const now of current) {
    if (now.status !== "Discontinue") continue;
    movement.currentCount += 1;
    const prev = prevBySku.get(now.commonSku);
    const item = { commonSku: now.commonSku, itemName: now.itemName ?? prev?.itemName ?? null };
    if (!prev) movement.systemErrors.push({ ...item, lastWeek: "New item" });
    else if (prev.status === "Blank") movement.systemErrors.push({ ...item, lastWeek: "Blank" });
    else if (prev.status !== "Discontinue") movement.movedIn[prev.status].push(item);
  }

  for (const list of [
    ...Object.values(movement.movedOut),
    movement.noLongerCounted,
    ...Object.values(movement.movedIn),
    movement.systemErrors,
  ]) {
    list.sort(byCommonSku);
  }
  return movement;
}
