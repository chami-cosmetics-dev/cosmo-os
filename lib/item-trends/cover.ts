export const WEEK_COVER_DAYS = 7;
export const MIN_WEEK_COVER_RATIO = 0.5;

export type CoverMathInput = {
  stockQty: number;
  unitsInRange: number;
  daysInRange: number;
  minCoverRatio?: number;
};

export type CoverMathResult = {
  avgDaily: number;
  weekNeed: number;
  minStock: number;
  coverDays: number | null;
  stockPctOfSale: number | null;
  stockPctOfWeek: number | null;
  shouldSend: boolean;
  suggestedSendQty: number;
  isOosInRange: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeCoverMath(input: CoverMathInput): CoverMathResult {
  const days = input.daysInRange;
  const stock = Number.isFinite(input.stockQty) ? Math.max(0, input.stockQty) : 0;
  const units = Number.isFinite(input.unitsInRange) ? Math.max(0, input.unitsInRange) : 0;
  const ratio = input.minCoverRatio ?? MIN_WEEK_COVER_RATIO;

  if (days <= 0) {
    return {
      avgDaily: 0,
      weekNeed: 0,
      minStock: 0,
      coverDays: null,
      stockPctOfSale: null,
      stockPctOfWeek: null,
      shouldSend: false,
      suggestedSendQty: 0,
      isOosInRange: units > 0 && stock <= 0,
    };
  }

  const avgDaily = units / days;
  const weekNeed = avgDaily * WEEK_COVER_DAYS;
  const minStock = weekNeed * ratio;
  const coverDays = avgDaily > 0 ? stock / avgDaily : null;
  const stockPctOfSale = units > 0 ? (stock / units) * 100 : null;
  const stockPctOfWeek = weekNeed > 0 ? (stock / weekNeed) * 100 : null;
  const shouldSend = weekNeed > 0 && stock < minStock;
  const suggestedSendQty = shouldSend ? Math.ceil(Math.max(0, weekNeed - stock)) : 0;

  return {
    avgDaily: round2(avgDaily),
    weekNeed: round2(weekNeed),
    minStock: round2(minStock),
    coverDays: coverDays == null ? null : round2(coverDays),
    stockPctOfSale: stockPctOfSale == null ? null : round2(stockPctOfSale),
    stockPctOfWeek: stockPctOfWeek == null ? null : round2(stockPctOfWeek),
    shouldSend,
    suggestedSendQty,
    isOosInRange: units > 0 && stock <= 0,
  };
}

export function compareChannelKind(a: "online" | "physical", b: "online" | "physical"): number {
  if (a === b) return 0;
  return a === "online" ? -1 : 1;
}
