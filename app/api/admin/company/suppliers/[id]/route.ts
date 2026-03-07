import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, emailSchema, LIMITS, trimmedString } from "@/lib/validation";

const updateSupplierSchema = z.object({
  name: trimmedString(1, LIMITS.supplierName.max),
  code: trimmedString(1, LIMITS.supplierCode.max),
  contactNumber: z
    .string()
    .max(LIMITS.supplierContactNumber.max)
    .optional()
    .or(z.literal(""))
    .transform((s) => (s && String(s).trim() ? String(s).trim() : null)),
  email: z
    .union([emailSchema, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v)),
  address: z
    .string()
    .max(LIMITS.supplierAddress.max)
    .optional()
    .or(z.literal(""))
    .transform((s) => (s && String(s).trim() ? String(s).trim() : null)),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function PATCH(
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

  const body = await request.json().catch(() => ({}));
  const parsed = updateSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: idResult.data, companyId },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  if (parsed.data.code !== supplier.code) {
    const existing = await prisma.supplier.findFirst({
      where: {
        companyId,
        code: parsed.data.code,
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A supplier with this code already exists" },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.supplier.update({
    where: { id: idResult.data },
    data: {
      name: parsed.data.name,
      code: parsed.data.code,
      contactNumber: parsed.data.contactNumber ?? null,
      email: parsed.data.email ?? null,
      address: parsed.data.address ?? null,
    },
    select: {
      id: true,
      name: true,
      code: true,
      contactNumber: true,
      email: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
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

  const supplier = await prisma.supplier.findFirst({
    where: { id: idResult.data, companyId },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  await prisma.supplier.delete({
    where: { id: idResult.data },
  });

  return NextResponse.json({ success: true });
}
