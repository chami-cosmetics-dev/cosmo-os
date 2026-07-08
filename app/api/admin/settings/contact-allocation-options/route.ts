import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema, LIMITS, trimmedString } from "@/lib/validation";

const VALID_TYPES = [
  "serviceProvider",
  "district",
  "town",
  "origin",
  "customerType",
  "category",
] as const;

const createSchema = z.object({
  type: z.enum(VALID_TYPES),
  value: trimmedString(1, LIMITS.contactAllocationOptionValue.max),
});

const deleteManySchema = z.object({
  ids: z.array(cuidSchema).min(1).max(1000),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET() {
  const auth = await requirePermission("contacts.allocation.settings");
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

  const items = await prisma.contactAllocationOption.findMany({
    where: { companyId },
    orderBy: [{ type: "asc" }, { value: "asc" }],
    select: { id: true, type: true, value: true, createdAt: true },
  });

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("contacts.allocation.settings");
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.contactAllocationOption.findFirst({
    where: { companyId, type: parsed.data.type, value: parsed.data.value },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This option already exists" },
      { status: 409 }
    );
  }

  const item = await prisma.contactAllocationOption.create({
    data: {
      companyId,
      type: parsed.data.type,
      value: parsed.data.value,
    },
    select: { id: true, type: true, value: true, createdAt: true },
  });

  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermission("contacts.allocation.settings");
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
  const parsed = deleteManySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await prisma.contactAllocationOption.deleteMany({
    where: {
      companyId,
      id: { in: parsed.data.ids },
    },
  });

  return NextResponse.json({ success: true, deleted: result.count });
}
