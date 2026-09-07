import { NextResponse } from "next/server";

import { loadSkuCatalog } from "@/lib/item-trends/catalog";
import { listItemTrendErpScopes, listItemTrendFilterLocations } from "@/lib/item-trends/cover-rows";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission("purchasing.item_trends.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const [catalog, locations, erpScopes] = await Promise.all([
    loadSkuCatalog(companyId),
    listItemTrendFilterLocations(companyId),
    listItemTrendErpScopes(companyId),
  ]);

  const brands = [...new Set([...catalog.values()].map((e) => e.brand).filter(Boolean) as string[])].sort(
    (a, b) => a.localeCompare(b),
  );

  return NextResponse.json({ brands, locations, erpScopes });
}
