import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { emailSchema, limitSchema, LIMITS, pageSchema, trimmedString } from "@/lib/validation";

const createSupplierSchema = z.object({
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

export async function GET(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const pageResult = pageSchema.safeParse(request.nextUrl.searchParams.get("page"));
  const limitResult = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
  const page = pageResult.success ? pageResult.data : 1;
  const limit = limitResult.success ? limitResult.data : 10;
  const skip = (page - 1) * limit;

  const [total, suppliers] = await Promise.all([
    prisma.supplier.count({ where: { companyId } }),
    prisma.supplier.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
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
    }),
  ]);

  return NextResponse.json({ items: suppliers, total, page, limit });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

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

  const supplier = await prisma.supplier.create({
    data: {
      companyId,
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

  return NextResponse.json(supplier);
}
