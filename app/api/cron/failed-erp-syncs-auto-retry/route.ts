import { NextRequest, NextResponse } from "next/server";

import { runDueFailedErpSyncRetries } from "@/lib/failed-erp-sync-auto-retry";
import {
  runDueFailedErpPeSyncRetries,
  scheduleUnscheduledFailedErpPeSyncs,
} from "@/lib/failed-erp-pe-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const siResult = await runDueFailedErpSyncRetries({ limit: 25 });
  await scheduleUnscheduledFailedErpPeSyncs(undefined, 50);
  const peResult = await runDueFailedErpPeSyncRetries({ limit: 25 });

  return NextResponse.json({
    ok: true,
    ...siResult,
    salesInvoice: siResult,
    paymentEntry: peResult,
  });
}
