import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetWishlistBuddyAdminToken, getWishlistBuddyAdminToken } from "./shopify-token";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WISHLIST_BUDDY_SHOPIFY_CLIENT_ID", "cid");
  vi.stubEnv("WISHLIST_BUDDY_SHOPIFY_API_SECRET", "secret");
  vi.stubEnv("SHOPIFY_ADMIN_ACCESS_TOKEN", "");
  forgetWishlistBuddyAdminToken("test-store");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function tokenResponse(token: string, expiresIn = 86399) {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), { status: 200 });
}

describe("getWishlistBuddyAdminToken", () => {
  it("requests a client credentials token and caches it", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("tok-1"));
    const now = 1_700_000_000_000;

    expect(await getWishlistBuddyAdminToken("test-store", now)).toBe("tok-1");
    expect(await getWishlistBuddyAdminToken("test-store", now + 60_000)).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://test-store.myshopify.com/admin/oauth/access_token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("secret");
  });

  it("refreshes before the token expires", async () => {
    // Token issued now; the cache is checked against the real clock when it is stored.
    fetchMock.mockResolvedValueOnce(tokenResponse("tok-1", 3600)).mockResolvedValueOnce(tokenResponse("tok-2"));
    expect(await getWishlistBuddyAdminToken("test-store")).toBe("tok-1");
    expect(await getWishlistBuddyAdminToken("test-store", Date.now() + 55 * 60 * 1000)).toBe("tok-2");
  });

  it("falls back to SHOPIFY_ADMIN_ACCESS_TOKEN when the grant is refused", async () => {
    vi.stubEnv("SHOPIFY_ADMIN_ACCESS_TOKEN", "main-store-token");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 400 }));
    expect(await getWishlistBuddyAdminToken("test-store")).toBe("main-store-token");
  });

  it("throws when the grant fails and there is no fallback", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 400 }));
    await expect(getWishlistBuddyAdminToken("test-store")).rejects.toThrow("[400]");
  });

  it("uses the fallback token when app credentials are not set", async () => {
    vi.stubEnv("WISHLIST_BUDDY_SHOPIFY_CLIENT_ID", "");
    vi.stubEnv("SHOPIFY_ADMIN_ACCESS_TOKEN", "main-store-token");
    expect(await getWishlistBuddyAdminToken("test-store")).toBe("main-store-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
