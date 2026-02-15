import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  const companyId = user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const [vendors, categories] = await Promise.all([
    prisma.vendor.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { productItems: true } },
      },
    }),
    prisma.category.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        fullName: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { productItems: true } },
      },
    }),
  ]);

  return NextResponse.json({ vendors, categories });
}
