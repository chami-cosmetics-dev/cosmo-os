import { LIMITS } from "@/lib/validation";

/** Variants used to match `ContactMaster.phoneNumber` and `Order.customerPhone` across formats. */
export function buildPhoneLookupVariants(raw: string): string[] {
  const t = raw.trim();
  const d = raw.replace(/\D/g, "");
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
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
  }
  return [...out].filter((s) => s.length > 0 && s.length <= LIMITS.mobile.max);
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
