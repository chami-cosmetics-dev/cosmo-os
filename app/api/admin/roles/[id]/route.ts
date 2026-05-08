import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission, toSafeRoleName } from "@/lib/rbac";
import {
  cuidSchema,
  isReservedRoleName,
  LIMITS,
  trimmedString,
} from "@/lib/validation";

const updateRoleSchema = z.object({
  name: trimmedString(2, LIMITS.roleName.max),
  description: z.string().max(LIMITS.description.max).optional(),
  permissionKeys: z
    .array(z.string().max(LIMITS.permissionKey.max))
    .max(50)
    .default([]),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("roles.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const role = await prisma.role.findUnique({
    where: { id: idParsed.data },
    include: { rolePermissions: { include: { permission: true } } },
  });
  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const safeName = toSafeRoleName(parsed.data.name);
  if (!safeName) {
    return NextResponse.json(
      { error: "Role name must include letters or numbers" },
      { status: 400 }
    );
  }

  const isReserved = role.name === "admin" || role.name === "super_admin";
  if (isReserved && safeName !== role.name) {
    return NextResponse.json(
      { error: "Reserved role names cannot be changed" },
      { status: 403 }
    );
  }
  if (!isReserved && isReservedRoleName(safeName)) {
    return NextResponse.json(
      { error: "This role name is reserved" },
      { status: 403 }
    );
  }

  const uniquePermissionKeys = Array.from(new Set(parsed.data.permissionKeys));
  const permissions = await prisma.permission.findMany({
    where: { key: { in: uniquePermissionKeys } },
    select: { id: true },
  });
  const permissionIds = permissions.map((p) => p.id);

  await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id: idParsed.data },
      data: {
        name: safeName,
        description: parsed.data.description?.trim() || null,
      },
    });
    await tx.rolePermission.deleteMany({
      where: { roleId: idParsed.data },
    });
    if (permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: idParsed.data,
          permissionId,
        })),
      });
    }
  });

  const updatedRole = await prisma.role.findUnique({
    where: { id: idParsed.data },
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { userRoles: true } },
    },
  });

  return NextResponse.json(updatedRole);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("roles.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const role = await prisma.role.findUnique({
      where: { id: idParsed.data },
      select: { id: true, name: true },
    });

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (role.name === "admin" || role.name === "super_admin") {
      return NextResponse.json(
        { error: "This role cannot be deleted" },
        { status: 403 }
      );
    }

    await prisma.role.delete({
      where: { id: idParsed.data },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/admin/roles/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete role" },
      { status: 500 }
    );
  }
}
