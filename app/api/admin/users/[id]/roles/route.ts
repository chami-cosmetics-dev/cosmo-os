import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const updateUserRolesSchema = z.object({
  roleIds: z.array(cuidSchema).max(20).default([]),
});

export async function PUT(
  request: NextRequest,
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

  try {
    const body = await request.json();
    const parsed = updateUserRolesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: idParsed.data },
      include: { userRoles: { include: { role: true } } },
    });
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const uniqueRoleIds = Array.from(new Set(parsed.data.roleIds));
    const requestedRoles = await prisma.role.findMany({
      where: { id: { in: uniqueRoleIds } },
      select: { id: true, name: true },
    });

    const superAdminRequested = requestedRoles.find(
      (r) => r.name === "super_admin"
    );
    const userIsSuperAdmin = existingUser.userRoles.some(
      (ur) => ur.role.name === "super_admin"
    );

    if (superAdminRequested && !userIsSuperAdmin) {
      return NextResponse.json(
        { error: "Super Admin role cannot be assigned" },
        { status: 403 }
      );
    }

    let validRoleIds = requestedRoles
      .filter((r) => r.name !== "super_admin")
      .map((r) => r.id);

    if (userIsSuperAdmin) {
      const superAdminRole = await prisma.role.findUnique({
        where: { name: "super_admin" },
        select: { id: true },
      });
      if (superAdminRole && !validRoleIds.includes(superAdminRole.id)) {
        validRoleIds = [...validRoleIds, superAdminRole.id];
      }
    }

    await prisma.$transaction(async (tx) => {
      if (validRoleIds.length === 0) {
        await tx.userRole.deleteMany({
          where: { userId: idParsed.data },
        });
      } else {
        await tx.userRole.deleteMany({
          where: {
            userId: idParsed.data,
            roleId: {
              notIn: validRoleIds,
            },
          },
        });

        await tx.userRole.createMany({
          data: validRoleIds.map((roleId) => ({
            userId: idParsed.data,
            roleId,
          })),
          skipDuplicates: true,
        });
      }
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: idParsed.data },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("PUT /api/admin/users/[id]/roles error:", error);
    return NextResponse.json(
      { error: "Failed to update user roles" },
      { status: 500 }
    );
  }
}
