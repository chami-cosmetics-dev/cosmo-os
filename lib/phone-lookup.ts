import { LIMITS } from "@/lib/validation";

/** Variants used to match `ContactMaster.phoneNumber` and `Order.customerPhone` across formats. */
export function buildPhoneLookupVariants(raw: string): string[] {
  const t = raw.trim();
  let d = raw.replace(/\D/g, "");
  const out = new Set<string>();
  if (t) out.add(t);
  if (d.startsWith("00")) d = d.slice(2);
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
  return [...out].filter((s) => s.length > 0 && s.length <= LIMITS.mobile.max);
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
