/** Shared DTO types for merchant dashboard motivation (037). */

export type PeriodSales = {
  total: number;
  orderCount: number;
};

export type TodaySalesDto = PeriodSales & {
  ymd: string;
};

export type MerchantPeerBand =
  | "leader"
  | "chasing"
  | "mid"
  | "behind"
  | "no_sales"
  | "solo";

export type PeerBoardEntry = {
  rank: number;
  merchantId: string;
  displayName: string;
  total: number;
  orderCount: number;
  isViewed: boolean;
};

export type PeerBoard = {
  period: "today" | "mtd";
  fromYmd: string;
  toYmd: string;
  viewedRank: number | null;
  viewedTotal: number;
  leaderTotal: number;
  gapToLeader: number;
  peerBand: MerchantPeerBand;
  cheerMessage: string;
  entries: PeerBoardEntry[];
};

export type LocationPeerRow = {
  merchantId: string;
  displayName: string;
  total: number;
  orderCount: number;
  sharePct: number | null;
};

export type LocationShareRow = {
  locationId: string;
  locationName: string;
  locationTotal: number;
  selfAmount: number;
  selfOrderCount: number;
  selfSharePct: number | null;
  peers: LocationPeerRow[];
};

export type LocationShareBundle = {
  today: LocationShareRow[];
  mtd: LocationShareRow[];
};

export type DailySalesHistoryRow = {
  ymd: string;
  total: number;
  orderCount: number;
};

export type MonthlySalesHistoryStatus =
  | "on_track"
  | "achieved"
  | "missed"
  | "no_target";

export type MonthlySalesHistoryRow = {
  yearMonth: string;
  total: number;
  orderCount: number;
  targetAmount: number | null;
  percent: number | null;
  status: MonthlySalesHistoryStatus;
};

export type SalesHistoryDto = {
  daily: DailySalesHistoryRow[];
  monthly: MonthlySalesHistoryRow[];
};

export type PeerBoardsDto = {
  today: PeerBoard;
  mtd: PeerBoard;
};
