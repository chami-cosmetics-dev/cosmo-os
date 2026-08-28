import { extractCityFromAddress, recognizedCity } from "@/lib/customer-insight/city";

function getAddressField(address: unknown, field: string) {
  if (!address || typeof address !== "object") return "";
  const record = address as Record<string, unknown>;
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
}

/** 25 Sri Lanka districts — longest names first for substring matching. */
const SRI_LANKA_DISTRICTS = [
  "Nuwara Eliya",
  "Anuradhapura",
  "Batticaloa",
  "Polonnaruwa",
  "Trincomalee",
  "Kilinochchi",
  "Mullaitivu",
  "Hambantota",
  "Monaragala",
  "Kurunegala",
  "Ratnapura",
  "Puttalam",
  "Kalutara",
  "Gampaha",
  "Colombo",
  "Ampara",
  "Badulla",
  "Kegalle",
  "Mannar",
  "Matale",
  "Matara",
  "Vavuniya",
  "Jaffna",
  "Galle",
  "Kandy",
] as const;

const DISTRICT_ALIASES: Record<string, string> = {
  anuradapura: "Anuradhapura",
  moneragala: "Monaragala",
  monaragala: "Monaragala",
};

/** Known towns/cities → administrative district (when address omits province). */
const CITY_TO_DISTRICT: Record<string, string> = {
  "Sri Jayawardenepura Kotte": "Colombo",
  "Nuwara Eliya": "Nuwara Eliya",
  Anuradhapura: "Anuradhapura",
  Trincomalee: "Trincomalee",
  Batticaloa: "Batticaloa",
  Polonnaruwa: "Polonnaruwa",
  "Tissamaharama": "Hambantota",
  Embilipitiya: "Ratnapura",
  Mahiyanganaya: "Badulla",
  Boralesgamuwa: "Colombo",
  Battaramulla: "Colombo",
  Piliyandala: "Colombo",
  Kiribathgoda: "Gampaha",
  "Mount Lavinia": "Colombo",
  Dehiwala: "Colombo",
  Maharagama: "Colombo",
  Nawalapitiya: "Kandy",
  Katunayake: "Gampaha",
  Minuwangoda: "Gampaha",
  Wennappuwa: "Puttalam",
  Kuliyapitiya: "Kurunegala",
  Bandaragama: "Kalutara",
  Ambalangoda: "Galle",
  Hambantota: "Hambantota",
  Monaragala: "Monaragala",
  Kilinochchi: "Kilinochchi",
  Mullaitivu: "Mullaitivu",
  Kurunegala: "Kurunegala",
  Ratnapura: "Ratnapura",
  Bandarawela: "Badulla",
  Peradeniya: "Kandy",
  Katugastota: "Kandy",
  Kadugannawa: "Kandy",
  Avissawella: "Colombo",
  Homagama: "Colombo",
  Kadawatha: "Gampaha",
  Rajagiriya: "Colombo",
  Nugegoda: "Colombo",
  Moratuwa: "Colombo",
  Panadura: "Kalutara",
  Kalutara: "Kalutara",
  Gampaha: "Gampaha",
  Negombo: "Gampaha",
  Colombo: "Colombo",
  Wattala: "Gampaha",
  Kelaniya: "Gampaha",
  Kaduwela: "Colombo",
  "Ja-Ela": "Gampaha",
  Ragama: "Gampaha",
  Seeduwa: "Gampaha",
  Chilaw: "Puttalam",
  Puttalam: "Puttalam",
  Vavuniya: "Vavuniya",
  Mannar: "Mannar",
  Jaffna: "Jaffna",
  Ampara: "Ampara",
  Badulla: "Badulla",
  Wellawaya: "Monaragala",
  Haputale: "Badulla",
  Welimada: "Badulla",
  Gampola: "Kandy",
  Dambulla: "Matale",
  Matale: "Matale",
  Kegalle: "Kegalle",
  Matara: "Matara",
  Galle: "Galle",
  Kandy: "Kandy",
  Horana: "Kalutara",
  Wadduwa: "Kalutara",
  Beruwala: "Kalutara",
  Bentota: "Galle",
  Hikkaduwa: "Galle",
  Weligama: "Matara",
  Tangalle: "Hambantota",
  Deniyaya: "Matara",
  Ahangama: "Galle",
  Aluthgama: "Kalutara",
  Ingiriya: "Kalutara",
  Malabe: "Colombo",
  Hatton: "Nuwara Eliya",
  Passara: "Badulla",
  Ella: "Badulla",
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDistrictLabel(value: string): string | null {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const alias = DISTRICT_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  const known = SRI_LANKA_DISTRICTS.find((district) => district.toLowerCase() === trimmed.toLowerCase());
  return known ?? null;
}

export function buildAddressSearchText(address: unknown): string {
  return [
    getAddressField(address, "address1"),
    getAddressField(address, "address2"),
    getAddressField(address, "city"),
    getAddressField(address, "zip"),
  ]
    .filter(Boolean)
    .join(", ");
}

/** Match a Sri Lanka district name inside free-text address. */
export function inferDistrictFromAddressText(text: string | null | undefined): string | null {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const city = extractCityFromAddress(raw);
  if (city && CITY_TO_DISTRICT[city]) return CITY_TO_DISTRICT[city];

  const cityField = recognizedCity(raw);
  if (cityField && CITY_TO_DISTRICT[cityField]) return CITY_TO_DISTRICT[cityField];

  for (const district of SRI_LANKA_DISTRICTS) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(district)}([^a-z0-9]|$)`, "i");
    if (re.test(raw)) return district;
  }

  for (const [alias, district] of Object.entries(DISTRICT_ALIASES)) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`, "i");
    if (re.test(raw)) return district;
  }

  return null;
}

/**
 * Resolve district from a Shopify-style shipping address.
 * Uses explicit province when present; otherwise infers from address text.
 */
export function resolveAddressDistrict(address: unknown): string {
  const province = normalizeDistrictLabel(getAddressField(address, "province"));
  if (province) return province;

  const text = [
    buildAddressSearchText(address),
    getAddressField(address, "province"),
    getAddressField(address, "province_code"),
  ]
    .filter(Boolean)
    .join(", ");

  const inferred = inferDistrictFromAddressText(text);
  if (inferred) return inferred;

  const fromCode = normalizeDistrictLabel(getAddressField(address, "province_code"));
  if (fromCode) return fromCode;

  return getAddressField(address, "province_code");
}
