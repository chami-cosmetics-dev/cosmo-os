import { NextRequest, NextResponse } from "next/server";

import { requireRiderMobileSession } from "@/lib/mobile/api";

export async function GET(request: NextRequest) {
  const auth = await requireRiderMobileSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { user } = auth.session;

  return NextResponse.json({
    rider: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      company: user.company
        ? {
            id: user.company.id,
            name: user.company.name,
          }
        : null,
    },
    session: {
      expiresAt: auth.session.expiresAt.toISOString(),
      lastUsedAt: auth.session.lastUsedAt?.toISOString() ?? null,
    },
  });
}
