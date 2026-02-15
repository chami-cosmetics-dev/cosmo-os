import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission, toSafeRoleName } from "@/lib/rbac";
import {
  isReservedRoleName,
  LIMITS,
  trimmedString,
} from "@/lib/validation";

const createRoleSchema = z.object({
  name: trimmedString(2, LIMITS.roleName.max),
  description: z.string().max(LIMITS.description.max).optional(),
  permissionKeys: z
    .array(z.string().max(LIMITS.permissionKey.max))
    .max(50)
    .default([]),
});

export async function POST(request: NextRequest) {
  const auth = await requirePermission("roles.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const parsed = createRoleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const safeName = toSafeRoleName(parsed.data.name);
    if (!safeName) {
      return NextResponse.json(
        { error: "Role name must include letters or numbers" },
        { status: 400 }
      );
    }
    if (isReservedRoleName(safeName)) {
      return NextResponse.json(
        { error: "This role name is reserved" },
        { status: 403 }
      );
    }

    const role = await prisma.role.create({
      data: {
        name: safeName,
        description: parsed.data.description?.trim() || null,
      },
    });

    const uniquePermissionKeys = Array.from(new Set(parsed.data.permissionKeys));
    if (uniquePermissionKeys.length > 0) {
      const permissions = await prisma.permission.findMany({
        where: { key: { in: uniquePermissionKeys } },
        select: { id: true },
      });

      if (permissions.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    const createdRole = await prisma.role.findUnique({
      where: { id: role.id },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return NextResponse.json(createdRole, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/roles error:", error);
    return NextResponse.json(
      { error: "Failed to create role. Name may already exist." },
      { status: 500 }
    );
  }
}
