import { NextRequest, NextResponse } from "next/server";

import { fetchProductItemsPageData } from "@/lib/page-data/product-items";
import { buildCsv } from "@/lib/reports/csv";
import { requirePermission } from "@/lib/rbac";
import { sortOrderSchema } from "@/lib/validation";

function formatPrice(value: string | null | undefined) {
  return value ?? "";
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const sortOrderResult = sortOrderSchema.safeParse(searchParams.get("sort_order"));
  const data = await fetchProductItemsPageData(companyId, {
    page: 1,
    limit: 100000,
    sortBy: searchParams.get("sort_by")?.trim() ?? undefined,
    sortOrder: sortOrderResult.success ? sortOrderResult.data : "asc",
    locationId: searchParams.get("location_id") ?? undefined,
    vendorId: searchParams.get("vendor_id") ?? undefined,
    categoryId: searchParams.get("category_id") ?? undefined,
    familyId: searchParams.get("family_id") ?? undefined,
    erpProductPriority:
      searchParams.get("erp_product_priority")?.trim() ||
      searchParams.get("item_status_category")?.trim() ||
      undefined,
    search: searchParams.get("search")?.trim() ?? undefined,
  });

  const headers = [
    "Family Name",
    "Product",
    "Variant",
    "SKU",
    "Vendor",
    "Category",
    "ERP1 Priority",
    "ERP2 Priority",
    "Price",
    "Compare At Price",
    "Stock",
    "Location",
    "Academy Explanation",
  ] as const;

  const csv = buildCsv(
    headers,
    data.items.map((item) => ({
      "Family Name": item.familyName,
      Product: item.productTitle,
      Variant: item.variantTitle ?? "",
      SKU: item.sku ?? "",
      Vendor: item.vendor?.name ?? "",
      Category: item.category?.name ?? "",
      "ERP1 Priority": item.erp1ProductPriority ?? "",
      "ERP2 Priority": item.erp2ProductPriority ?? "",
      Price: formatPrice(item.priceDisplay ?? item.price),
      "Compare At Price": formatPrice(item.compareAtPriceDisplay ?? item.compareAtPrice),
      Stock: item.totalInventoryQuantity ?? item.inventoryQuantity,
      Location: item.locationSummary ?? item.companyLocation?.name ?? "",
      "Academy Explanation": item.hasExplanation ? "Yes" : "No",
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="product-items-export.csv"',
      "Cache-Control": "no-store",
    },
  });
}
