import { NextResponse } from "next/server";

import { requireStoreStockCountAccess } from "@/lib/store-stock-count/auth";
import { listErpCompaniesForOsCompany } from "@/lib/store-stock-count/erp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const auth = await requireStoreStockCountAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await listErpCompaniesForOsCompany(auth.companyId);
  if (result.allFailed) {
    return NextResponse.json(
      { error: result.errors.join("; ") || "All ERP instances failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ companies: result.companies });
}
