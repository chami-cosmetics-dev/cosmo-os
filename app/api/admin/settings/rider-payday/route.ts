import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { riderPaydayUpdateSchema } from "@/lib/validation";

const SINGLETON_KEY = "default";

async function getPaydayConfig() {
  return prisma.riderPayPeriodConfig.findUnique({
    where: { singletonKey: SINGLETON_KEY },
    select: { paydayDayOfMonth: true },
  });
}

export async function GET() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const config = await getPaydayConfig();
  return NextResponse.json({
    paydayDayOfMonth: config?.paydayDayOfMonth ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = riderPaydayUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "paydayDayOfMonth must be 1–31 or null" }, { status: 400 });
  }

  const userId = auth.context!.user?.id ?? null;
  const config = await prisma.riderPayPeriodConfig.upsert({
    where: { singletonKey: SINGLETON_KEY },
    create: {
      singletonKey: SINGLETON_KEY,
      paydayDayOfMonth: parsed.data.paydayDayOfMonth,
      updatedById: userId,
    },
    update: {
      paydayDayOfMonth: parsed.data.paydayDayOfMonth,
      updatedById: userId,
    },
    select: { paydayDayOfMonth: true },
  });

  return NextResponse.json({
    paydayDayOfMonth: config.paydayDayOfMonth,
  });
}
