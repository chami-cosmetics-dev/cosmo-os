export type MovementSignalKind =
  | "fast_mover"
  | "accelerating"
  | "stalling"
  | "slowdown"
  | "none";

export type SignalSource = "rule_based" | "intelligent_analysis";

export type StockPressure = "high_slow" | "low_fast" | "balanced";

export type RopOverlay = "increase" | "hold" | "decrease";

export type GrowthStatus =
  | "growing"
  | "stable"
  | "declining"
  | "emerging"
  | "expansion_candidate";

export type ItemTrendDateRange = {
  fromYmd: string;
  toYmd: string;
  rangeStart: Date;
  rangeEndExclusive: Date;
};

export type ItemTrendKpiSummary = {
  fastMoverCount: number;
  newItemSignalCount: number;
  slowdownCount: number;
  patternHitCount: number;
  topDistrict: string | null;
  totalUnitsTracked: number;
};

export type ItemMovementRow = {
  sku: string;
  title: string | null;
  priority: string;
  brand: string | null;
  commonSkuKey: string;
  commonSkuTitle: string | null;
  variantTitle: string | null;
  unitsCurrent: number;
  unitsPrior: number;
  speedPerDay: number;
  speedChangePct: number | null;
  signal: MovementSignalKind;
  signalSource: SignalSource;
  sparkline: number[];
  marketGapPct?: number | null;
  isCheapestInMarket?: boolean | null;
};

export type DistrictDemandRow = {
  district: string;
  units: number;
  amount: string;
  sharePct: number;
  changePct: number | null;
  growthStatus: GrowthStatus;
};

export type ExpansionOpportunityRow = {
  district: string;
  score: number;
  deliveryUnits: number;
  shopUnits: number;
  growthPct: number | null;
  topSkus: string[];
  nearestStore: string | null;
  reasons: string[];
};

export type OutletChannelKind = "online" | "physical";

export type OutletBalanceRow = {
  sku: string;
  columnKey: string;
  outletName: string;
  channelKind: OutletChannelKind;
  stockQty: number | null;
  unitsInRange: number;
  speedPerDay: number;
  stockPressure: StockPressure;
};

export type TransferCandidate = {
  sku: string;
  sourceColumnKey: string;
  sourceOutletName: string;
  sourceStock: number;
  sourceSpeed: number;
  destColumnKey: string;
  destOutletName: string;
  destStock: number;
  destSpeed: number;
  message: string;
};

export type RopSuggestionRow = {
  sku: string;
  priority: string;
  brand: string | null;
  currentRop: number | null;
  windowSales: number;
  peakMonthSales: number;
  peakMonth: string | null;
  suggestedRop: number;
  overlay: RopOverlay;
  windowLabel: string;
  columnKey: string;
};

export type CoverRow = {
  sku: string;
  title: string | null;
  variantTitle: string | null;
  brand: string | null;
  commonSkuKey: string;
  commonSkuTitle: string | null;
  priority: string;
  columnKey: string;
  outletName: string;
  channelKind: OutletChannelKind;
  unitsInRange: number;
  daysInRange: number;
  avgDaily: number;
  weekNeed: number;
  stockQty: number;
  stockPctOfSale: number | null;
  stockPctOfWeek: number | null;
  coverDays: number | null;
  shouldSend: boolean;
  suggestedSendQty: number;
  isOosInRange: boolean;
  marketGapPct?: number | null;
  isCheapestInMarket?: boolean;
};

export type ItemTrendFilterLocation = {
  columnKey: string;
  label: string;
  channelKind: OutletChannelKind;
  erpnextInstanceId: string | null;
};

export type ItemTrendPageMeta = {
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  scopedLocationId: string | null;
  patternsAvailable: boolean;
  intelligentEngine: "disabled" | "active" | "degraded";
};

export type PatternAnnotation = {
  sku: string;
  dominantDays: number[];
  dominantDayLabels: string[];
  recurring: boolean;
  signalSource: SignalSource;
  /** Units per weekday Sun→Sat for the selected range. */
  weekdayUnits: number[];
  totalUnits: number;
};

export type ItemTrendScope = {
  companyWide: boolean;
  locationId: string | null;
  columnKeys: string[] | null;
};

export type MovementLeaderboardFilters = {
  priority?: string | null;
  limit?: number;
  companyLocationId?: string | null;
  brand?: string | null;
};
