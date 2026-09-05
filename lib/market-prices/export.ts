import { escapeCsvCell } from "@/lib/reports/csv";
import type { MarketCompareSummaryRow } from "./types";

export const EXPORT_CSV_HEADER =
  "sku,title,brand,mrp,promo,ogf,competitor_median,gap_mrp_pct,gap_promo_pct,gap_ogf_pct,competitor_count,latest_check_date,any_stale\n";

export function formatMarketCompareCsvRows(rows: MarketCompareSummaryRow[]): string {
  const lines = rows.map((r) => {
    return [
      escapeCsvCell(r.sku),
      escapeCsvCell(r.title ?? ""),
      escapeCsvCell(r.brand ?? ""),
      escapeCsvCell(r.prices.mrp != null ? String(r.prices.mrp) : ""),
      escapeCsvCell(r.prices.promo != null ? String(r.prices.promo) : ""),
      escapeCsvCell(r.prices.ogf != null ? String(r.prices.ogf) : ""),
      escapeCsvCell(r.competitorMedian != null ? String(r.competitorMedian) : ""),
      escapeCsvCell(r.gapPctMrp != null ? String(r.gapPctMrp) : ""),
      escapeCsvCell(r.gapPctPromo != null ? String(r.gapPctPromo) : ""),
      escapeCsvCell(r.gapPctOgf != null ? String(r.gapPctOgf) : ""),
      escapeCsvCell(String(r.competitorCount)),
      escapeCsvCell(r.latestCheckDate ?? ""),
      escapeCsvCell(r.anyStale ? "yes" : "no"),
    ].join(",");
  });

  return EXPORT_CSV_HEADER + lines.join("\n");
}
