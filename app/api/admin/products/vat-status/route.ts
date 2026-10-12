import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import { lookupSkuVatStatus } from "@/lib/vat-status/lookup";
import { VAT_STATUS_PERMISSION } from "@/lib/vat-status/types";
import { vatStatusLookupQuerySchema } from "@/lib/validation/vat-status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(VAT_STATUS_PERMISSION);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  const parsed = vatStatusLookupQuerySchema.safeParse({
    sku: request.nextUrl.searchParams.get("sku") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a SKU", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await lookupSkuVatStatus(companyId, parsed.data.sku);
  return NextResponse.json(result);
}
