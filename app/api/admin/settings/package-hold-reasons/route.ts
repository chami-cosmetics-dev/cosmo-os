import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { LIMITS, trimmedString } from "@/lib/validation";

const createSchema = z.object({
  name: trimmedString(1, LIMITS.packageHoldReasonName.max),
});

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

export async function GET() {
  const auth = await requirePermission("settings.fulfillment");
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

  const reasons = await prisma.packageHoldReason.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdAt: true },
  });

  return NextResponse.json(reasons);
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("settings.fulfillment");
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

  const reason = await prisma.packageHoldReason.create({
    data: { companyId, name: parsed.data.name },
    select: { id: true, name: true, createdAt: true },
  });

  return NextResponse.json(reason);
}
