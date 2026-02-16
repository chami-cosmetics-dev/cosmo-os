import { NextResponse } from "next/server";

import { sendInviteEmail } from "@/lib/maileroo";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { generateInviteToken, getInviteExpiresAt } from "@/lib/invite-utils";
import { cuidSchema } from "@/lib/validation";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid invite ID" }, { status: 400 });
  }

  const roleNames = auth.context!.roleNames as string[];
  const isSuperAdmin = roleNames.includes("super_admin");
  const userCompanyId = auth.context!.user?.companyId ?? null;

  const invite = await prisma.invite.findUnique({
    where: { id: idParsed.data },
    select: {
      id: true,
      email: true,
      companyId: true,
      usedAt: true,
      expiresAt: true,
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.usedAt) {
    return NextResponse.json(
      { error: "This invite has already been used" },
      { status: 400 }
    );
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This invite has expired" },
      { status: 400 }
    );
  }

  if (!isSuperAdmin && invite.companyId !== userCompanyId) {
    return NextResponse.json(
      { error: "You do not have permission to resend this invite" },
      { status: 403 }
    );
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
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
