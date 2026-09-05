export type MarketGapBadge = {
  label: string;
  tone: "cheapest" | "above" | "below" | "neutral";
};

/**
 * Resolves compact market gap badge styling for tabular lists.
 * Safe for client components (pure UI helper with no server or database imports).
 */
export function resolveMarketGapBadge(
  gapPct: number | null | undefined,
  isCheapest: boolean | null | undefined,
): MarketGapBadge | null {
  if (isCheapest) {
    return { label: "Cheapest", tone: "cheapest" };
  }

  if (gapPct == null || !Number.isFinite(gapPct)) {
    return null;
  }

  if (gapPct > 5) {
    return { label: `+${gapPct}%`, tone: "above" };
  }

  if (gapPct < 0) {
    return { label: `${gapPct}%`, tone: "below" };
  }

  return { label: `+${gapPct}%`, tone: "neutral" };
}
