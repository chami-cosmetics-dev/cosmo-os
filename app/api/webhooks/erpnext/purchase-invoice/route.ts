import { NextRequest, NextResponse } from "next/server";

import {
  ingestPurchaseInvoiceFromWebhook,
  resolveGrnWebhookInstanceSecret,
} from "@/lib/grn";
import { unwrapErpWebhookPayload } from "@/lib/erpnext-customer-display-name";
import { erpnextPurchaseInvoiceWebhookSchema } from "@/lib/validation/erpnext-grn";

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

  const topLevel = rawPayload as Record<string, unknown>;
  const unwrapped = unwrapErpWebhookPayload(rawPayload) ?? topLevel;
  const companyRaw = unwrapped?.company;
  const company = typeof companyRaw === "string" ? companyRaw : "";

  const instanceSecret = await resolveGrnWebhookInstanceSecret(company);
  if (
    !instanceSecret ||
    !instanceSecret.secret ||
    incomingSecret !== instanceSecret.secret
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = erpnextPurchaseInvoiceWebhookSchema.safeParse(unwrapped);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await ingestPurchaseInvoiceFromWebhook(parsed.data, rawPayload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
