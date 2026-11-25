import "server-only";

import {
  notifyCheckFailed,
  notifyMismatchIfDue,
} from "@/lib/discontinued-items/notifications";
import {
  handlesQuery,
  verdictOfShopifyStatus,
} from "@/lib/discontinued-items/verification";
import { clearTestDataIfLive } from "@/lib/discontinued-items/purchasing-approval.server";
import { pickShopifyStoreHandle } from "@/lib/osf/shopify-catalog-prices";
import { prisma } from "@/lib/prisma";
import { normalizeShopifyStoreHandle } from "@/lib/shopify-admin";
import { skuKey } from "@/lib/stock-health/calc";

const SHOPIFY_API_VERSION = "2024-10";
const HANDLES_PER_QUERY = 25;

/** The cosmetics.lk Shopify store (same pick as the OSF catalog prices). */
export async function shopifyStoreHandle(): Promise<string | null> {
  const locations = await prisma.companyLocation.findMany({
    where: { shopifyAdminStoreHandle: { not: null } },
    select: { shopifyAdminStoreHandle: true, name: true, isMainCompany: true, locationReference: true },
  });
  return pickShopifyStoreHandle(locations);
}

/**
 * READ-ONLY Shopify lookup: product status (DRAFT / ACTIVE / ARCHIVED) by handle, via one Admin
 * GraphQL `products` query per batch. Never sends a mutation. A handle missing from the map was
 * not found. Throws when Shopify cannot be read.
 */
