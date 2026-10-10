import { createHash, timingSafeEqual } from "node:crypto";

export function merchantOrdersApiKey(): string {
  return process.env.MERCHANT_ORDERS_API_KEY?.trim() ?? "";
}

/** Compare the X-API-Key header to MERCHANT_ORDERS_API_KEY without leaking the secret length. */
export function merchantOrdersApiKeyMatches(provided: string | null): boolean {
  const expected = merchantOrdersApiKey();
  if (!expected || !provided) return false;

  const actualHash = createHash("sha256").update(provided, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualHash, expectedHash);
}
