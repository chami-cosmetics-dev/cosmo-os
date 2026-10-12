import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the `signature` query param Shopify adds to app proxy requests.
 *
 * Shopify signs every query param except `signature`: params sorted by key, each written as
 * `key=value` (repeated keys joined with ","), concatenated with no separator, HMAC-SHA256 hex
 * with the app's client secret. The request body is not signed.
 * @see https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
 */
export function verifyAppProxySignature(searchParams: URLSearchParams, secret: string): boolean {
  const signature = searchParams.get("signature");
  if (!signature || !secret) return false;

  const grouped = new Map<string, string[]>();
  for (const [key, value] of searchParams.entries()) {
    if (key === "signature") continue;
    const list = grouped.get(key) ?? [];
    list.push(value);
    grouped.set(key, list);
  }

  const message = [...grouped.keys()]
    .sort()
    .map((key) => `${key}=${grouped.get(key)!.join(",")}`)
    .join("");

  const computed = createHmac("sha256", secret).update(message, "utf8").digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(computed, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Rejects signed requests older than this, so a captured URL can't be replayed indefinitely. */
export const APP_PROXY_MAX_AGE_SECONDS = 5 * 60;

export function isAppProxyTimestampFresh(
  searchParams: URLSearchParams,
  nowMs: number = Date.now(),
): boolean {
  const ts = Number(searchParams.get("timestamp"));
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return Math.abs(nowMs / 1000 - ts) <= APP_PROXY_MAX_AGE_SECONDS;
}
