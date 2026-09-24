import {
  buildPhoneLookupVariants,
  canonicalPhoneForErpCustomerId,
} from "@/lib/phone-lookup";

export function registerPhoneVariants(raw: string): string[] {
  return buildPhoneLookupVariants(raw);
}

export function normalizeRegisterPhone(raw: string): string | null {
  return canonicalPhoneForErpCustomerId(raw);
}
