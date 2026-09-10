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
  kegalla: "Kegalle",
};

/** Known towns/cities → administrative district (when address omits province). */
const CITY_TO_DISTRICT: Record<string, string> = {
  "Sri Jayawardenepura Kotte": "Colombo",
  "Nuwara Eliya": "Nuwara Eliya",
  Anuradhapura: "Anuradhapura",
  Trincomalee: "Trincomalee",
  Batticaloa: "Batticaloa",
  Polonnaruwa: "Polonnaruwa",
  Tissamaharama: "Hambantota",
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
  Pannipitiya: "Colombo",
  Kottawa: "Colombo",
  Athurugiriya: "Colombo",
  Nawala: "Colombo",
  Angoda: "Colombo",
  Thalawathugoda: "Colombo",
  Wellampitiya: "Colombo",
  Hanwella: "Colombo",
  Kotte: "Colombo",
  Kolonnawa: "Colombo",
  Pelawatte: "Colombo",
  Pelawatta: "Colombo",
  Hokandara: "Colombo",
  Kohuwala: "Colombo",
  Pitakotte: "Colombo",
  Pepiliyana: "Colombo",
  Mattegoda: "Colombo",
  Maththegoda: "Colombo",
  Meegoda: "Colombo",
  Polgasowita: "Colombo",
  Kosgama: "Colombo",
  Ratmalana: "Colombo",
  Rathmalana: "Colombo",
  Kesbewa: "Colombo",
  Padukka: "Colombo",
  Godagama: "Colombo",
  Mulleriyawa: "Colombo",
  Kotikawatta: "Colombo",
  Wellawatta: "Colombo",
  Bambalapitiya: "Colombo",
  Kollupitiya: "Colombo",
  Borella: "Colombo",
  Mirigama: "Gampaha",
  Nittambuwa: "Gampaha",
  Veyangoda: "Gampaha",
  Belummahara: "Gampaha",
  Kotugoda: "Gampaha",
  Kirindiwele: "Gampaha",
  Yakkala: "Gampaha",
  Weyangoda: "Gampaha",
  Ganemulla: "Gampaha",
  Kandana: "Gampaha",
  Jaela: "Gampaha",
  Divulapitiya: "Gampaha",
  Attanagalla: "Gampaha",
  Makola: "Gampaha",
  Peliyagoda: "Gampaha",
  Mahabage: "Gampaha",
  Diwuldeniya: "Gampaha",
  Mandawala: "Gampaha",
  Matugama: "Kalutara",
  Alubomulla: "Kalutara",
  Agalawatta: "Kalutara",
  Millaniya: "Kalutara",
  Bulathsinhala: "Kalutara",
  Palindanuwara: "Kalutara",
  Dodangoda: "Kalutara",
  Karandeniya: "Galle",
  Imaduwa: "Galle",
  Pitigala: "Galle",
  Angulugaha: "Galle",
  Uragasmanhandiya: "Galle",
  Mawanella: "Kegalle",
  Rambukkana: "Kegalle",
  Warakapola: "Kegalle",
  Ruwanwella: "Kegalle",
  Deraniyagala: "Kegalle",
  Yatiyantota: "Kegalle",
  Kegalla: "Kegalle",
  Balangoda: "Ratnapura",
  Pelmadulla: "Ratnapura",
  Eheliyagoda: "Ratnapura",
  Kuruwita: "Ratnapura",
  Godakawela: "Ratnapura",
  Kahawatta: "Ratnapura",
  Nivithigala: "Ratnapura",
  Rakwana: "Ratnapura",
  Kiriella: "Ratnapura",
  Kekirawa: "Anuradhapura",
  Thambuttegama: "Anuradhapura",
  Medawachchiya: "Anuradhapura",
  Eppawala: "Anuradhapura",
  Galenbindunuwewa: "Anuradhapura",
  Nochchiyagama: "Anuradhapura",
  Lunuwila: "Puttalam",
  Nattandiya: "Puttalam",
  Dankotuwa: "Puttalam",
  Marawila: "Puttalam",
  Mahawewa: "Puttalam",
  Madampe: "Puttalam",
  Giriulla: "Kurunegala",
  Gonawila: "Kurunegala",
  Udubaddawa: "Kurunegala",
  Narammala: "Kurunegala",
  Pannala: "Kurunegala",
  Wariyapola: "Kurunegala",
  Mawathagama: "Kurunegala",
  Polgahawela: "Kurunegala",
  Alawwa: "Kurunegala",
  Hettipola: "Kurunegala",
  Nikaweratiya: "Kurunegala",
  Gurudeniya: "Kandy",
  Wattegama: "Kandy",
  Kundasale: "Kandy",
  Digana: "Kandy",
  Pilimathalawa: "Kandy",
  Gelioya: "Kandy",
  Akurana: "Kandy",
  Ampitiya: "Kandy",
  Menikhinna: "Kandy",
  Haldummulla: "Badulla",
  Diyatalawa: "Badulla",
  Ambalantota: "Hambantota",
  Beliatta: "Hambantota",
  Beliatte: "Hambantota",
  Weeraketiya: "Hambantota",
  Thanamalwila: "Monaragala",
  Galewela: "Matale",
  Jayanthipura: "Polonnaruwa",
  Aralaganwila: "Polonnaruwa",
  Karaitivu: "Ampara",
  Thelijjawila: "Matara",
};

