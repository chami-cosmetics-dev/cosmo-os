const TRAILING_ORIGIN_PATTERN =
  /\b(?:made\s+in\s+)?(?:sri\s+lanka|korea|south\s+korea|japan|china|india|usa|u\.s\.a\.|uk|u\.k\.|france|germany|italy|spain|thailand|taiwan|canada|australia|turkey|poland)\b\.?$/i;

const SIZE_TOKEN_PATTERN =
  /\b\d+(?:\.\d+)?\s*(?:ml|l|mg|g|kg|oz|fl\s*oz|gram|grams|capsules?|tabs?|tablets?|sachets?|sheets?|pcs?|pieces?|pack|packs)\b/gi;

const MULTIPACK_PATTERN = /\b\d+\s*[xX]\s*\d+(?:\.\d+)?\s*(?:ml|g|mg|kg|oz|pcs?|pieces?)?\b/gi;

function tidyFamilyName(value: string) {
  return value
    .replace(/\s*[-|/]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getProductFamilyName(productTitle: string | null | undefined) {
  let name = String(productTitle ?? "").trim();
  if (!name) return "Unassigned";

  name = name
    .replace(MULTIPACK_PATTERN, " ")
    .replace(SIZE_TOKEN_PATTERN, " ")
    .replace(/\((?:\s|[-|/]|made\s+in|sri\s+lanka|korea|south\s+korea|japan|china|india|usa|u\.s\.a\.|uk|u\.k\.|france|germany|italy|spain|thailand|taiwan|canada|australia|turkey|poland)+\)$/gi, " ");

  let previous = "";
  while (previous !== name) {
    previous = name;
    name = tidyFamilyName(name.replace(TRAILING_ORIGIN_PATTERN, ""));
  }

  return tidyFamilyName(name) || String(productTitle ?? "").trim() || "Unassigned";
}
