import { NextResponse } from "next/server";
import { z } from "zod";

import { sendInviteEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { generateInviteToken, getInviteExpiresAt } from "@/lib/invite-utils";
import { emailSchema, inviteTokenSchema } from "@/lib/validation";

const resendSchema = z.object({
  email: emailSchema.optional(),
  token: inviteTokenSchema.optional(),
});

export async function POST(request: Request) {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  const body = await request.json().catch(() => ({}));
  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "email or token is required" },
      { status: 400 }
    );
  }

  if (!parsed.data.email && !parsed.data.token) {
    return NextResponse.json(
      { error: "email or token is required" },
      { status: 400 }
    );
  }

  const userCount = await prisma.user.count();

  let invite;
  if (parsed.data.token) {
    invite = await prisma.invite.findUnique({
      where: { token: parsed.data.token },
      include: { role: true },
    });
  } else if (parsed.data.email) {
    invite = await prisma.invite.findFirst({
      where: { email: parsed.data.email },
      orderBy: { createdAt: "desc" },
      include: { role: true },
    });
  }

  if (!invite) {
    return NextResponse.json(
      { error: "No invite found for this email or token" },
      { status: 404 }
    );
  }

  if (invite.usedAt) {
    return NextResponse.json(
      { error: "This invite has already been used" },
      { status: 400 }
    );
  }

  if (userCount > 0) {
    const auth = await requirePermission("users.manage");
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
  }

  const newToken = generateInviteToken();
  const expiresAt = getInviteExpiresAt();

  await prisma.invite.update({
    where: { id: invite.id },
    data: { token: newToken, expiresAt },
  });

  const activationUrl = `${baseUrl}/invite/activate?token=${newToken}`;
  const result = await sendInviteEmail(invite.email, activationUrl);

  if (!result.success) {
    return NextResponse.json(
      { error: result.message ?? "Failed to send invite email" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
