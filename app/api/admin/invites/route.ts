import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

/**
 * Returns pending invites for the current user's context.
 * Super admins see all pending invites; company admins see only their company's invites.
 */
export async function GET() {
  const auth = await requirePermission("users.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = auth.context!;
  const roleNames = context.roleNames as string[];
  const isSuperAdmin = roleNames.includes("super_admin");

  let companyId: string | null = null;
  if (!isSuperAdmin && context.user?.companyId) {
    companyId = context.user.companyId;
  }

  const invites = await prisma.invite.findMany({
    where: {
      usedAt: null,
      expiresAt: { gt: new Date() },
      ...(companyId !== null ? { companyId } : {}),
    },
    include: {
      role: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invites });
}
