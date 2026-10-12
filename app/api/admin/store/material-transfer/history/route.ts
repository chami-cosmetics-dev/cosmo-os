import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { listMaterialTransfers } from "@/lib/material-transfer/receipts";
import { shopScopeIsEmpty } from "@/lib/material-transfer/receive";
import { materialTransferHistoryQuerySchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = materialTransferHistoryQuerySchema.safeParse({
    scope: searchParams.get("scope") ?? "",
    status: searchParams.get("status") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (parsed.data.scope === "all" && !auth.canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (parsed.data.scope === "shop" && !auth.canReceive) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scope = parsed.data.scope === "shop" ? auth.scope : { explicitWarehouses: [], outletName: null };

  const transfers = await listMaterialTransfers({
    companyId: auth.companyId,
    seeAll: parsed.data.scope === "all",
    scope,
    status: parsed.data.status,
  });

  return NextResponse.json({
    transfers,
    shopUnassigned: parsed.data.scope === "shop" && shopScopeIsEmpty(scope),
  });
}
