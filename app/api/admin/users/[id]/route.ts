import { NextResponse } from "next/server";

import { deleteAuth0User } from "@/lib/auth0-management";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

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

  return NextResponse.json({ success: true });
}
