import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

/**
 * Cancel (delete) a pending invite.
 */
export async function DELETE(
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
    select: { id: true, companyId: true, usedAt: true, email: true, roleId: true },
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

  if (!isSuperAdmin && invite.companyId !== userCompanyId) {
    return NextResponse.json(
      { error: "You do not have permission to cancel this invite" },
      { status: 403 }
    );
  }

  await prisma.invite.delete({
    where: { id: invite.id },
  });

  await writeAuditLog({
    companyId: invite.companyId,
    actorUserId: auth.context!.user?.id,
    module: "users",
    action: "invite_cancelled",
    entityType: "Invite",
    entityId: invite.id,
    summary: `Cancelled invite for ${invite.email}`,
    beforeData: {
      email: invite.email,
      roleId: invite.roleId,
    },
  });

  return NextResponse.json({ success: true });
}
