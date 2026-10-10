import { NextRequest, NextResponse } from "next/server";

import { searchStockRequestProducts } from "@/lib/wishlist-buddy/product-search";
import { requireStockRequestViewer } from "@/lib/wishlist-buddy/route-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Product picker for the "New request" form: Cosmo product list + ERP items, by SKU or name. */
export async function GET(request: NextRequest) {
  const auth = await requireStockRequestViewer(["stock_requests.create"]);
  if (!auth.ok) return auth.response;

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const result = await searchStockRequestProducts({ companyId: auth.companyId, query });
  return NextResponse.json(result);
}
