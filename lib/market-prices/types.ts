export type PriceLayer = "mrp" | "promo" | "ogf";

export type PriceLayerSnapshot = {
  mrp: number | null;
  promo: number | null;
  ogf: number | null;
  hasPromo: boolean;
};

export type CompetitorPriceGaps = {
  mrp: number | null;
  promo: number | null;
  ogf: number | null;
};

export type CompetitorPriceSlot = {
  competitorSlug: string;
  competitorName: string;
  linked: boolean;
  linkId: string | null;
  productUrl: string | null;
  competitorTitle: string | null;
  listedPriceLkr: number | null;
  inStock: boolean | null;
  checkDate: string | null;
  stale: boolean;
  notes: string | null;
  gaps: CompetitorPriceGaps;
};

export type PriceHistoryEntry = {
  id?: string;
  linkId: string;
  listedPriceLkr: number;
  inStock?: boolean | null;
  checkDate: string;
  changedAt: string;
};

export type MarketCompareSummaryRow = {
  sku: string;
  title: string | null;
  brand: string | null;
  barcode: string | null;
  priority: string | null;
  prices: PriceLayerSnapshot;
  competitorMin: number | null;
  competitorMax: number | null;
  competitorMedian: number | null;
  competitorCount: number;
  gapPctMrp: number | null;
  gapPctPromo: number | null;
  gapPctOgf: number | null;
  cheapestMrp: boolean;
  cheapestPromo: boolean;
  cheapestOgf: boolean;
  anyStale: boolean;
  latestCheckDate: string | null;
};

export type MarketPriceCompetitorMeta = {
  slug: string;
  name: string;
  websiteDomain: string;
};

export type MarketPricePageMeta = {
  layer: PriceLayer;
  competitors: MarketPriceCompetitorMeta[];
  page: number;
  limit: number;
  total: number;
};

export type MarketPriceSort = "gap_desc" | "gap_asc" | "sku" | "title";

export type MarketPriceFilterKey =
  | "above_market"
  | "cheapest"
  | "stale"
  | "has_links"
  | "untracked";

export type MarketSkuDetailResponse = {
  sku: string;
  title: string | null;
  brand: string | null;
  barcode: string | null;
  priority: string | null;
  prices: PriceLayerSnapshot;
  competitors: CompetitorPriceSlot[];
  history: PriceHistoryEntry[];
};
