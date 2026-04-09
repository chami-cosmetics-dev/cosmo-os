import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { shippingChargeUpdateSchema } from "@/lib/validation/manual-order";
import { cuidSchema } from "@/lib/validation";

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
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

  const { id: locationId, chargeId } = await params;
  const locResult = cuidSchema.safeParse(locationId);
  const chargeResult = cuidSchema.safeParse(chargeId);
  if (!locResult.success || !chargeResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existing = await prisma.shippingChargeOption.findFirst({
    where: {
      id: chargeResult.data,
      companyId,
      companyLocationId: locResult.data,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Shipping charge not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = shippingChargeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({
      id: existing.id,
      label: existing.label,
      amount: existing.amount.toString(),
      sortOrder: existing.sortOrder,
      createdAt: existing.createdAt.toISOString(),
      updatedAt: existing.updatedAt.toISOString(),
    });
  }

  try {
    const updated = await prisma.shippingChargeOption.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.label !== undefined && { label: parsed.data.label }),
        ...(parsed.data.amount !== undefined && { amount: parsed.data.amount }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      },
    });
    return NextResponse.json({
      id: updated.id,
      label: updated.label,
      amount: updated.amount.toString(),
      sortOrder: updated.sortOrder,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "A shipping option with this label already exists for this location" },
        { status: 400 }
      );
    }
    throw e;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
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

  const { id: locationId, chargeId } = await params;
  const locResult = cuidSchema.safeParse(locationId);
  const chargeResult = cuidSchema.safeParse(chargeId);
  if (!locResult.success || !chargeResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existing = await prisma.shippingChargeOption.findFirst({
    where: {
      id: chargeResult.data,
      companyId,
      companyLocationId: locResult.data,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Shipping charge not found" }, { status: 404 });
  }

  await prisma.shippingChargeOption.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
}