export async function fetchProductStatuses(storeHandle: string, handles: string[]): Promise<Map<string, string>> {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is not configured");
  const url = `https://${normalizeShopifyStoreHandle(storeHandle)}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const query = `query ProductStatusByHandle($first: Int!, $query: String!) {
    products(first: $first, query: $query) { nodes { handle status } }
  }`;

  const out = new Map<string, string>();
  for (let i = 0; i < handles.length; i += HANDLES_PER_QUERY) {
    const batch = handles.slice(i, i + HANDLES_PER_QUERY);
    let json: { data?: { products?: { nodes?: Array<{ handle: string; status: string }> } }; errors?: unknown } | null =
      null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables: { first: batch.length * 2, query: handlesQuery(batch) } }),
        cache: "no-store",
      });
      if (res.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        continue;
      }
      const text = await res.text().catch(() => "");
      if (!res.ok) throw new Error(`Shopify lookup failed (${res.status}): ${text.slice(0, 200)}`);
      json = JSON.parse(text);
      break;
    }
    if (!json || json.errors) {
      throw new Error(`Shopify lookup failed: ${JSON.stringify(json?.errors ?? "no response").slice(0, 200)}`);
    }
    const wanted = new Set(batch);
    for (const node of json.data?.products?.nodes ?? []) {
      const handle = node.handle?.trim().toLowerCase();
      if (handle && wanted.has(handle)) out.set(handle, node.status);
    }
  }
  return out;
}

/** Variant SKU → Shopify handle from the synced Shopify products (lower-cased). */
export async function handlesBySku(skus: string[]): Promise<Map<string, string>> {
  const products = await prisma.productItem.findMany({
    where: { sku: { in: skus }, handle: { not: null } },
    select: { sku: true, handle: true },
    orderBy: { updatedAt: "desc" },
  });
  const out = new Map<string, string>();
  for (const p of products) {
    const key = skuKey(p.sku ?? "");
    if (key && p.handle && !out.has(key)) out.set(key, p.handle.trim().toLowerCase());
  }
  return out;
}

export type VerificationRunResult = {
  checked: number;
  passed: number;
  failed: number;
  checkFailed: number;
  mismatchNotified: boolean;
  checkFailedNotified: number;
};

/**
 * Checks Draft clicks in Shopify (read-only):
 * - scheduled (daily 5:30 PM): every attempt still waiting (or whose check failed) clicked before the run;
 * - re-check (`recheckSkus`): the failed checks of those SKUs (null = every failed check), now.
 *
 * Draft → pass: item done (done date), leaves the Shopify Draft screen, kept in the database.
 * Active / Archived → fail (mismatch): the Draft button becomes clickable again; the attempt is kept.
 * No handle / not found / Shopify error → "check failed": not pass or fail, retried next run, reported.
 */
export async function runDraftVerification(
  options: { now?: Date; recheckSkus?: string[] | null } = {},
): Promise<VerificationRunResult> {
  await clearTestDataIfLive();
  const now = options.now ?? new Date();
  const recheck = options.recheckSkus !== undefined;
  const attempts = await prisma.discontinuedItemDraftAttempt.findMany({
    where: recheck
      ? {
          result: "CHECK_FAILED",
          ...(options.recheckSkus ? { item: { sku: { in: options.recheckSkus } } } : {}),
        }
      : {
          result: { in: ["AWAITING", "CHECK_FAILED"] },
          clickedAt: { lte: now },
        },
    include: { item: true },
    orderBy: { clickedAt: "asc" },
  });

  const result: VerificationRunResult = {
    checked: 0,
    passed: 0,
    failed: 0,
    checkFailed: 0,
    mismatchNotified: false,
    checkFailedNotified: 0,
  };
  // Only the item's current Draft click is checked (an item re-drafted later has a newer attempt).
  const current = attempts.filter(
    (a) =>
      a.item.stage === "SHOPIFY_DRAFT" &&
      a.item.draftClickedDate != null &&
      a.item.draftClickedDate.getTime() === a.clickedAt.getTime(),
  );

  if (current.length > 0) {
    const handles = await handlesBySku(current.map((a) => a.item.sku));
    const storeHandle = await shopifyStoreHandle();
    const wanted = [...new Set(current.map((a) => handles.get(skuKey(a.item.sku))).filter((h): h is string => !!h))];

    let statuses = new Map<string, string>();
    let lookupError: string | null = storeHandle ? null : "No Shopify store is set on the company locations.";
    if (storeHandle && wanted.length > 0) {
      try {
        statuses = await fetchProductStatuses(storeHandle, wanted);
      } catch (error) {
        lookupError = error instanceof Error ? error.message : "Shopify lookup failed";
        console.error("[Discontinued Items] Shopify verification lookup failed:", error);
      }
    }

    for (const attempt of current) {
      result.checked += 1;
      const handle = handles.get(skuKey(attempt.item.sku)) ?? null;
      const status = handle ? statuses.get(handle) : undefined;
      const verdict = handle && !lookupError ? verdictOfShopifyStatus(status) : null;

      if (verdict === null) {
        const reason = !handle
          ? "No Shopify handle found for this SKU."
          : lookupError
            ? lookupError
            : status
              ? `Unexpected Shopify status "${status}".`
              : `Product not found in Shopify (handle "${handle}").`;
        await prisma.discontinuedItemDraftAttempt.update({
          where: { id: attempt.id },
          data: {
            result: "CHECK_FAILED",
            handle,
            shopifyStatus: status ?? null,
            checkedAt: now,
            checkCount: { increment: 1 },
            lastError: reason,
          },
        });
        result.checkFailed += 1;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.discontinuedItemDraftAttempt.update({
          where: { id: attempt.id },
          data: {
            result: verdict,
            handle,
            shopifyStatus: status ?? null,
            checkedAt: now,
            checkCount: { increment: 1 },
            lastError: null,
          },
        });
        // Conditional: only if this click is still the item's current one.
        await tx.discontinuedItem.updateMany({
          where: { id: attempt.itemId, stage: "SHOPIFY_DRAFT", draftClickedDate: attempt.clickedAt },
          data:
            verdict === "PASS"
              ? { verification: "PASS", verifiedAt: now, stage: "DONE", doneDate: now }
              : // Mismatch: Draft becomes clickable again; the click stays in the attempt history.
                { verification: "FAIL", verifiedAt: now, draftClickedDate: null, draftClickedBy: null },
        });
      });
      if (verdict === "PASS") result.passed += 1;
      else result.failed += 1;
    }
  }

  result.mismatchNotified = (await notifyMismatchIfDue(now)).sent;
  result.checkFailedNotified = await notifyCheckFailed(now);
  if (result.checkFailed > 0) {
    console.warn(`[Discontinued Items] ${result.checkFailed} Shopify check(s) failed; retried next run.`);
  }
  return result;
}
