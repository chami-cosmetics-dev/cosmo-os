import { NextRequest, NextResponse } from "next/server";

import { captureErpStockSnapshotsForAllCompanies } from "@/lib/item-trends/stock-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await captureErpStockSnapshotsForAllCompanies();
  return NextResponse.json(result);
}
