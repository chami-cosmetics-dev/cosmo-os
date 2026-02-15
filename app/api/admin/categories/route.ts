import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const createCategorySchema = z.object({
  name: trimmedString(1, LIMITS.categoryName.max),
  fullName: z.string().max(LIMITS.categoryFullName.max).optional(),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET() {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const categories = await prisma.category.findMany({
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
  });

  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("products.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const category = await prisma.category.create({
    data: {
      companyId,
      name: parsed.data.name,
      fullName: parsed.data.fullName?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      fullName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(category, { status: 201 });
}
