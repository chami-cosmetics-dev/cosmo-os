import { NextRequest, NextResponse } from "next/server";

import {
  ingestSupplierStockReturnFromWebhook,
  resolveGrnWebhookInstanceSecret,
} from "@/lib/grn";
import { unwrapErpWebhookPayload } from "@/lib/erpnext-customer-display-name";
import { erpnextSupplierStockReturnWebhookSchema } from "@/lib/validation/erpnext-grn";

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
  console.log("[ERPNext SSR webhook] top-level keys:", Object.keys(topLevel));
  if (topLevel?.data && typeof topLevel.data === "object") {
    console.log(
      "[ERPNext SSR webhook] data keys:",
      Object.keys(topLevel.data as object),
    );
  }

  const unwrapped = unwrapErpWebhookPayload(rawPayload) ?? topLevel;
  const companyRaw = unwrapped?.company;
  const company = typeof companyRaw === "string" ? companyRaw : "";
  console.log("[ERPNext SSR webhook] resolved company:", JSON.stringify(company));

  const instanceSecret = await resolveGrnWebhookInstanceSecret(company);
  if (
    !instanceSecret ||
    !instanceSecret.secret ||
    incomingSecret !== instanceSecret.secret
  ) {
    console.error("[ERPNext SSR webhook] Invalid or missing secret for company:", company);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = erpnextSupplierStockReturnWebhookSchema.safeParse(unwrapped);
  if (!parsed.success) {
    console.error("[ERPNext SSR webhook] Validation failed", parsed.error.flatten());
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await ingestSupplierStockReturnFromWebhook(parsed.data, rawPayload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

