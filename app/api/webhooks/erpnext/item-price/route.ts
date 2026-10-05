import { NextRequest, NextResponse } from "next/server";

import { recordErpItemPrice } from "@/lib/item-creation/workflow";
import {
  applyErpStandardSellingToProductItems,
  resolveCompanyIdsForErpWebhookSecret,
} from "@/lib/erp-item-price-sync";
import { decideErpItemPriceProductSync } from "@/lib/erp-item-price-decision";
import { erpnextItemPriceWebhookSchema } from "@/lib/validation/erpnext-item-price";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function unwrapErpPayload(raw: unknown): Record<string, unknown> {
  const top = raw as Record<string, unknown>;
  if (top?.data !== null && typeof top?.data === "object" && !Array.isArray(top.data)) {
    return top.data as Record<string, unknown>;
  }
  return top ?? {};
}

export async function POST(request: NextRequest) {
  const incomingSecret = request.headers.get("x-erpnext-secret") ?? "";

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = unwrapErpPayload(rawPayload);
  const companyIds = await resolveCompanyIdsForErpWebhookSecret(incomingSecret);
  if (companyIds.length === 0) {
    console.error("[ERPNext Item Price webhook] Unauthorized or unknown secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const itemCreationResult = await recordErpItemPrice(payload as {
    item_code: string;
    price_list: string;
    price_list_rate: unknown;
  }).catch((error) => ({
    error: error instanceof Error ? error.message : "Item Creation webhook failed",
  }));

  const parsed = erpnextItemPriceWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("[ERPNext Item Price webhook] Validation failed", parsed.error.flatten());
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten(), itemCreation: itemCreationResult },
      { status: 400 },
    );
  }

  const decision = decideErpItemPriceProductSync(parsed.data);
  if (!decision.apply) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: decision.reason,
      itemCreation: itemCreationResult,
    });
  }

  let updated = 0;
  for (const companyId of companyIds) {
    updated += await applyErpStandardSellingToProductItems({
      companyId,
      sku: decision.sku,
      rate: decision.rate,
    });
  }

  console.log(
    `[ERPNext Item Price webhook] ${parsed.data.name} ${decision.sku}=${decision.rate} updated=${updated}`,
  );

  return NextResponse.json({
    ok: true,
    sku: decision.sku,
    rate: decision.rate,
    updated,
    companies: companyIds.length,
    itemCreation: itemCreationResult,
  });
}
