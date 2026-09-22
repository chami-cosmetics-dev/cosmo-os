import { NextRequest, NextResponse } from "next/server";

import { refreshAllCompaniesPurchaseSummaries } from "@/lib/contacts/purchase-summary-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/** Nightly rebuild of Contact Master purchase-summary cache (export reads cache). */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshAllCompaniesPurchaseSummaries();
  return NextResponse.json({ ok: result.errors.length === 0, ...result });
}