/** Extra spellings / short city labels → district. */
const TOWN_ALIASES: Record<string, string> = {
  boralasgamuwa: "Colombo",
  battaramulle: "Colombo",
  dehiwela: "Colombo",
  kohuwela: "Colombo",
  kaluthara: "Kalutara",
  rathnapura: "Ratnapura",
  divlapitiya: "Gampaha",
  beliatte: "Hambantota",
  thambuththegama: "Anuradhapura",
  tambuttegama: "Anuradhapura",
  jaela: "Gampaha",
  "ja ela": "Gampaha",
  col4: "Colombo",
  colombo4: "Colombo",
  col5: "Colombo",
  colombo5: "Colombo",
  col6: "Colombo",
  colombo6: "Colombo",
  col7: "Colombo",
  col8: "Colombo",
  srijayawardenepura: "Colombo",
  srijayawardenepurakotte: "Colombo",
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const TOWN_BY_KEY: Map<string, string> = (() => {
  const map = new Map<string, string>();
  const add = (name: string, district: string) => {
    const key = normalizeKey(name);
    if (key.length < 3 || map.has(key)) return;
    map.set(key, district);
  };
  for (const [town, district] of Object.entries(CITY_TO_DISTRICT)) add(town, district);
  for (const [alias, district] of Object.entries(TOWN_ALIASES)) add(alias, district);
  for (const district of SRI_LANKA_DISTRICTS) add(district, district);
  for (const [alias, district] of Object.entries(DISTRICT_ALIASES)) add(alias, district);
  return map;
})();

const TOWN_NAMES_LONGEST_FIRST = Object.keys(CITY_TO_DISTRICT).sort((a, b) => b.length - a.length);

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

function lookupNormalizedTown(value: string): string | null {
  const key = normalizeKey(value);
  if (key.length < 3) return null;
  return TOWN_BY_KEY.get(key) ?? null;
}

function inferDistrictFromTokens(raw: string): string | null {
  const exact = lookupNormalizedTown(raw);
  if (exact) return exact;

  const tokens = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const singles = [...tokens].sort((a, b) => b.length - a.length);
  for (const token of singles) {
    if (token.length < 4) continue;
    const hit = lookupNormalizedTown(token);
    if (hit) return hit;
  }
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const hit = lookupNormalizedTown(`${tokens[i]}${tokens[i + 1]}`);
    if (hit) return hit;
  }
  return null;
}

/** Match a Sri Lanka district name inside free-text address. */
export function inferDistrictFromAddressText(text: string | null | undefined): string | null {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const city = extractCityFromAddress(raw);
  if (city && CITY_TO_DISTRICT[city]) return CITY_TO_DISTRICT[city];

  const cityField = recognizedCity(raw);
  if (cityField && CITY_TO_DISTRICT[cityField]) return CITY_TO_DISTRICT[cityField];

  for (const town of TOWN_NAMES_LONGEST_FIRST) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(town)}([^a-z0-9]|$)`, "i");
    if (re.test(raw)) return CITY_TO_DISTRICT[town];
  }

  const fromTokens = inferDistrictFromTokens(raw);
  if (fromTokens) return fromTokens;

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

  const fromCity = inferDistrictFromAddressText(getAddressField(address, "city"));
  if (fromCity) return fromCity;

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

  return "";
}

/** Persistable district: null when address cannot be resolved. */
export function storedDistrictFromAddress(address: unknown): string | null {
  const value = resolveAddressDistrict(address).trim();
  return value || null;
}

/** Stored district wins; otherwise shipping address. Empty string if still unknown. */
export function resolveOrderDistrict(
  stored: string | null | undefined,
  shippingAddress: unknown,
): string {
  const marked = (stored ?? "").trim();
  if (marked) return marked;
  return resolveAddressDistrict(shippingAddress).trim();
}

const COUNTRY_LINE = /^(sri\s*lanka|ceylon)$/i;
const PHONE_LINE = /^[\d\s+\-()]{7,}$/;

function isPhoneLine(value: string) {
  if (!PHONE_LINE.test(value)) return false;
  return value.replace(/\D/g, "").length >= 9;
}

/**
 * Parse ERPNext address HTML into Shopify-style shipping JSON.
 * Drops country/phone lines from city so district inference can use the town.
 */
export function parseErpShippingAddress(
  html: string | null | undefined,
  customerName: string,
  phone?: string | null,
): Record<string, unknown> {
  const phoneField = phone?.trim() ? { phone: phone.trim() } : {};
  if (!html?.trim()) return { name: customerName, ...phoneField };

  const lines = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const addrLines =
    lines[0]?.toLowerCase() === customerName.toLowerCase() ? lines.slice(1) : lines;
  const countryLine = [...addrLines].reverse().find((line) => COUNTRY_LINE.test(line)) ?? null;
  const useful = addrLines.filter((line) => !COUNTRY_LINE.test(line) && !isPhoneLine(line));

  return {
    name: customerName,
    address1: useful[0] ?? null,
    address2: useful.length > 2 ? useful[1] : null,
    city: useful.length > 1 ? useful[useful.length - 1] : null,
    country: countryLine,
    ...phoneField,
  };
}
