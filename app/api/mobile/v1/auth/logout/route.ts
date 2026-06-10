import { NextRequest, NextResponse } from "next/server";

import { mobileError, requireRiderMobileSession } from "@/lib/mobile/api";
import { revokeRiderMobileSession } from "@/lib/mobile/auth";

export async function POST(request: NextRequest) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    await revokeRiderMobileSession(auth.session.id);
  } catch {
    return mobileError("Unable to revoke session", 500);
  }

  return NextResponse.json({ ok: true });
}
