import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("purchasing.market_prices.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const header =
    "sku,competitor,competitor_title,product_url,price_lkr,in_stock,check_date,notes,pack_size\n";
  const example =
    "CERAVE-236,liberty-store,CeraVe Moisturising Lotion 236ml,https://libertystore.lk/products/cerave-236ml,8200,yes,2026-09-01,,236ml\n";

  const csvContent = header + example;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="market_prices_import_template.csv"',
    },
  });
}
