export type StockPriceMissingGap = "Standard" | "OGF" | "Both";

export function classifyPriceGap(input: {
  hasStandard: boolean;
  hasOgf: boolean;
}): StockPriceMissingGap | null {
  if (input.hasStandard && input.hasOgf) return null;
  if (!input.hasStandard && !input.hasOgf) return "Both";
  if (!input.hasStandard) return "Standard";
  return "OGF";
}
