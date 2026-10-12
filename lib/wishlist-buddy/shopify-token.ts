/**
 * Admin API token for a store where Wishlist Buddy is installed.
 *
 * Uses Shopify's client credentials grant with the app's own client ID + secret, so each store
 * (a personal test store, later cosmetics.lk) gets a token for that store. The grant only works
 * when the app and the store are in the same Shopify organization and the app is installed;
 * tokens last 24 hours. Falls back to SHOPIFY_ADMIN_ACCESS_TOKEN (the main store's token)
 * when the app credentials are not configured or the grant is refused.
 * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
 */

type CachedToken = { token: string; expiresAtMs: number };

const cache = new Map<string, CachedToken>();

/** Refresh this long before Shopify's expiry so an in-flight request never uses a dead token. */
const EXPIRY_MARGIN_MS = 10 * 60 * 1000;

async function requestClientCredentialsToken(input: {
  storeHandle: string;
  clientId: string;
  clientSecret: string;
}): Promise<CachedToken> {
  const res = await fetch(`https://${input.storeHandle}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[Wishlist Buddy] token grant for ${input.storeHandle} [${res.status}]: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error(`[Wishlist Buddy] token grant for ${input.storeHandle}: no access_token`);
  const lifetimeMs = (Number(json.expires_in) > 0 ? Number(json.expires_in) : 86_399) * 1000;
  return { token: json.access_token, expiresAtMs: Date.now() + lifetimeMs };
}

export async function getWishlistBuddyAdminToken(storeHandle: string, nowMs: number = Date.now()): Promise<string> {
  const clientId = process.env.WISHLIST_BUDDY_SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.WISHLIST_BUDDY_SHOPIFY_API_SECRET?.trim();
  const fallback = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();

  if (clientId && clientSecret) {
    const cached = cache.get(storeHandle);
    if (cached && cached.expiresAtMs - EXPIRY_MARGIN_MS > nowMs) return cached.token;
    try {
      const fresh = await requestClientCredentialsToken({ storeHandle, clientId, clientSecret });
      cache.set(storeHandle, fresh);
      return fresh.token;
    } catch (error) {
      if (!fallback) throw error;
      console.warn("[Wishlist Buddy] client credentials grant failed; using SHOPIFY_ADMIN_ACCESS_TOKEN", {
        storeHandle,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!fallback) {
    throw new Error(
      "[Wishlist Buddy] Set WISHLIST_BUDDY_SHOPIFY_CLIENT_ID + WISHLIST_BUDDY_SHOPIFY_API_SECRET (or SHOPIFY_ADMIN_ACCESS_TOKEN)",
    );
  }
  return fallback;
}

/** Drop a cached token (e.g. after a 401) so the next call requests a new one. */
export function forgetWishlistBuddyAdminToken(storeHandle: string): void {
  cache.delete(storeHandle);
}
