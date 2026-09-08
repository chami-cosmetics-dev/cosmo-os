/** Company code → physical shop. One display name, not `LWK` beside `OGF`. */
const COMPANY_TO_SHOP: Record<string, string> = {
  lwk: "OGF",
  ogf: "OGF",
  lml: "Pepiliyana",
  lmj: "Pepiliyana",
  pepiliyana: "Pepiliyana",
  mnk: "Cool Planet",
  "cool planet": "Cool Planet",
  ajs: "Kiribathgoda",
  kiribathgoda: "Kiribathgoda",
  dro: "Maharagama",
  maharagama: "Maharagama",
  chami: "GCC",
  gcc: "GCC",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
}

function shopFromCompanyKey(value: string): string | undefined {
  return COMPANY_TO_SHOP[value];
}

/**
 * One warehouse label. Company code becomes the shop:
 * LWK → OGF, LML/LMJ → Pepiliyana, MNK → Cool Planet,
 * AJS → Kiribathgoda, DRO → Maharagama, CHAMI → GCC.
 */
export function displayWarehouseName(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;

  const normalized = normalizeKey(trimmed);
  if (/\bwebsite\b|\bonline\b/.test(normalized)) return trimmed;

  const withoutShop = normalized
    .replace(/\s+shop(\s+warehouse)?(\s*[-:].*)?$/, "")
    .replace(/\s+warehouse$/, "")
    .trim();

  const hyphen = withoutShop.match(/^([a-z0-9]{2,8})\s*-\s*(.+)$/);
  if (hyphen) {
    const fromCode = shopFromCompanyKey(hyphen[1]);
    if (fromCode) return fromCode;
    const fromPlace = shopFromCompanyKey(hyphen[2]);
    if (fromPlace) return fromPlace;
  }

  const direct = shopFromCompanyKey(withoutShop) ?? shopFromCompanyKey(normalized);
  if (direct) return direct;

  if (!/\bmain\b/.test(withoutShop)) {
    const firstToken = withoutShop.split(/[\s-]+/)[0] ?? "";
    const fromToken = shopFromCompanyKey(firstToken);
    if (fromToken) return fromToken;
  }

  const match = trimmed.match(/^[A-Za-z]{2,8}\s*[-–]\s*(.+)$/);
  const place = match?.[1]?.trim();
  return place || trimmed;
}
