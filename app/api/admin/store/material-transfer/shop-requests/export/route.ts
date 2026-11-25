import { NextRequest, NextResponse } from "next/server";

import { requireMaterialTransferView } from "@/lib/material-transfer/auth";
import { buildShopRequestWorkbook } from "@/lib/material-transfer/shop-item-request-export";
import { listShopItemRequests } from "@/lib/material-transfer/shop-item-request-store";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { shopItemRequestListQuerySchema } from "@/lib/validation/material-transfer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Stores users only — Excel of pending/done shop item requests. */
export async function GET(request: NextRequest) {
  const auth = await requireMaterialTransferView();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Only stores users can download shop requests" }, { status: 403 });
  }

  const parsed = shopItemRequestListQuerySchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    scope: "all",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const status = parsed.data.status ?? "pending";
    const requests = await listShopItemRequests({
      companyId: auth.companyId,
      status,
      scope: "all",
      outletName: null,
    });
    const buffer = buildShopRequestWorkbook(requests);
    const filename = `shop-requests-${status}-${formatAppIsoDate(new Date())}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[shop-requests/export]", error);
    return NextResponse.json({ error: "Could not export shop requests" }, { status: 500 });
  }
}
