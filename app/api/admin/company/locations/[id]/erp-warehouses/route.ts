import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

const createSchema = z.object({
  warehouse: z.string().min(1, "Warehouse name is required").max(140),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const { id } = await params;
  if (!cuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const location = await prisma.companyLocation.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const warehouses = await prisma.companyLocationWarehouse.findMany({
    where: { companyLocationId: location.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, warehouse: true, createdAt: true },
  });

  return NextResponse.json({ warehouses });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });

  const { id } = await params;
  if (!cuidSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const location = await prisma.companyLocation.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors.warehouse?.[0] ?? "Validation failed" }, { status: 400 });

  try {
    const created = await prisma.companyLocationWarehouse.create({
      data: { companyId, companyLocationId: location.id, warehouse: parsed.data.warehouse.trim() },
      select: { id: true, warehouse: true, createdAt: true },
    });
    return NextResponse.json(created);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "This warehouse is already added to this location" }, { status: 400 });
    }
    throw e;
  }
}
