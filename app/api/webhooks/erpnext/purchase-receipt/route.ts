import { NextRequest, NextResponse } from "next/server";

import {
  ingestPurchaseReceiptFromWebhook,
  resolveGrnWebhookSecret,
} from "@/lib/grn";
import { unwrapErpWebhookPayload } from "@/lib/erpnext-customer-display-name";
import { erpnextPurchaseReceiptWebhookSchema } from "@/lib/validation/erpnext-grn";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const incomingSecret = request.headers.get("x-erpnext-secret") ?? "";

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const unwrapped =
    unwrapErpWebhookPayload(rawPayload) ?? (rawPayload as Record<string, unknown>);
  const company = typeof unwrapped.company === "string" ? unwrapped.company : "";
  const secret = company ? await resolveGrnWebhookSecret(company) : null;

  if (!secret || incomingSecret !== secret) {
    console.error("[ERPNext PR webhook] Invalid or missing secret for company:", company);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = erpnextPurchaseReceiptWebhookSchema.safeParse(unwrapped);
  if (!parsed.success) {
    console.error("[ERPNext PR webhook] Validation failed", parsed.error.flatten());
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await ingestPurchaseReceiptFromWebhook(parsed.data, rawPayload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
