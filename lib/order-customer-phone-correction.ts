import type { Prisma } from "@prisma/client";

import { canonicalPhoneForErpCustomerId } from "@/lib/phone-lookup";
import { LIMITS } from "@/lib/validation";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function withPhone(value: unknown, phone: string): Prisma.InputJsonValue | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return { ...record, phone } as Prisma.InputJsonValue;
}

function withNestedPhone(
  parent: Record<string, unknown>,
  key: string,
  phone: string,
): void {
  const nested = asRecord(parent[key]);
  if (!nested) return;
  parent[key] = { ...nested, phone };
}

/**
 * Normalize staff-corrected phone for ERP Customer create/lookup.
 * Rejects values that cannot be forced into 10-digit Sri Lanka `0…` form.
 */
export function resolveCorrectedOrderCustomerPhone(raw: string): {
  ok: true;
  phone: string;
} | {
  ok: false;
  error: string;
} {
  const trimmed = raw.trim().slice(0, LIMITS.mobile.max);
  if (!trimmed) {
    return { ok: false, error: "Phone number is required" };
  }
  const canonical = canonicalPhoneForErpCustomerId(trimmed);
  if (!canonical) {
    return {
      ok: false,
      error: "Use a Sri Lanka mobile/landline in 10-digit form starting with 0 (e.g. 0771234567)",
    };
  }
  return { ok: true, phone: canonical };
}

/** Patch Order phone columns + Shopify rawPayload so ERP retry picks up the fix. */
export function buildOrderCustomerPhoneCorrectionData(input: {
  phone: string;
  shippingAddress: unknown;
  billingAddress: unknown;
  rawPayload: unknown;
}): {
  customerPhone: string;
  shippingAddress?: Prisma.InputJsonValue;
  billingAddress?: Prisma.InputJsonValue;
  rawPayload?: Prisma.InputJsonValue;
} {
  const phone = input.phone;
  const data: {
    customerPhone: string;
    shippingAddress?: Prisma.InputJsonValue;
    billingAddress?: Prisma.InputJsonValue;
    rawPayload?: Prisma.InputJsonValue;
  } = { customerPhone: phone };

  const shipping = withPhone(input.shippingAddress, phone);
  if (shipping) data.shippingAddress = shipping;

  const billing = withPhone(input.billingAddress, phone);
  if (billing) data.billingAddress = billing;

  const raw = asRecord(input.rawPayload);
  if (raw) {
    const next = { ...raw, phone };
    withNestedPhone(next, "billing_address", phone);
    withNestedPhone(next, "shipping_address", phone);
    withNestedPhone(next, "customer", phone);
    data.rawPayload = next as Prisma.InputJsonValue;
  }

  return data;
}
