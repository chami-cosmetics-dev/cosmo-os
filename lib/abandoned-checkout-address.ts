import { LIMITS } from "@/lib/validation";

export type AbandonedCheckoutAddressParts = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  country?: string | null;
  countryCode?: string | null;
  phone?: string | null;
};

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function personName(parts: AbandonedCheckoutAddressParts) {
  const full = clean(parts.name);
  if (full) return full;
  const joined = [parts.firstName, parts.lastName].map(clean).filter(Boolean).join(" ");
  return joined || null;
}

/** Single-line address for table / CSV / search. */
export function formatAbandonedCheckoutAddress(
  parts: AbandonedCheckoutAddressParts | null | undefined
): string | null {
  if (!parts) return null;

  const chunks = [
    personName(parts),
    clean(parts.company),
    clean(parts.address1),
    clean(parts.address2),
    clean(parts.city),
    clean(parts.province) || clean(parts.provinceCode),
    clean(parts.zip),
    clean(parts.country) || clean(parts.countryCode),
    clean(parts.phone),
  ].filter(Boolean) as string[];

  if (chunks.length === 0) return null;

  const joined = chunks.join(", ");
  return joined.length > LIMITS.description.max
    ? joined.slice(0, LIMITS.description.max)
    : joined;
}

export function addressFromShopifyRest(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return null;
  return formatAbandonedCheckoutAddress({
    name: typeof raw.name === "string" ? raw.name : null,
    firstName: typeof raw.first_name === "string" ? raw.first_name : null,
    lastName: typeof raw.last_name === "string" ? raw.last_name : null,
    company: typeof raw.company === "string" ? raw.company : null,
    address1: typeof raw.address1 === "string" ? raw.address1 : null,
    address2: typeof raw.address2 === "string" ? raw.address2 : null,
    city: typeof raw.city === "string" ? raw.city : null,
    province: typeof raw.province === "string" ? raw.province : null,
    provinceCode: typeof raw.province_code === "string" ? raw.province_code : null,
    zip: typeof raw.zip === "string" ? raw.zip : null,
    country: typeof raw.country === "string" ? raw.country : null,
    countryCode: typeof raw.country_code === "string" ? raw.country_code : null,
    phone: typeof raw.phone === "string" ? raw.phone : null,
  });
}
