import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Shopify webhook HMAC signature.
 * @see https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook
 */
export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader || !secret) {
    return false;
  }
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    return timingSafeEqual(Buffer.from(hmacHeader, "base64"), Buffer.from(computed, "base64"));
  } catch {
    return false;
  }
}
