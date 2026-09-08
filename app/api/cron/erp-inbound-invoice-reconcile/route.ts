import { NextRequest, NextResponse } from "next/server";

import { reconcileMissingErpInboundInvoices } from "@/lib/erp-inbound-invoice-reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reconcileMissingErpInboundInvoices();
  return NextResponse.json({ ok: true, ...result });
}
