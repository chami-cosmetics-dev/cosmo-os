import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission("outlets.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, knownName: true, couponCodes: true },
  });

  return NextResponse.json({ users });
}
