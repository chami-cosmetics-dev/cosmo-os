import { NextRequest, NextResponse } from "next/server";

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
  const instances = await findErpInstancesForWebhookSecret(incomingSecret);
  if (instances.length === 0) {
    console.error("[ERPNext Item webhook] Unauthorized or unknown secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await syncItemTaxStatusFromWebhook({
      instanceIds: instances.map((row) => row.id),
      payload: unwrapErpPayload(rawPayload),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Item tax status sync failed";
    console.error("[ERPNext Item webhook]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
