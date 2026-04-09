import { NextResponse } from "next/server";
import type { RiderMobileSession } from "@prisma/client";
import { getRiderMobileSessionFromRequest } from "@/lib/mobile/auth";

export function mobileError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireRiderMobileSession(request: Request): Promise<
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getRiderMobileSessionFromRequest>>> }
  | { ok: false; response: NextResponse }
> {
  const session = await getRiderMobileSessionFromRequest(request);
  if (!session) {
    return {
      ok: false,
      response: mobileError("Unauthorized", 401),
    };
  }

  return { ok: true, session };
}

export function mobileSessionResponse(params: {
  token: string;
  session: Pick<RiderMobileSession, "expiresAt">;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    mobile: string | null;
    company?: { id: string; name: string } | null;
  };
}) {
  return NextResponse.json({
    accessToken: params.token,
    expiresAt: params.session.expiresAt.toISOString(),
    rider: {
      id: params.user.id,
      name: params.user.name,
      email: params.user.email,
      mobile: params.user.mobile,
      company: params.user.company ?? null,
    },
  });
}
