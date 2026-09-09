import { NextRequest, NextResponse } from "next/server";

import { applyCitypakPushUpdate } from "@/lib/citypak-waybill-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * CityPak Push API → Cosmo.
 *
 * CityPak setup (via account coordinator): Push Endpoint URL =
 * POST {APP_URL}/api/webhooks/citypak/status, with an optional custom header
 * carrying the shared secret. CityPak POSTs one scan per delivery event:
 *   { tracking_number, reference, item_id, status_type, status, action_datetime }
 * DELIVERED sends `delivered_datetime`; NOT DELIVERED adds `reason`.
 *
 * Auth: if CITYPAK_PUSH_SECRET is set we require it on the x-citypak-secret
 * header; CityPak's push key is optional, so an unset secret accepts all calls.
 */
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CITYPAK_PUSH_SECRET?.trim();
  if (expectedSecret) {
    const provided =
      request.headers.get("x-citypak-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await applyCitypakPushUpdate({ payload });
  if (!result.ok) {
    // 200 so CityPak does not retry forever on an unknown tracking number.
    return NextResponse.json({ ok: false, message: result.error });
  }

  return NextResponse.json({ ok: true, matched: result.matched, status: result.status });
}
