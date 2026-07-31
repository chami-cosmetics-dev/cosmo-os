import { LIMITS } from "@/lib/validation";

/** Strip to digits; drop a leading international `00` dial prefix. */
export function phoneDigitsOnly(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

/** True when the search string looks like a phone (not a name/email). */
export function isPhoneLikeSearch(search: string): boolean {
  const digits = phoneDigitsOnly(search);
  if (digits.length < 4) return false;
  const significant = search.replace(/[\s\-()+./]/g, "");
  if (!significant) return false;
  return digits.length >= Math.ceil(significant.length * 0.7);
}

/** Variants used to match `ContactMaster.phoneNumber` and `Order.customerPhone` across formats. */
export function buildPhoneLookupVariants(raw: string): string[] {
  const t = raw.trim();
  let d = phoneDigitsOnly(raw);
  const out = new Set<string>();
  if (t) out.add(t);
  if (d) {
    out.add(d);
    if (d.length === 9) {
      out.add(`0${d}`);
      out.add(`94${d}`);
    }
    if (d.length === 10 && d.startsWith("0")) {
      out.add(d.slice(1));
      out.add(`94${d.slice(1)}`);
      out.add(`940${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
    if (d.length === 12 && d.startsWith("94") && d[2] === "0") {
      const local = d.slice(2);
      out.add(local);
      out.add(local.slice(1));
      out.add(`94${local.slice(1)}`);
    }
  }

  // Always include +E.164-style forms so "+9471…" matches "071…" / "9471…" searches.
  for (const variant of [...out]) {
    const digits = phoneDigitsOnly(variant);
    if (!digits) continue;
    out.add(`+${digits}`);
    if (digits.startsWith("94") && digits.length >= 11) {
      out.add(`+${digits}`);
      out.add(`00${digits}`);
    } else if (digits.length === 10 && digits.startsWith("0")) {
      out.add(`+94${digits.slice(1)}`);
      out.add(`94${digits.slice(1)}`);
    } else if (digits.length === 9) {
      out.add(`+94${digits}`);
      out.add(`94${digits}`);
      out.add(`0${digits}`);
    }
  }

  return [...out].filter((s) => s.length > 0 && s.length <= LIMITS.mobile.max);
}

/**
 * Suffixes useful for `endsWith` matching when the DB value has a different prefix
 * (e.g. stored "+94717106114", query "0717106114" or "6114").
 */
export function buildPhoneSearchSuffixes(raw: string): string[] {
  const digits = phoneDigitsOnly(raw);
  const out = new Set<string>();
  if (digits.length >= 4) {
    out.add(digits);
    out.add(digits.slice(-4));
    if (digits.length > 4) out.add(digits.slice(-6));
    if (digits.length > 6) out.add(digits.slice(-8));
    if (digits.length === 10 && digits.startsWith("0")) {
      out.add(digits.slice(1)); // 717106114
    }
    if (digits.length === 11 && digits.startsWith("94")) {
      out.add(digits.slice(2)); // 717106114
      out.add(`0${digits.slice(2)}`);
    }
    if (digits.length === 9) {
      out.add(digits);
      out.add(`0${digits}`);
    }
  }
  for (const variant of buildPhoneLookupVariants(raw)) {
    const vDigits = phoneDigitsOnly(variant);
    if (vDigits.length >= 4) out.add(vDigits);
    // Keep formatted variants that can appear as stored suffixes (rare but cheap).
    if (variant.length >= 4 && variant.length <= LIMITS.mobile.max) out.add(variant);
  }
  return [...out].filter((s) => s.length >= 4 && s.length <= LIMITS.mobile.max);
}

/**
 * Prisma OR clauses to match ContactMaster (+ secondary ContactPhone) across phone formats.
 */
export function buildContactPhoneSearchOrFilters(phone: string): Array<Record<string, unknown>> {
  const variants = buildPhoneLookupVariants(phone);
  const suffixes = buildPhoneSearchSuffixes(phone);
  const filters: Array<Record<string, unknown>> = [];

  if (variants.length > 0) {
    filters.push({ phoneNumber: { in: variants } });
    filters.push({ phones: { some: { phoneNumber: { in: variants } } } });
  }

  for (const suffix of suffixes) {
    filters.push({ phoneNumber: { endsWith: suffix } });
    filters.push({ phones: { some: { phoneNumber: { endsWith: suffix } } } });
  }

  return filters;
}

/**
 * Normalize to ERP Customer `mobile_no` format: exactly 10 digits starting with 0.
 * Returns null when the input cannot be confidently corrected (never POST an invalid number).
 */
export function canonicalPhoneForErpCustomerId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // International dial prefix (e.g. 0094…)
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Sri Lanka country code, with or without trunk 0 after it (9477… / 94077…)
  if (digits.startsWith("94") && digits.length >= 11) {
    digits = digits.slice(2);
  }

  // Collapse accidental extra leading zeros (0077… → 077…)
  if (digits.length > 10 && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "0");
  }

  // Local mobile/landline without leading 0 (9 digits)
  if (digits.length === 9) {
    digits = `0${digits}`;
  }

  if (digits.length === 10 && digits.startsWith("0")) {
    return digits.slice(0, LIMITS.mobile.max);
  }

  return null;
}

/** Prefer ERP-safe local format when storing customer phones on Order / contacts. */
export function normalizeOrderCustomerPhone(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  return canonicalPhoneForErpCustomerId(trimmed) ?? trimmed.slice(0, LIMITS.mobile.max);
}

export function extractAddressFromShippingJson(addr: unknown): {
  address1: string;
  city: string;
} {
  if (!addr || typeof addr !== "object") return { address1: "", city: "" };
  const a = addr as Record<string, unknown>;
  const address1 = typeof a.address1 === "string" ? a.address1 : "";
  const city = typeof a.city === "string" ? a.city : "";
  return { address1, city };
}

export function pickNameFromShippingJson(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  const n = a.name ?? [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
  return typeof n === "string" ? n.trim() : "";
}
