import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { deleteAuth0User } from "@/lib/auth0-management";
import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const patchBodySchema = z.object({
  companyId: z.string().cuid().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const roleNames = auth.context!.roleNames as string[];
  if (!roleNames.includes("super_admin")) {
    return NextResponse.json({ error: "Only super admins can assign companies" }, { status: 403 });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: idParsed.data },
    select: { id: true, name: true, email: true, companyId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (parsed.data.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: parsed.data.companyId },
      select: { id: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { companyId: parsed.data.companyId },
    select: { id: true, companyId: true, company: { select: { id: true, name: true } } },
  });

  await writeAuditLog({
    companyId: parsed.data.companyId,
    actorUserId: auth.context!.user?.id,
    module: "users",
    action: "user_company_assigned",
    entityType: "User",
    entityId: user.id,
    summary: `Assigned user ${user.email ?? user.name ?? user.id} to company ${parsed.data.companyId ?? "none"}`,
    beforeData: { companyId: user.companyId },
    afterData: { companyId: parsed.data.companyId },
  });

  return NextResponse.json({ ok: true, user: updated });
}

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
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: idParsed.data },
    include: {
      userRoles: { include: { role: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const isSuperAdmin = user.userRoles.some(
    (ur) => ur.role.name === "super_admin"
  );
  if (isSuperAdmin) {
    return NextResponse.json(
      { error: "Cannot remove the Super Admin" },
      { status: 403 }
    );
  }

  try {
    await deleteAuth0User(user.auth0Id);
  } catch (error) {
    console.error("Failed to delete user from Auth0:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete user from Auth0",
      },
      { status: 500 }
    );
  }

  await prisma.user.delete({
    where: { id: idParsed.data },
  });

  await writeAuditLog({
    companyId: user.companyId,
    actorUserId: auth.context!.user?.id,
    module: "users",
    action: "user_deleted",
    entityType: "User",
    entityId: user.id,
    summary: `Deleted user ${user.email ?? user.name ?? user.id}`,
    beforeData: {
      name: user.name,
      email: user.email,
      roleNames: user.userRoles.map((userRole) => userRole.role.name),
    },
  });

  return NextResponse.json({ success: true });
}
