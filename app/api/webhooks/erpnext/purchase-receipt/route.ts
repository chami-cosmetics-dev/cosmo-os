import { NextRequest, NextResponse } from "next/server";

import { handleIncomingErpGrnWebhook } from "@/lib/erp-grn-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const incomingSecret = request.headers.get("x-erpnext-secret") ?? "";

  const body = await request.text();
  let rawPayload: unknown = body;
  try {
    rawPayload = JSON.parse(body);
  } catch {
    // Keep the malformed body in the webhook ledger so it can be diagnosed.
  }

  const result = await handleIncomingErpGrnWebhook({
    type: "purchase_receipt",
    endpoint: request.nextUrl.pathname,
    incomingSecret,
    rawPayload,
  });
  return NextResponse.json(result.body, { status: result.status });
}
