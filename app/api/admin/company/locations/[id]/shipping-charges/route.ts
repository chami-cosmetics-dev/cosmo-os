import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { shippingChargeCreateSchema } from "@/lib/validation/manual-order";
import { cuidSchema } from "@/lib/validation";

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

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const location = await prisma.companyLocation.findFirst({
    where: { id: idResult.data, companyId },
    select: { id: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const items = await prisma.shippingChargeOption.findMany({
    where: { companyLocationId: location.id },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return NextResponse.json({
    shippingCharges: items.map((s) => ({
      id: s.id,
      label: s.label,
      amount: s.amount.toString(),
      sortOrder: s.sortOrder,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("settings.company");
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

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const location = await prisma.companyLocation.findFirst({
    where: { id: idResult.data, companyId },
    select: { id: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = shippingChargeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.shippingChargeOption.create({
      data: {
        companyId,
        companyLocationId: location.id,
        label: parsed.data.label,
        amount: parsed.data.amount,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    return NextResponse.json({
      id: created.id,
      label: created.label,
      amount: created.amount.toString(),
      sortOrder: created.sortOrder,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "A shipping option with this label already exists for this location" },
        { status: 400 }
      );
    }
    throw e;
  }
}
