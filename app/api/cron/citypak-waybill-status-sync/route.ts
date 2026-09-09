import { NextRequest, NextResponse } from "next/server";

import { sweepCitypakWaybillStatuses } from "@/lib/citypak-waybill-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
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

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const result = await sweepCitypakWaybillStatuses(
    Number.isFinite(limitParam) && limitParam > 0 ? { limit: limitParam } : undefined
  );

  return NextResponse.json(result);
}
