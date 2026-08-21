import type {
  MerchantPeerBand,
  PeerBoard,
  PeerBoardEntry,
} from "@/lib/merchant-dashboard/motivation-types";

export type PeerBoardInputRow = {
  merchantId: string;
  displayName: string;
  total: number;
  orderCount: number;
  /** Shown on share/ranked charts; omitted from race rank / podium. */
  excludeFromRace?: boolean;
};

export type BuildPeerBoardOptions = {
  period: "today" | "mtd";
  fromYmd: string;
  toYmd: string;
  viewedMerchantId: string;
  limit?: number;
  /** Extra ids always kept on the board when outside top (e.g. DM-General sales). */
  alwaysIncludeMerchantIds?: string[];
  cheerMessageForBand: (band: MerchantPeerBand, displayName: string) => string;
};

function sharePct(part: number, whole: number): number | null {
  if (!Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function sortBySales(rows: PeerBoardInputRow[]): PeerBoardInputRow[] {
  return [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const nameCmp = a.displayName.localeCompare(b.displayName);
    if (nameCmp !== 0) return nameCmp;
    return a.merchantId.localeCompare(b.merchantId);
  });
}

export function classifyPeerBand(input: {
  cohortSize: number;
  viewedRank: number | null;
  viewedTotal: number;
  leaderTotal: number;
}): MerchantPeerBand {
  const { cohortSize, viewedRank, viewedTotal, leaderTotal } = input;
  if (cohortSize <= 1) return "solo";
  if (viewedTotal <= 0 || viewedRank == null) return "no_sales";
  if (viewedRank === 1) return "leader";
  const gapPct = sharePct(leaderTotal - viewedTotal, leaderTotal);
  if (viewedRank <= 3 || (gapPct != null && gapPct <= 20)) return "chasing";
  if (viewedRank <= Math.ceil(cohortSize / 2)) return "mid";
  return "behind";
}

/**
 * Rank race among real merchants; still emit sales buckets (e.g. DM-General)
 * on the board for cohort share / ranked sales charts.
 */
export function buildPeerBoard(
  rows: PeerBoardInputRow[],
  options: BuildPeerBoardOptions,
): PeerBoard {
  const limit = options.limit ?? 10;

  const raceSorted = sortBySales(rows.filter((row) => !row.excludeFromRace));
  const raceRanked = raceSorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
  const raceRankById = new Map(
    raceRanked.map((row) => [row.merchantId, row.rank]),
  );

  const viewed = raceRanked.find(
    (row) => row.merchantId === options.viewedMerchantId,
  );
  const viewedRank = viewed?.rank ?? null;
  const viewedTotal = viewed?.total ?? 0;
  const viewedName = viewed?.displayName ?? "Merchant";
  const leaderTotal = raceRanked[0]?.total ?? 0;
  const gapToLeader = Math.max(0, leaderTotal - viewedTotal);

  const peerBand = classifyPeerBand({
    cohortSize: raceRanked.length,
    viewedRank,
    viewedTotal,
    leaderTotal,
  });

  const displaySorted = sortBySales(rows);
  const top = displaySorted.slice(0, limit);
  const toEntry = (row: PeerBoardInputRow, rank: number): PeerBoardEntry => ({
    rank,
    merchantId: row.merchantId,
    displayName: row.displayName,
    total: row.total,
    orderCount: row.orderCount,
    isViewed: row.merchantId === options.viewedMerchantId,
    excludeFromRace: row.excludeFromRace === true,
  });

  const entries: PeerBoardEntry[] = top.map((row) =>
    toEntry(row, raceRankById.get(row.merchantId) ?? 0),
  );

  const ensureOnBoard = (merchantId: string) => {
    if (entries.some((entry) => entry.merchantId === merchantId)) return;
    const row = displaySorted.find((r) => r.merchantId === merchantId);
    if (!row) return;
    entries.push(toEntry(row, raceRankById.get(row.merchantId) ?? 0));
  };

  ensureOnBoard(options.viewedMerchantId);
  for (const id of options.alwaysIncludeMerchantIds ?? []) {
    ensureOnBoard(id);
  }

  return {
    period: options.period,
    fromYmd: options.fromYmd,
    toYmd: options.toYmd,
    viewedRank,
    viewedTotal,
    leaderTotal,
    gapToLeader,
    peerBand,
    cheerMessage: options.cheerMessageForBand(peerBand, viewedName),
    entries,
  };
}
