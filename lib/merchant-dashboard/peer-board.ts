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
};

export type BuildPeerBoardOptions = {
  period: "today" | "mtd";
  fromYmd: string;
  toYmd: string;
  viewedMerchantId: string;
  limit?: number;
  cheerMessageForBand: (band: MerchantPeerBand, displayName: string) => string;
};

function sharePct(part: number, whole: number): number | null {
  if (!Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
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
 * Rank full cohort, emit top `limit` rows, always append viewed merchant if outside.
 */
export function buildPeerBoard(
  rows: PeerBoardInputRow[],
  options: BuildPeerBoardOptions,
): PeerBoard {
  const limit = options.limit ?? 10;
  const sorted = [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const nameCmp = a.displayName.localeCompare(b.displayName);
    if (nameCmp !== 0) return nameCmp;
    return a.merchantId.localeCompare(b.merchantId);
  });

  const ranked = sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));

  const viewed = ranked.find((row) => row.merchantId === options.viewedMerchantId);
  const viewedRank = viewed?.rank ?? null;
  const viewedTotal = viewed?.total ?? 0;
  const viewedName = viewed?.displayName ?? "Merchant";
  const leaderTotal = ranked[0]?.total ?? 0;
  const gapToLeader = Math.max(0, leaderTotal - viewedTotal);

  const peerBand = classifyPeerBand({
    cohortSize: ranked.length,
    viewedRank,
    viewedTotal,
    leaderTotal,
  });

  const top = ranked.slice(0, limit);
  const entries: PeerBoardEntry[] = top.map((row) => ({
    rank: row.rank,
    merchantId: row.merchantId,
    displayName: row.displayName,
    total: row.total,
    orderCount: row.orderCount,
    isViewed: row.merchantId === options.viewedMerchantId,
  }));

  if (
    viewed &&
    !entries.some((entry) => entry.merchantId === options.viewedMerchantId)
  ) {
    entries.push({
      rank: viewed.rank,
      merchantId: viewed.merchantId,
      displayName: viewed.displayName,
      total: viewed.total,
      orderCount: viewed.orderCount,
      isViewed: true,
    });
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
