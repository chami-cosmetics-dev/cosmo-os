import "server-only";

import { getAllOsfErpInstances } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import {
  mergeProductSearchHits,
  type ErpItemRow,
  type ProductSearchHit,
} from "@/lib/wishlist-buddy/product-search-merge";
import { erpGetJson } from "@/lib/wishlist-buddy/stock-lookup";

const PER_SOURCE_LIMIT = 15;

export type ProductSearchResponse = {
  hits: ProductSearchHit[];
  /** ERP instances that could not be searched (their items may be missing from the hits). */
  erpErrors: string[];
};

async function searchErpItems(companyId: string, query: string): Promise<{ rows: ErpItemRow[]; errors: string[] }> {
  const instances = await getAllOsfErpInstances(companyId);
  const like = `%${query}%`;
  const path =
    `/api/resource/Item` +
    `?filters=${encodeURIComponent(JSON.stringify([["disabled", "=", 0]]))}` +
    `&or_filters=${encodeURIComponent(JSON.stringify([["item_code", "like", like], ["item_name", "like", like]]))}` +
    `&fields=${encodeURIComponent(JSON.stringify(["item_code", "item_name"]))}` +
    `&limit_page_length=${PER_SOURCE_LIMIT}`;
  const rows: ErpItemRow[] = [];
  const errors: string[] = [];
  await Promise.all(
    instances.map(async (inst) => {
      try {
        const json = await erpGetJson<{ data?: ErpItemRow[] }>(inst.cfg, path);
        rows.push(...(json.data ?? []));
      } catch (error) {
        const label = (inst.label ?? inst.id).trim() || inst.id;
        errors.push(`${label}: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`);
      }
    }),
  );
  return { rows, errors };
}

/** SKU / name / barcode search over the Cosmo product list and every ERP item list. */
export async function searchStockRequestProducts(input: {
  companyId: string;
  query: string;
}): Promise<ProductSearchResponse> {
  const query = input.query.trim();
  if (query.length < 2) return { hits: [], erpErrors: [] };

  const [web, erp] = await Promise.all([
    prisma.productItem.findMany({
      where: {
        companyId: input.companyId,
        sku: { not: null },
        OR: [
          { sku: { contains: query, mode: "insensitive" } },
          { productTitle: { contains: query, mode: "insensitive" } },
          { barcode: query },
        ],
      },
      select: {
        sku: true,
        productTitle: true,
        variantTitle: true,
        imageUrl: true,
        shopifyVariantId: true,
        handle: true,
      },
      orderBy: { updatedAt: "desc" },
      take: PER_SOURCE_LIMIT * 2,
    }),
    searchErpItems(input.companyId, query),
  ]);

  return { hits: mergeProductSearchHits(web, erp.rows, query), erpErrors: erp.errors };
}
