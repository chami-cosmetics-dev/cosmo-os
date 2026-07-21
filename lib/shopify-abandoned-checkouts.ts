import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation";

const ABANDONED_CHECKOUT_SYNC_WINDOW_DAYS = 7;

const SHOPIFY_API_VERSION = "2024-10";

type ShopifyMoney = { amount: string; currencyCode: string };

type ShopifyLineItem = {
  title: string | null;
  quantity: number | null;
  discountedTotalPriceSet: { shopMoney: ShopifyMoney } | null;
};

type ShopifyAbandonedCheckoutNode = {
  id: string;
  abandonedCheckoutUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
  completedAt: string | null;
  customer: { firstName: string | null; lastName: string | null; email: string | null } | null;
  billingAddress: { phone: string | null } | null;
  shippingAddress: { phone: string | null } | null;
  totalPriceSet: { shopMoney: ShopifyMoney } | null;
  lineItems: { nodes: ShopifyLineItem[] } | null;
};

type ShopifyAbandonedCheckoutsPage = {
  nodes: ShopifyAbandonedCheckoutNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

function getAdminToken() {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) return null;
  return token;
}

function extractNumericId(shopifyGid: string) {
  const parts = shopifyGid.split("/");
  return parts[parts.length - 1] ?? shopifyGid;
}

function buildLineItemsSummary(lineItems: ShopifyLineItem[]) {
  const parts = lineItems
    .filter((li) => li.title?.trim() && typeof li.quantity === "number")
    .slice(0, 10)
    .map((li) => `${li.title!.trim()} x${li.quantity}`);

  const joined = parts.join(", ");
  if (!joined) return "";
  return joined.length > LIMITS.description.max ? joined.slice(0, LIMITS.description.max) : joined;
}

async function fetchAbandonedCheckoutsPage({
  storeHandle,
  token,
  query,
  first,
  after,
}: {
  storeHandle: string;
  token: string;
  query: string;
  first: number;
  after: string | null;
}): Promise<ShopifyAbandonedCheckoutsPage> {
  const url = `https://${storeHandle}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const graphQLQuery = `
    query AbandonedCheckouts($first: Int!, $after: String, $query: String) {
      abandonedCheckouts(first: $first, after: $after, query: $query) {
        nodes {
          id
          abandonedCheckoutUrl
          createdAt
          updatedAt
          completedAt
          customer {
            firstName
            lastName
            email
          }
          billingAddress {
            phone
          }
          shippingAddress {
            phone
          }
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 10) {
            nodes {
              title
              quantity
              discountedTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: graphQLQuery,
      variables: { first, after, query },
    }),
  });

  const json = (await res.json()) as { data?: { abandonedCheckouts?: ShopifyAbandonedCheckoutsPage }; errors?: Array<{ message: string }> };

  if (!res.ok) {
    const message = json.errors?.[0]?.message ?? `Shopify sync failed with status ${res.status}`;
    throw new Error(`[Shopify abandonedCheckouts] ${message}`);
  }

  const page = json.data?.abandonedCheckouts;
  if (!page) {
    const message = json.errors?.[0]?.message ?? "Missing abandonedCheckouts data";
    throw new Error(`[Shopify abandonedCheckouts] ${message}`);
  }

  return page;
}

