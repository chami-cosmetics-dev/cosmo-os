import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const updateCompanySchema = z.object({
  name: trimmedString(1, LIMITS.companyName.max),
  logoUrl: z.string().url().max(LIMITS.logoUrl.max).optional().nullable(),
  faviconUrl: z.string().url().max(LIMITS.logoUrl.max).optional().nullable(),
  employeeSize: z.string().max(LIMITS.employeeSize.max).optional(),
  address: z.string().max(LIMITS.address.max).optional(),
});

export async function GET() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (!user?.companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      faviconUrl: true,
      employeeSize: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json(company);
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = auth.context!.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  if (!user?.companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const company = await prisma.company.update({
    where: { id: user.companyId },
    data: {
      name: parsed.data.name,
      ...(parsed.data.logoUrl !== undefined && { logoUrl: parsed.data.logoUrl }),
      ...(parsed.data.faviconUrl !== undefined && { faviconUrl: parsed.data.faviconUrl }),
      employeeSize: parsed.data.employeeSize?.trim() || null,
      address: parsed.data.address?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      faviconUrl: true,
      employeeSize: true,
      address: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(company);
}
