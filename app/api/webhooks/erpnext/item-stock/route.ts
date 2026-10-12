import { after, NextRequest, NextResponse } from "next/server";

import { recordErpStockMovement } from "@/lib/item-creation/workflow";
import { resolveCompanyIdsForErpWebhookSecret } from "@/lib/erp-item-price-sync";
import { checkStaffRequestsForRestock } from "@/lib/wishlist-buddy/requests";

export async function POST(request: NextRequest) {
  const incomingSecret = request.headers.get("x-erpnext-secret") ?? "";
  const companyIds = await resolveCompanyIdsForErpWebhookSecret(incomingSecret);
  if (companyIds.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    if (!payload.item_code || payload.actual_qty === undefined) {
      return NextResponse.json(
        { error: "item_code and actual_qty are required" },
        { status: 400 }
      );
    }
    const result = await recordErpStockMovement(payload);

    // Stock came in: staff wishlist requests waiting for this SKU may now be available.
    const sku = String(payload.item_code).trim();
    if (sku && Number(payload.actual_qty) > 0) {
      after(() =>
        checkStaffRequestsForRestock({ companyIds, skus: [sku] }).catch((error) =>
          console.error("[Wishlist Buddy] staff restock check failed", { sku, error }),
        ),
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
