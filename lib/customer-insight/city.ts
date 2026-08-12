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

const NOISE_PART =
  /^(sri\s*lanka|western|southern|central|eastern|northern|uva|sabaragamuwa|north\s*western|north\s*central|province|district)$/i;

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

export function extractCityFromAddress(
  address: string | null | undefined
): string | null {
  const raw = (address ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const colomboPostal = raw.match(/\bcolombo\s*\d{1,2}\b/i);
  if (colomboPostal) return "Colombo";

  for (const city of KNOWN_CITIES) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(city)}([^a-z0-9]|$)`, "i");
    if (re.test(raw)) return city;
  }

  const parts = raw.split(/[,/|]/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    let part = parts[i]
      .replace(/\b\d{4,5}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!part || NOISE_PART.test(part) || /^\d+$/.test(part)) continue;
    if (part.length < 2 || part.length > 60) continue;
    return titleCaseCity(part);
  }

  return null;
}
