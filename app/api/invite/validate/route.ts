import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { inviteTokenSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const parsed = inviteTokenSchema.safeParse(token ?? "");
  if (!parsed.success) {
    return NextResponse.json(
      { valid: false, error: "Invalid token format" },
      { status: 400 }
    );
  }

  const invite = await prisma.invite.findUnique({
    where: { token: parsed.data },
    select: { email: true, expiresAt: true, usedAt: true, isSuperAdmin: true },
  });

  if (!invite) {
    return NextResponse.json({ valid: false, error: "Invalid token" });
  }

  if (invite.usedAt) {
    return NextResponse.json({ valid: false, error: "Invite already used" });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ valid: false, error: "Invite expired" });
  }

  return NextResponse.json({
    valid: true,
    email: invite.email,
    isSuperAdmin: invite.isSuperAdmin,
  });
}
