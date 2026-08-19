/**
 * Pull a city name from a free-text customer address (Sri Lanka-oriented).
 */

const KNOWN_CITIES = [
  "Sri Jayawardenepura Kotte",
  "Nuwara Eliya",
  "Anuradhapura",
  "Trincomalee",
  "Batticaloa",
  "Polonnaruwa",
  "Tissamaharama",
  "Embilipitiya",
  "Mahiyanganaya",
  "Boralesgamuwa",
  "Battaramulla",
  "Piliyandala",
  "Kiribathgoda",
  "Mount Lavinia",
  "Dehiwala",
  "Maharagama",
  "Nawalapitiya",
  "Katunayake",
  "Minuwangoda",
  "Wennappuwa",
  "Kuliyapitiya",
  "Bandaragama",
  "Ambalangoda",
  "Hambantota",
  "Monaragala",
  "Kilinochchi",
  "Mullaitivu",
  "Kurunegala",
  "Ratnapura",
  "Bandarawela",
  "Peradeniya",
  "Katugastota",
  "Kadugannawa",
  "Avissawella",
  "Homagama",
  "Kadawatha",
  "Rajagiriya",
  "Nugegoda",
  "Moratuwa",
  "Panadura",
  "Kalutara",
  "Gampaha",
  "Negombo",
  "Colombo",
  "Wattala",
  "Kelaniya",
  "Kaduwela",
  "Ja-Ela",
  "Ragama",
  "Seeduwa",
  "Chilaw",
  "Puttalam",
  "Vavuniya",
  "Mannar",
  "Jaffna",
  "Ampara",
  "Badulla",
  "Wellawaya",
  "Haputale",
  "Welimada",
  "Gampola",
  "Dambulla",
  "Matale",
  "Kegalle",
  "Matara",
  "Galle",
  "Kandy",
  "Horana",
  "Wadduwa",
  "Beruwala",
  "Bentota",
  "Hikkaduwa",
  "Weligama",
  "Tangalle",
  "Deniyaya",
  "Ahangama",
  "Aluthgama",
  "Ingiriya",
  "Malabe",
  "Hatton",
  "Passara",
  "Ella",
].sort((a, b) => b.length - a.length);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCaseCity(value: string): string {
  const known = KNOWN_CITIES.find((c) => c.toLowerCase() === value.toLowerCase());
  if (known) return known;
  return value
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

const CLEAN_CITY_LABEL = /^[A-Za-z][A-Za-z .'\-]{1,59}$/;

/** Merchant-typed or stored city: known city, or a short clean name. Junk Adapt lines → null. */
export function cityForDisplay(value: string | null | undefined): string | null {
  const extracted = extractCityFromAddress(value);
  if (extracted) return extracted;
  const raw = (value ?? "").replace(/\s+/g, " ").trim();
  if (!raw || !CLEAN_CITY_LABEL.test(raw)) return null;
  if (/^\d/.test(raw)) return null;
  return titleCaseCity(raw);
}

/** Canonical city name if `value` is a known city; otherwise null. */
export function recognizedCity(value: string | null | undefined): string | null {
  const raw = (value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  if (/\bcolombo\s*\d{1,2}\b/i.test(raw) && raw.replace(/\bcolombo\s*\d{1,2}\b/i, "").trim() === "") {
    return "Colombo";
  }
  const known = KNOWN_CITIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  return known ?? null;
}

/**
 * City only when a known Sri Lanka city is clearly present.
 * Messy / village / street blobs are skipped (merchant can fill later).
 */
export function extractCityFromAddress(
  address: string | null | undefined
): string | null {
  const raw = (address ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const exact = recognizedCity(raw);
  if (exact) return exact;

  const colomboPostal = raw.match(/\bcolombo\s*\d{1,2}\b/i);
  if (colomboPostal) return "Colombo";

  for (const city of KNOWN_CITIES) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(city)}([^a-z0-9]|$)`, "i");
    if (re.test(raw)) return city;
  }

  return null;
}
