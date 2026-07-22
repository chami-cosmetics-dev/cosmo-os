import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("products.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const item = await prisma.productItem.findFirst({
    where: { id: idResult.data, companyId },
    include: {
      vendor: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, fullName: true } },
      companyLocation: { select: { id: true, name: true, shopifyLocationId: true } },
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

/** Manual status edit removed — priorities sync from ERP. */
export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "Item status is no longer editable. Product Priority syncs from ERP1/ERP2 on the Items page.",
    },
    { status: 410 },
  );
}
