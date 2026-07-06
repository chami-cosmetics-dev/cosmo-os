import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; warehouseId: string }> }
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const { id: locationId, warehouseId } = await params;
  if (!cuidSchema.safeParse(locationId).success || !cuidSchema.safeParse(warehouseId).success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existing = await prisma.companyLocationWarehouse.findFirst({
    where: { id: warehouseId, companyId, companyLocationId: locationId },
  });
  if (!existing) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });

  await prisma.companyLocationWarehouse.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
}
