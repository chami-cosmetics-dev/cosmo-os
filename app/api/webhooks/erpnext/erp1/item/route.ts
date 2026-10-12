import { NextRequest, NextResponse } from "next/server";

import { resolveCompanyIdsForErpWebhookSecret } from "@/lib/erp-item-price-sync";
import { handleErp1ItemWebhook } from "@/lib/item-creation/automation";
import {
  findErpInstancesForWebhookSecret,
  syncItemTaxStatusFromWebhook,
} from "@/lib/vat-status/sync-from-webhook";

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
  const companyIds = await resolveCompanyIdsForErpWebhookSecret(incomingSecret);
  if (companyIds.length === 0) {
    console.error("[ERPNext ERP1 Item webhook] Unauthorized or unknown secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const payload = unwrapErpPayload(rawPayload);
    const instances = await findErpInstancesForWebhookSecret(incomingSecret);
    const taxStatus = await syncItemTaxStatusFromWebhook({
      instanceIds: instances.map((row) => row.id),
      payload,
    }).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : "Item tax status sync failed",
    }));
    const result = await handleErp1ItemWebhook(companyIds, payload);
    return NextResponse.json({ ok: true, ...result, taxStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERP1 Item webhook failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