export async function syncAbandonedCheckoutsForCompany(companyId: string): Promise<{
  upserted: number;
  updated: number;
  recoveredDetected: number;
}> {
  const now = new Date();
  const token = getAdminToken();

  try {
    if (!token) {
      // Vault OS: no Admin API token — abandoned checkouts arrive via checkouts/* webhooks.
      // Do not set lastSyncError (that shows as a red banner); webhook ingest clears/sets sync meta itself.
      await prisma.companyAbandonedCheckoutSync.upsert({
        where: { companyId },
        create: {
          companyId,
          lastSyncedAt: now,
          lastSyncError: null,
        },
        update: {
          // Keep existing lastSyncedAt if webhooks already wrote a newer value.
          lastSyncError: null,
        },
      });
      return { upserted: 0, updated: 0, recoveredDetected: 0 };
    }

    const locations = await prisma.companyLocation.findMany({
      where: {
        companyId,
        shopifyAdminStoreHandle: { not: null },
      },
      select: { id: true, shopifyAdminStoreHandle: true },
    });

    const handles = Array.from(
      new Map(
        locations
          .filter((l) => l.shopifyAdminStoreHandle)
          .map((l) => [l.shopifyAdminStoreHandle as string, l] as const)
      ).values()
    );

    if (handles.length === 0) {
      await prisma.companyAbandonedCheckoutSync.upsert({
        where: { companyId },
        create: { companyId, lastSyncedAt: now, lastSyncError: null },
        update: { lastSyncedAt: now, lastSyncError: null },
      });
      return { upserted: 0, updated: 0, recoveredDetected: 0 };
    }

    const sinceDate = new Date(Date.now() - ABANDONED_CHECKOUT_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const sinceYmd = sinceDate.toISOString().slice(0, 10);
    const query = `created_at:>='${sinceYmd}'`;

    let upserted = 0;
    let updated = 0;
    let recoveredDetected = 0;

    for (const loc of handles) {
      const storeHandle = loc.shopifyAdminStoreHandle as string;

      let after: string | null = null;
      let hasNextPage = true;

      while (hasNextPage) {
        const page = await fetchAbandonedCheckoutsPage({
          storeHandle,
          token,
          query,
          first: 50,
          after,
        });

        const nodes = page.nodes ?? [];
        if (nodes.length === 0) {
          hasNextPage = page.pageInfo.hasNextPage;
          after = page.pageInfo.endCursor;
          continue;
        }

        const gids = nodes.map((n) => n.id);
        const existing = await prisma.shopifyAbandonedCheckout.findMany({
          where: {
            companyId,
            shopifyCheckoutGid: { in: gids },
          },
          select: {
            shopifyCheckoutGid: true,
            followUpStatus: true,
            customerResponse: true,
            remark: true,
            shopifyRecoveredAt: true,
          },
        });
        const existingByGid = new Map(existing.map((e) => [e.shopifyCheckoutGid, e]));

        for (const node of nodes) {
          const shopifyCheckoutGid = node.id;
          const numericId = extractNumericId(shopifyCheckoutGid);
          const abandonedAt = new Date(node.createdAt);
          const shopifyCompletedAt = node.completedAt ? new Date(node.completedAt) : null;

          const recovered = Boolean(shopifyCompletedAt);

          const current = existingByGid.get(shopifyCheckoutGid);

          const keepManualClosed =
            recovered &&
            current?.followUpStatus === "closed" &&
            Boolean(current.customerResponse) &&
            current.customerResponse !== "recovered_sale";

          const nextFollowUpStatus = keepManualClosed
            ? "closed"
            : recovered
              ? "closed"
              : (current?.followUpStatus ?? "pending");

          const nextCustomerResponse = keepManualClosed
            ? current?.customerResponse ?? null
            : recovered
              ? "recovered_sale"
              : current?.customerResponse ?? null;

          const nextRemark = current?.remark ?? null;
          const nextShopifyRecoveredAt = recovered
            ? current?.shopifyRecoveredAt ?? now
            : current?.shopifyRecoveredAt ?? null;

          const totalMoney = node.totalPriceSet?.shopMoney;
          const currency = totalMoney?.currencyCode ?? "LKR";
          const totalPrice = totalMoney?.amount ?? "0";

          const lineItems = node.lineItems?.nodes ?? [];
          const lineItemsSummary = buildLineItemsSummary(lineItems);

          const lineItemsJson = node.lineItems?.nodes?.length
            ? (node.lineItems.nodes as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull;

          const customerPhone = node.billingAddress?.phone ?? node.shippingAddress?.phone ?? null;

          const commonFields = {
            companyId,
            shopifyCheckoutGid,
            shopifyCheckoutId: numericId,
            shopifyAdminStoreHandle: storeHandle,
            companyLocationId: loc.id,

            customerName:
              node.customer?.firstName || node.customer?.lastName
                ? [node.customer?.firstName, node.customer?.lastName].filter(Boolean).join(" ").trim()
                : null,
            customerEmail: node.customer?.email ?? null,
            customerPhone,

            lineItemsSummary: lineItemsSummary || "",
            lineItemsJson,

            totalPrice: new Prisma.Decimal(totalPrice),
            currency,

            abandonedAt,
            shopifyUpdatedAt: node.updatedAt ? new Date(node.updatedAt) : null,
            shopifyCompletedAt,
            shopifyRecoveredAt: nextShopifyRecoveredAt,
            abandonedCheckoutUrl: node.abandonedCheckoutUrl ?? null,

            followUpStatus: nextFollowUpStatus,
            customerResponse: nextCustomerResponse,
            remark: nextRemark,
          };

          if (current) {
            await prisma.shopifyAbandonedCheckout.update({
              where: {
                companyId_shopifyCheckoutGid: { companyId, shopifyCheckoutGid },
              },
              data: commonFields,
            });
            updated += 1;
          } else {
            await prisma.shopifyAbandonedCheckout.create({
              data: {
                ...commonFields,
                lastFollowUpById: null,
                lastFollowUpAt: null,
              },
            });
            upserted += 1;
          }

          if (
            recovered &&
            nextFollowUpStatus === "closed" &&
            nextCustomerResponse === "recovered_sale"
          ) {
            recoveredDetected += 1;
          }
        }

        hasNextPage = page.pageInfo.hasNextPage;
        after = page.pageInfo.endCursor;
      }
    }

    await prisma.companyAbandonedCheckoutSync.upsert({
      where: { companyId },
      create: { companyId, lastSyncedAt: now, lastSyncError: null },
      update: { lastSyncedAt: now, lastSyncError: null },
    });

    return { upserted, updated, recoveredDetected };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.companyAbandonedCheckoutSync.upsert({
      where: { companyId },
      create: { companyId, lastSyncedAt: null, lastSyncError: message.slice(0, 1000) },
      update: { lastSyncedAt: null, lastSyncError: message.slice(0, 1000) },
    });
    throw err;
  }
}

