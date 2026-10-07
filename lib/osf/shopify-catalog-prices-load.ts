import "server-only";

import {
  collectShopifyVariantPrices,
  pickShopifyStoreHandle,
  type ShopifyCatalogPrice,
} from "@/lib/osf/shopify-catalog-prices";
import { prisma } from "@/lib/prisma";
import { normalizeShopifyStoreHandle } from "@/lib/shopify-admin";

const SHOPIFY_API_VERSION = "2024-10";
const PAGE_SIZE = 250;
const MAX_PAGES = 100;

type VariantPriceNode = {
  sku?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
};

type VariantPricesResponse = {
  data?: {
    productVariants?: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: VariantPriceNode[];
    };
  };
  errors?: Array<{ message: string }>;
};

function adminToken(): string {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("[OSF] SHOPIFY_ADMIN_ACCESS_TOKEN not configured");
  return token;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function shopifyGraphql(
  storeHandle: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<VariantPricesResponse> {
  const handle = normalizeShopifyStoreHandle(storeHandle);
  const url = `https://${handle}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": adminToken(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    lastStatus = res.status;
    lastText = await res.text().catch(() => "");
    if (res.status === 429 && attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Shopify GraphQL ${res.status}: ${lastText.slice(0, 300)}`);
    }
    try {
      return JSON.parse(lastText) as VariantPricesResponse;
    } catch {
      throw new Error(`Shopify GraphQL invalid JSON: ${lastText.slice(0, 200)}`);
    }
  }
  throw new Error(`Shopify GraphQL ${lastStatus}: ${lastText.slice(0, 300)}`);
}

const VARIANT_PRICES_QUERY = `
  query OsfVariantPrices($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { sku price compareAtPrice }
    }
  }
`;

export async function fetchShopifyVariantPrices(
  storeHandle: string,
): Promise<Map<string, ShopifyCatalogPrice>> {
  const prices = new Map<string, ShopifyCatalogPrice>();
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const json = await shopifyGraphql(storeHandle, VARIANT_PRICES_QUERY, {
      first: PAGE_SIZE,
      after,
    });
    const gqlError = json.errors?.[0]?.message;
    if (gqlError) throw new Error(`Shopify GraphQL: ${gqlError.slice(0, 300)}`);
    const connection = json.data?.productVariants;
    if (!connection) break;
    collectShopifyVariantPrices(connection.nodes, prices);
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }
  return prices;
}

export async function loadShopifyCatalogPricesForCompany(companyId: string): Promise<{
  prices: Map<string, ShopifyCatalogPrice>;
  warning: string | null;
}> {
  const locations = await prisma.companyLocation.findMany({
    where: { companyId, shopifyAdminStoreHandle: { not: null } },
    select: {
      shopifyAdminStoreHandle: true,
      name: true,
      isMainCompany: true,
      locationReference: true,
    },
  });
  const handle = pickShopifyStoreHandle(locations);
  if (!handle) {
    return { prices: new Map(), warning: "No shopifyAdminStoreHandle on company locations" };
  }
  try {
    const prices = await fetchShopifyVariantPrices(handle);
    return {
      prices,
      warning: prices.size === 0 ? "Shopify returned no variant prices" : null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shopify variant prices failed";
    console.warn("[OSF] Shopify catalog prices:", message);
    return { prices: new Map(), warning: message.slice(0, 300) };
  }
}
