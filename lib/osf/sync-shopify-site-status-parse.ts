import { normalizeShopifyStoreHandle } from "@/lib/shopify-admin";

export function storefrontOriginFromLocation(input: {
  shopifyShopName?: string | null;
  shopifyAdminStoreHandle?: string | null;
}): string | null {
  const name = (input.shopifyShopName ?? "").trim();
  if (/^https?:\/\//i.test(name)) return name.replace(/\/+$/, "");
  const host = name.replace(/^www\./i, "");
  if (host.includes(".") && !host.includes(" ")) return `https://${host}`;
  const handle = normalizeShopifyStoreHandle(input.shopifyAdminStoreHandle ?? "");
  if (handle) return `https://${handle}.myshopify.com`;
  return null;
}

export function parseStorefrontProductHandles(xml: string, origin: string): Set<string> {
  const originHost = origin.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const handles = new Set<string>();
  const re = /https?:\/\/[^/]+\/products\/([^<?\s]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const locHost = match[0].replace(/^https?:\/\//i, "").split("/")[0] ?? "";
    if (locHost && originHost && locHost.toLowerCase() !== originHost.toLowerCase()) continue;
    handles.add(decodeURIComponent(match[1].replace(/\/$/, "")).toLowerCase());
  }
  return handles;
}
